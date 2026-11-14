// Glint Pro groundwork: accounts and hosted AI credits.
//
// Sign-in is Clerk; plans and credit counts live in Postgres (Neon). This
// module is the server side: it verifies the caller's Clerk session token,
// then spends credits through one atomic Postgres function
// (api/_account-schema.js), which also works out the plan. Nothing here
// trusts the browser.
//
// Metering is on only when the deployment has a Clerk key and a database URL
// (both arrive when Clerk and Neon are added from the Vercel Marketplace).
// Without them every hosted AI route behaves as it did before.

import { verifyToken } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';
import { ApiError, serverOpenAIKey } from './_shared.js';
import { SCHEMA, USE_CREDITS } from './_account-schema.js';

// What one call costs. Image models cost far more to run than text ones.
export const CREDIT_COSTS = { text: 1, vision: 1, enhance: 1, agent: 1, image: 5 };

const posInt = (value, fallback) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function accountConfig() {
  const memory = process.env.ACCOUNT_STORE === 'memory';   // tests only
  const secretKey = process.env.CLERK_SECRET_KEY || '';
  const jwtKey = process.env.CLERK_JWT_KEY || '';           // optional: verify without a network call
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  return {
    enabled: Boolean((secretKey || jwtKey) && (memory || databaseUrl)),
    memory,
    secretKey,
    jwtKey,
    databaseUrl,
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

// Who does this Clerk session token belong to? Null means not signed in: no
// token, an expired one, or one this Clerk instance did not sign.
export async function userFromToken(cfg, token) {
  if (!token) return null;
  try {
    const claims = await verifyToken(token, cfg.jwtKey ? { jwtKey: cfg.jwtKey } : { secretKey: cfg.secretKey });
    const id = claims && typeof claims.sub === 'string' ? claims.sub : '';
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? { id } : null;
  } catch (e) {
    // "token-..." reasons are about the token itself. Anything else (a wrong
    // secret key, Clerk's key service unreachable) is our side failing.
    if (typeof e.reason === 'string' && e.reason.startsWith('token-')) return null;
    console.error('[account] could not verify a session token:', e.reason || e.message);
    throw unavailable();
  }
}

// ── credit stores ────────────────────────────────────────────────────────────

// Tests: the same rules as the Postgres function, in memory.
const memoryUsage = new Map();
const memoryPro = new Set();
export function memoryAccounts() { return { usage: memoryUsage, pro: memoryPro }; }
function memoryUse(user, cost, freeLimit, proLimit) {
  const plan = memoryPro.has(user) ? 'pro' : 'free';
  const limit = plan === 'pro' ? proLimit : freeLimit;
  const now = memoryUsage.get(user) || 0;
  let allowed = true;
  if (cost > 0) { if (now + cost <= limit) memoryUsage.set(user, now + cost); else allowed = false; }
  else if (cost < 0) memoryUsage.set(user, Math.max(0, now + cost));
  return { allowed, used: memoryUsage.get(user) || 0, limit, plan };
}

let sqlClient = null, sqlUrl = '';
function db(cfg) {
  if (!sqlClient || sqlUrl !== cfg.databaseUrl) { sqlClient = neon(cfg.databaseUrl); sqlUrl = cfg.databaseUrl; }
  return sqlClient;
}

// 42883: the function is missing; 42P01: a table is missing. Either way the
// database has not been set up yet, which the server does itself, once.
const needsSchema = (e) => e && (e.code === '42883' || e.code === '42P01');

async function postgresUse(cfg, args) {
  const sql = db(cfg);
  try {
    return (await sql.query(USE_CREDITS, args))[0].r;
  } catch (e) {
    if (!needsSchema(e)) throw e;
    for (const statement of SCHEMA) await sql.query(statement);
    return (await sql.query(USE_CREDITS, args))[0].r;
  }
}

// cost > 0 spends, cost < 0 refunds, 0 only reads.
export async function useCredits(cfg, userId, cost) {
  let out;
  try {
    out = cfg.memory
      ? memoryUse(userId, cost, cfg.freeCredits, cfg.proCredits)
      : await postgresUse(cfg, [userId, cost, cfg.freeCredits, cfg.proCredits]);
  } catch (e) {
    console.error('[account] credits query failed:', e.code || '', e.message);
    throw unavailable();
  }
  if (!out || typeof out.used !== 'number' || typeof out.limit !== 'number') throw unavailable();
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
