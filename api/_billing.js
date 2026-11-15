// Glint Pro billing, on Stripe Checkout with Managed Payments (Stripe is the
// merchant of record: it sells to the customer and handles tax). Four routes of
// the one account function (api/account.js):
//
//   POST ?op=checkout  start a subscription checkout for the signed-in person
//   POST ?op=confirm   the person is back from checkout: bring the plan up to date
//   POST ?op=portal    open Stripe's billing portal (cancel, change card)
//   POST ?op=webhook   Stripe telling us a subscription changed
//
// Nothing here trusts what it is sent. The webhook body is only used for its
// event id: the event is then fetched from Stripe with our own key, and the
// subscription it points at is fetched again, so the row we store is always
// Stripe's current state. A made-up or replayed call can at most make us
// re-read a real subscription. (This also means no raw request body and no
// signing secret are needed.)
//
// Billing is on when the deployment has STRIPE_SECRET_KEY and STRIPE_PRICE_ID
// on top of what accounts need. There is no Stripe package: plain HTTPS.

import { ApiError, parseBody } from './_shared.js';
import { accountConfig, memoryAccounts, readBearer, runSql, unavailable, useBilling, userFromToken } from './_account.js';

const STRIPE = 'https://api.stripe.com';
// A version new enough for managed_payments on Checkout Sessions. From
// 2025-03-31 a subscription's period lives on its items.
const DEFAULT_API_VERSION = '2026-10-28.endive';
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function billingConfig() {
  const account = accountConfig();
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const priceId = process.env.STRIPE_PRICE_ID || '';
  return {
    account,
    secretKey,
    priceId,
    apiVersion: process.env.STRIPE_API_VERSION || DEFAULT_API_VERSION,
    // Off only for an account that sells directly instead of through Stripe.
    managed: process.env.STRIPE_MANAGED_PAYMENTS !== '0',
    priceLabel: String(process.env.PRO_PRICE_LABEL || '').slice(0, 40),
    enabled: Boolean(account.enabled && secretKey && /^price_[A-Za-z0-9]+$/.test(priceId)),
  };
}

// ── Stripe over HTTPS ────────────────────────────────────────────────────────

class StripeError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

