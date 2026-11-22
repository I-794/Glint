// Glint Pro groundwork: the editor's side of accounts and hosted AI credits.
// Every call to a hosted AI route goes through hostedFetch(), which adds the
// signed-in person's token so the server can count credits. When the server
// says "sign in" or "out of credits" this explains why, and otherwise stays
// out of the way: a person with their own API key never sees any of it.
import { getToken, onAuthChange, isConfigured, openSignIn } from './auth.js';
import { getKey } from './api-keys.js';
import { showNotification } from '../ui/notification.js';
import { track } from './analytics.js';

let usage = null;       // { used, limit, plan, resets } once known
let offer = null;       // { costs, freeCredits, proCredits, hosted } from the account route
let loadFailed = false; // the last look at the account did not get an answer
const watchers = [];
let lastBlock = null;   // { message, at } for the Design Agent's reply

const token = () => getToken();

export const hasOwnKey = () => Boolean(getKey('openai') || getKey('anthropic'));

// What the account panel shows. `usage` is null while signed out or unknown.
export function getAccount() {
  return { usage, offer, loadFailed };
}
export function onAccountChange(fn) { watchers.push(fn); }

export function resetDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function renderChip() {
  const chip = document.getElementById('ai-credits');
  if (!chip) return;
  if (!usage) { chip.style.display = 'none'; return; }
  if (usage.hosted) {
    const left = Math.max(0, usage.limit - usage.used);
    chip.style.display = '';
    chip.textContent = `${left} AI credit${left === 1 ? '' : 's'}`;
    const day = usage.resets ? resetDay(usage.resets) : '';
    chip.title = `${left} of ${usage.limit} hosted AI credits left this month${usage.plan === 'pro' ? ' (Glint Pro)' : ''}.${day ? ` They start over on ${day}.` : ''} Click for your account.`;
    return;
  }
  if (usage.plan === 'pro') {
    chip.style.display = '';
    chip.textContent = 'Glint Pro';
    chip.title = 'You are on Glint Pro. Click for your account and sync status.';
    return;
  }
  chip.style.display = 'none';
}

export const isPro = () => Boolean(usage && usage.plan === 'pro');
export const isBillingEnabled = () => Boolean(offer && offer.billing);

function setUsage(next) {
  usage = next;
  renderChip();
  watchers.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

let refreshing = null;
export function refreshAccount() {
  if (!refreshing) refreshing = loadAccount().finally(() => { refreshing = null; });
  return refreshing;
}

async function loadAccount() {
  const t = await token();
  try {
    const r = await fetch('/api/account?op=me', { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: 'no-store' });
    const type = r.headers.get('content-type') || '';
    const data = r.ok && type.includes('json') ? await r.json() : null;
    loadFailed = !data;
    offer = data && data.enabled
      ? {
        costs: data.costs || {},
        freeCredits: data.freeCredits,
        proCredits: data.proCredits,
        hosted: Boolean(data.hosted),
        sync: Boolean(data.sync),
        billing: Boolean(data.billing),
        priceLabel: typeof data.priceLabel === 'string' ? data.priceLabel : '',
      }
      : null;
    if (data && data.enabled && data.signedIn) {
      setUsage({
        used: Number(data.used) || 0,
        limit: Number(data.limit) || 0,
        plan: data.plan,
        resets: data.resets || '',
        hosted: Boolean(data.hosted),
        canManage: Boolean(data.subscription && data.subscription.canManage),
      });
    } else {
      setUsage(null);
    }
  } catch (e) {
    loadFailed = true;
    setUsage(null);
  }
}

function explain(data) {
  let message = data.error || 'Hosted AI is not available for this account.';
  let action = null;
  if (data.code === 'sign_in') {
    if (isConfigured()) action = { label: 'Sign in', run: openSignIn };
  } else {
    const day = data.resets ? resetDay(data.resets) : '';
    if (day) message = message.replace(' Your own API key', ` They start over on ${day}. Your own API key`);
    action = { label: 'Glint Pro', run: () => window.open('/pricing/#pro', '_blank', 'noopener') };
  }
  lastBlock = { message, at: Date.now() };
  return { message, action };
}

// The reason hosted AI just said no, if it did in the last few seconds.
export function recentMeterBlock() {
  return lastBlock && Date.now() - lastBlock.at < 8000 ? lastBlock.message : '';
}

// POST to a hosted AI route. Returns the Response. A "sign in" or "out of
// credits" answer comes back as a 501, which every caller already treats as
// "no hosted AI here" and so falls back to the person's own key.
export async function hostedFetch(path, body, { quiet = false } = {}) {
  const t = await token();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(body),
  });
  const credits = /^(\d+)\/(\d+)$/.exec(r.headers.get('X-Glint-Credits') || '');
  if (credits && r.ok) setUsage({ ...(usage || {}), used: Number(credits[1]), limit: Number(credits[2]) });
  if (r.status !== 401 && r.status !== 402) return r;
  const data = await r.clone().json().catch(() => ({}));
  if (data.code !== 'sign_in' && data.code !== 'no_credits') return r;
  track('ai_blocked', { reason: data.code });
  if (data.code === 'no_credits' && typeof data.used === 'number') setUsage({ ...(usage || {}), used: data.used, limit: data.limit, plan: data.plan, resets: data.resets });
  const { message, action } = explain(data);
  // The caller falls back to the person's own key. Without one it shows its
  // generic "add a key" message; this lands just after and says why.
  if (!quiet && !hasOwnKey()) setTimeout(() => showNotification(message, 'info', { action, duration: 9000 }), 80);
  return new Response(JSON.stringify({ error: message }), { status: 501, headers: { 'Content-Type': 'application/json' } });
}

