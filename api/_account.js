// Glint Pro groundwork: accounts and hosted AI credits.
//
// Sign-in is Supabase Auth (the editor already has it). This module is the
// server side: it checks the caller's login token with Supabase, then spends
// credits through one atomic Postgres function (supabase/glint-pro.sql), which
// also works out the plan. Nothing here trusts the browser.
//
// Metering is on only when the deployment has SUPABASE_SERVICE_ROLE_KEY and a
// Supabase URL. Without them every hosted AI route behaves as it did before.

import { ApiError, serverOpenAIKey } from './_shared.js';

// What one call costs. Image models cost far more to run than text ones.
export const CREDIT_COSTS = { text: 1, vision: 1, enhance: 1, agent: 1, image: 5 };

const posInt = (value, fallback) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function accountConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    enabled: Boolean(/^https:\/\//.test(url) && serviceKey),
    url,
    serviceKey,
    freeCredits: posInt(process.env.AI_FREE_CREDITS, 20),
    proCredits: posInt(process.env.AI_PRO_CREDITS, 500),
  };
}

// An error the editor can act on: `code` says what to offer the person.
export class MeterError extends ApiError {
  constructor(status, code, message, extra = {}) {
    super(status, message);
    this.code = code;
    this.extra = extra;
  }
}

export function readBearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(String(h));
  return m && m[1].length < 4096 ? m[1] : '';
}

const unavailable = () => new ApiError(503, 'Hosted AI could not check your account just now. Try again in a moment.');

// Ask Supabase who this token belongs to. Null means not signed in (or a token
// from some other Supabase project, which the editor also allows).
export async function userFromToken(cfg, token) {
  if (!token) return null;
  let r;
  try {
    r = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw unavailable();
  }
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw unavailable();
  const user = await r.json().catch(() => null);
  if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : '' };
}

// cost > 0 spends, cost < 0 refunds, 0 only reads.
export async function useCredits(cfg, userId, cost) {
  let r;
  try {
    r = await fetch(`${cfg.url}/rest/v1/rpc/glint_use_credits`, {
      method: 'POST',
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user: userId, p_cost: cost, p_free_limit: cfg.freeCredits, p_pro_limit: cfg.proCredits }),
    });
  } catch (e) {
    throw unavailable();
  }
  const out = r.ok ? await r.json().catch(() => null) : null;
  if (!out || typeof out.used !== 'number' || typeof out.limit !== 'number') {
    if (!r.ok) console.error('[account] glint_use_credits failed with status', r.status);
    throw unavailable();
  }
  return { allowed: out.allowed !== false, used: out.used, limit: out.limit, plan: out.plan === 'pro' ? 'pro' : 'free' };
}

// First day of next month, UTC: when the monthly credits start over.
export function resetsAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

// Spend `cost` credits for this request. Returns null when the call is not
// metered at all, otherwise { usage, refund }. Throws a MeterError when the
// person has to sign in or is out of credits.
export async function meter(req, cost) {
  const cfg = accountConfig();
  // No server key: the route answers 501 itself and the editor uses the
  // person's own key, so there is nothing to charge for.
  if (!cfg.enabled || req.method !== 'POST' || !serverOpenAIKey()) return null;
  const user = await userFromToken(cfg, readBearer(req));
  if (!user) {
    throw new MeterError(401, 'sign_in', `Sign in to use Glint's hosted AI (${cfg.freeCredits} free credits a month), or add your own API key.`, { limit: cfg.freeCredits });
  }
  const usage = await useCredits(cfg, user.id, cost);
  if (!usage.allowed) {
    const left = Math.max(0, usage.limit - usage.used);
    const message = left > 0
      ? `This needs ${cost} hosted AI credits and you have ${left} left this month. Your own API key still works.`
      : `You have used all ${usage.limit} hosted AI credits for this month. Your own API key still works.`;
    throw new MeterError(402, 'no_credits', message, { used: usage.used, limit: usage.limit, plan: usage.plan, resets: resetsAt() });
  }
  let refunded = false;
  return {
    usage,
    async refund() {
      if (refunded) return;
      refunded = true;
      try { await useCredits(cfg, user.id, -cost); } catch (e) { console.error('[account] refund failed', e.message); }
    },
  };
}

// Wrap a hosted AI route. The credits are spent before the model is called (so
// two requests at once cannot both slip under the limit) and handed back when
// the route answers with an error.
export function metered(kind, handler) {
  const cost = CREDIT_COSTS[kind];
  return async function meteredHandler(req, res) {
    let ticket;
    try {
      ticket = await meter(req, cost);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).json({ error: e instanceof ApiError ? e.message : 'Something went wrong. Try again.', ...(e.code ? { code: e.code, ...e.extra } : {}) });
      return;
    }
    if (!ticket) return handler(req, res);
    res.setHeader('X-Glint-Credits', `${ticket.usage.used}/${ticket.usage.limit}`);
    let code = 200;
    const status = res.status.bind(res);
    res.status = (c) => { code = c; return status(c); };
    try {
      await handler(req, res);
    } catch (e) {
      code = 500;
      throw e;
    } finally {
      if (code >= 400) await ticket.refund();
    }
  };
}

// GET /api/account?op=me: what the editor shows as "credits left".
export async function me(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
    const cfg = accountConfig();
    if (!cfg.enabled) { res.status(200).json({ enabled: false }); return; }
    const base = { enabled: true, hosted: Boolean(serverOpenAIKey()), costs: CREDIT_COSTS, freeCredits: cfg.freeCredits };
    const user = await userFromToken(cfg, readBearer(req));
    if (!user) { res.status(200).json({ ...base, signedIn: false }); return; }
    const usage = await useCredits(cfg, user.id, 0);
    res.status(200).json({ ...base, signedIn: true, plan: usage.plan, used: usage.used, limit: usage.limit, resets: resetsAt() });
  } catch (e) {
    if (!(e instanceof ApiError)) console.error('[account]', e);
    res.status(e instanceof ApiError ? e.status : 500).json({ error: e instanceof ApiError ? e.message : 'Something went wrong. Try again.' });
  }
}