async function stripe(cfg, method, path, params) {
  const headers = { Authorization: `Bearer ${cfg.secretKey}`, 'Stripe-Version': cfg.apiVersion };
  let body;
  if (params) {
    body = new URLSearchParams(params).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  let response;
  try {
    response = await fetch(STRIPE + path, { method, headers, body });
  } catch (e) {
    throw new StripeError(0, e.message);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new StripeError(response.status, (data.error && data.error.message) || 'Stripe request failed', data.error && data.error.code);
  return data;
}

// ── the subscriptions table ──────────────────────────────────────────────────

const iso = (seconds) => (typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);

// What we keep from a Stripe subscription. Only a paid-up subscription carries
// an end date: the credits function treats a future end date as "still Pro",
// which must not happen for one that never got paid or was refunded and ended.
export function rowFromSubscription(sub) {
  const status = typeof sub.status === 'string' ? sub.status.slice(0, 40) : 'incomplete';
  const item = sub.items && Array.isArray(sub.items.data) ? sub.items.data[0] : null;
  const periodEnd = (item && item.current_period_end) || sub.current_period_end;
  let end = null;
  if (status === 'active' || status === 'trialing') end = iso(periodEnd);
  else if (status === 'canceled') end = iso(sub.ended_at || sub.canceled_at) || new Date().toISOString();
  return {
    plan: 'pro',
    status,
    current_period_end: end,
    provider: 'stripe',
    provider_customer_id: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null,
    provider_subscription_id: sub.id,
  };
}

const isLive = (status) => status === 'active' || status === 'trialing';

// An older subscription's news must not overwrite a newer, live one.
const UPSERT = `insert into subscriptions
    (user_id, plan, status, current_period_end, provider, provider_customer_id, provider_subscription_id, updated_at)
  values ($1, $2, $3, $4, $5, $6, $7, now())
  on conflict (user_id) do update set
    plan = excluded.plan, status = excluded.status, current_period_end = excluded.current_period_end,
    provider = excluded.provider, provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id, updated_at = now()
  where subscriptions.provider_subscription_id is null
     or subscriptions.provider_subscription_id = excluded.provider_subscription_id
     or excluded.status in ('active', 'trialing')
     or subscriptions.status not in ('active', 'trialing')`;
const UPDATE_BY_SUBSCRIPTION = `update subscriptions set status = $2, current_period_end = $3, updated_at = now()
  where provider_subscription_id = $1`;
const READ = 'select status, current_period_end, provider_customer_id, provider_subscription_id from subscriptions where user_id = $1';

async function saveRow(cfg, userId, row) {
  if (cfg.memory) {
    const { subs } = memoryAccounts();
    if (userId) {
      const old = subs.get(userId);
      const keep = old && old.provider_subscription_id && old.provider_subscription_id !== row.provider_subscription_id
        && isLive(old.status) && !isLive(row.status);
      if (!keep) subs.set(userId, { ...row });
    } else {
      for (const old of subs.values()) {
        if (old.provider_subscription_id === row.provider_subscription_id) Object.assign(old, { status: row.status, current_period_end: row.current_period_end });
      }
    }
    return;
  }
  if (userId) {
    await runSql(cfg, UPSERT, [userId, row.plan, row.status, row.current_period_end, row.provider, row.provider_customer_id, row.provider_subscription_id]);
  } else {
    await runSql(cfg, UPDATE_BY_SUBSCRIPTION, [row.provider_subscription_id, row.status, row.current_period_end]);
  }
}

async function readRow(cfg, userId) {
  if (cfg.memory) return memoryAccounts().subs.get(userId) || null;
  return (await runSql(cfg, READ, [userId]))[0] || null;
}

// Fetch the subscription from Stripe and store what it says now. `userHint`
// is who we already know it belongs to; otherwise its own metadata says.
async function syncSubscription(cfg, subscriptionId, userHint = '') {
  if (!/^sub_[A-Za-z0-9]+$/.test(String(subscriptionId || ''))) return null;
  const sub = await stripe(cfg, 'GET', `/v1/subscriptions/${subscriptionId}`);
  const tagged = sub.metadata && typeof sub.metadata.glint_user === 'string' ? sub.metadata.glint_user : '';
  const userId = USER_ID.test(userHint) ? userHint : (USER_ID.test(tagged) ? tagged : '');
  const row = rowFromSubscription(sub);
  await saveRow(cfg.account, userId, row);
  return row;
}

// ── what `me` reports ────────────────────────────────────────────────────────

useBilling({
  info() {
    const cfg = billingConfig();
    return cfg.enabled ? { billing: true, ...(cfg.priceLabel ? { priceLabel: cfg.priceLabel } : {}) } : { billing: false };
  },
  async summary(accountCfg, userId) {
    let row;
    try { row = await readRow(accountCfg, userId); } catch (e) { console.error('[billing] could not read a subscription:', e.message); return null; }
    if (!row) return null;
    return { status: row.status, canManage: Boolean(row.provider_customer_id) };
  },
});

// ── routes ───────────────────────────────────────────────────────────────────

function fail(res, e) {
  if (e instanceof ApiError) {
    res.status(e.status).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
    return;
  }
  if (e instanceof StripeError) {
    console.error('[billing] Stripe said:', e.status, e.code || '', e.message);
    res.status(502).json({ error: 'The payment service did not answer as expected. Try again in a moment.' });
    return;
  }
  console.error('[billing]', e);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
}

function coded(status, code, message) {
  const e = new ApiError(status, message);
  e.code = code;
  return e;
}

async function signedIn(req) {
  if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
  const cfg = billingConfig();
  if (!cfg.enabled) throw new ApiError(501, 'Glint Pro is not on sale on this copy of Glint.');
  const user = await userFromToken(cfg.account, readBearer(req));
  if (!user) throw coded(401, 'sign_in', 'Sign in first.');
  return { cfg, user };
}

// Where Stripe sends the person back to: this same site.
function siteOrigin(req) {
  const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) throw new ApiError(400, 'Bad request');
  return `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https'}://${host}`;
}

export async function checkout(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await signedIn(req);
    const row = await readRow(cfg.account, user.id).catch(() => { throw unavailable(); });
    if (row && isLive(row.status)) throw coded(409, 'already_pro', 'You are already on Glint Pro.');
    const origin = siteOrigin(req);
    const params = {
      mode: 'subscription',
      'line_items[0][price]': cfg.priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      'metadata[glint_user]': user.id,
      'subscription_data[metadata][glint_user]': user.id,
      success_url: `${origin}/editor/?pro=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/editor/?pro=cancel`,
    };
    if (cfg.managed) params['managed_payments[enabled]'] = 'true';
    // Someone who subscribed before keeps one customer record at Stripe.
    if (row && /^cus_[A-Za-z0-9]+$/.test(String(row.provider_customer_id || ''))) params.customer = row.provider_customer_id;
    const session = await stripe(cfg, 'POST', '/v1/checkout/sessions', params);
    if (!session.url) throw new StripeError(502, 'Checkout session has no url');
    res.status(200).json({ url: session.url });
  } catch (e) {
    fail(res, e);
  }
}