// Authenticated call to any /api/account?op=... route. Resolves to
// { ok, status, data }; throws only on AbortError.
export async function accountFetch(op, { method = 'GET', query = '', body, signal } = {}) {
  try {
    const t = await token();
    const q = query ? `&${query.replace(/^&/, '')}` : '';
    const headers = t ? { Authorization: `Bearer ${t}` } : {};
    const init = { method, headers, cache: 'no-store', signal };
    if (body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const r = await fetch(`/api/account?op=${encodeURIComponent(op)}${q}`, init);
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    return { ok: false, status: 0, data: {} };
  }
}

// POST to one of the billing routes as the signed-in person. Resolves to
// { ok, status, data }; never throws.
function billingPost(op, body = {}) {
  return accountFetch(op, { method: 'POST', body });
}

// The checkout this browser started and has not seen the end of yet.
const CHECKOUT_KEY = 'glint_pro_checkout';
export function pendingCheckout() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || 'null');
    if (saved && typeof saved.id === 'string' && /^cs_/.test(saved.id) && Date.now() - saved.at < 24 * 3600 * 1000) return saved;
    if (saved) localStorage.removeItem(CHECKOUT_KEY);
  } catch (e) { /* nothing saved */ }
  return null;
}
export function forgetCheckout() {
  try { localStorage.removeItem(CHECKOUT_KEY); } catch (e) { /* nothing saved */ }
}

// Send the person to Stripe's checkout page for Glint Pro. Resolves to false
// (after saying why) when it could not start.
export async function startCheckout() {
  track('pro_checkout', { step: 'start' });
  const { ok, data } = await billingPost('checkout');
  if (ok && typeof data.url === 'string' && data.url.startsWith('https://')) {
    // Remembered here so the editor can confirm the payment when the person
    // comes back, however they come back.
    try { localStorage.setItem(CHECKOUT_KEY, JSON.stringify({ id: String(data.id || ''), at: Date.now() })); } catch (e) { /* private mode */ }
    window.location.assign(data.url);
    return true;
  }
  if (data.code === 'already_pro') { showNotification('You are already on Glint Pro.', 'info'); refreshAccount(); return false; }
  if (data.code === 'sign_in') { showNotification('Sign in first, then upgrade.', 'info', { action: { label: 'Sign in', run: openSignIn } }); return false; }
  showNotification(data.error || 'Checkout could not start. Try again in a moment.', 'error');
  return false;
}

// Stripe's own page for cancelling or changing the card.
export async function openBillingPortal() {
  const { ok, data } = await billingPost('portal');
  if (ok && typeof data.url === 'string' && data.url.startsWith('https://')) {
    window.location.assign(data.url);
    return true;
  }
  showNotification(data.error || 'Billing could not open. Try again in a moment.', 'error');
  return false;
}

// Back from checkout with ?pro=success&session_id=...: have the server read
// the result from Stripe so the plan is right at once, without waiting for
// the webhook. Resolves to 'pro', 'pending' or 'failed'.
export async function confirmCheckout(sessionId) {
  const { ok, data } = await billingPost('confirm', { session_id: sessionId });
  await refreshAccount();
  if (!ok) return 'failed';
  if (data.plan === 'pro') { track('pro_checkout', { step: 'done' }); return 'pro'; }
  return 'pending';
}

export function bindAccount() {
  // bindAuth() announces the first sign-in state once Clerk has loaded.
  onAuthChange(() => { refreshAccount(); });
}