export async function confirm(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await signedIn(req);
    const id = String(parseBody(req).session_id || '');
    if (!/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(id)) throw new ApiError(400, 'Bad request');
    let session;
    try {
      session = await stripe(cfg, 'GET', `/v1/checkout/sessions/${id}`);
    } catch (e) {
      if (e instanceof StripeError && e.status === 404) throw new ApiError(404, 'That checkout was not found.');
      throw e;
    }
    // Only the person who started this checkout can claim it.
    if (session.client_reference_id !== user.id) throw new ApiError(404, 'That checkout was not found.');
    if (session.status !== 'complete' || !session.subscription) {
      res.status(200).json({ plan: 'free', pending: true });
      return;
    }
    const row = await syncSubscription(cfg, typeof session.subscription === 'string' ? session.subscription : session.subscription.id, user.id);
    res.status(200).json({ plan: row && isLive(row.status) ? 'pro' : 'free', pending: !(row && isLive(row.status)) });
  } catch (e) {
    fail(res, e);
  }
}

export async function portal(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await signedIn(req);
    const row = await readRow(cfg.account, user.id).catch(() => { throw unavailable(); });
    const customer = row && String(row.provider_customer_id || '');
    if (!customer || !/^cus_[A-Za-z0-9]+$/.test(customer)) throw new ApiError(404, 'There is no subscription to manage on this account.');
    const session = await stripe(cfg, 'POST', '/v1/billing_portal/sessions', { customer, return_url: `${siteOrigin(req)}/editor/` });
    if (!session.url) throw new StripeError(502, 'Portal session has no url');
    res.status(200).json({ url: session.url });
  } catch (e) {
    fail(res, e);
  }
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
]);

export async function webhook(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = billingConfig();
    if (!cfg.enabled) throw new ApiError(501, 'Billing is not set up.');
    let claimed;
    try { claimed = parseBody(req); } catch (e) { claimed = {}; }
    const id = claimed && typeof claimed.id === 'string' ? claimed.id : '';
    if (!/^evt_[A-Za-z0-9]{8,200}$/.test(id)) throw new ApiError(400, 'Bad request');
    let event;
    try {
      event = await stripe(cfg, 'GET', `/v1/events/${id}`);
    } catch (e) {
      // Not one of ours: say so plainly, without retries.
      if (e instanceof StripeError && e.status === 404) throw new ApiError(400, 'Unknown event');
      throw e;
    }
    const object = (event.data && event.data.object) || {};
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const subscription = typeof object.subscription === 'string' ? object.subscription : object.subscription && object.subscription.id;
      const user = typeof object.client_reference_id === 'string' ? object.client_reference_id : '';
      if (subscription) await syncSubscription(cfg, subscription, user);
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      await syncSubscription(cfg, object.id);
    }
    res.status(200).json({ received: true });
  } catch (e) {
    // Anything but a plain "bad request" is worth Stripe trying again.
    fail(res, e);
  }
}
