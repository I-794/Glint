// Glint Pro waitlist: POST /api/waitlist adds an email, GET /api/waitlist-export
// lists them for the site owner. Both are ops of the one share function
// (vercel.json rewrites them to /api/share?op=...), so they cost no extra
// serverless function.
//
// Entries live in the share Blob store under `waitlist/`. That store is public,
// so nothing readable is put there: the file name is an HMAC of the email (no
// one can guess it, and the same email always lands on the same file, which is
// the de-duplication), and the content is AES-256-GCM encrypted with a key
// derived from SHARE_SIGNING_SECRET.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ApiError, parseBody } from './_shared.js';
import { shareConfig, store, sendError, hmacNode } from './_share.js';
import { base64url } from '../src/share/share-core.js';

export const WAITLIST_PREFIX = 'waitlist/';
const SOURCES = ['pricing', 'editor', 'home'];
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

// Best-effort throttle. Serverless instances come and go, so this only slows a
// burst from one address; the honeypot and the validation do the rest.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function requireOpen() {
  const cfg = shareConfig();
  if (!cfg.enabled) throw new ApiError(501, 'The waitlist is not open on this copy of Glint.');
  return cfg;
}

export function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL.test(email)) return '';
  return email;
}

const encKey = (secret) => hmacNode(secret, 'waitlist:enc');
export const waitlistPath = (secret, email) => `${WAITLIST_PREFIX}${base64url(hmacNode(secret, 'waitlist:id:' + email))}.json`;

function seal(secret, entry) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(entry), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function open(secret, box) {
  const decipher = createDecipheriv('aes-256-gcm', encKey(secret), Buffer.from(String(box.iv), 'base64'));
  decipher.setAuthTag(Buffer.from(String(box.tag), 'base64'));
  const text = Buffer.concat([decipher.update(Buffer.from(String(box.data), 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}

export async function join(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireOpen();
    const body = parseBody(req);
    // Bots fill every field; people never see this one.
    if (body.website) { res.status(200).json({ ok: true }); return; }
    const email = cleanEmail(body.email);
    if (!email) throw new ApiError(400, 'That does not look like an email address.');
    const ip = String((req.headers && req.headers['x-forwarded-for']) || 'unknown').split(',')[0].trim();
    if (throttled(ip)) throw new ApiError(429, 'Too many tries. Give it a few minutes.');
    const source = SOURCES.includes(body.source) ? body.source : 'other';
    const st = store(cfg);
    const path = waitlistPath(cfg.secret, email);
    // The answer is the same whether or not the email was already there, so
    // the form cannot be used to check who is on the list.
    if (!(await st.getJson(path))) {
      const entry = seal(cfg.secret, { email, at: new Date().toISOString(), source });
      try {
        await st.put(path, JSON.stringify(entry), { contentType: 'application/json' });
      } catch (e) {
        // Two requests for the same email at once: the other one won.
        if (!(await st.getJson(path))) throw e;
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
}

const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

export async function exportList(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
    const secret = process.env.CRON_SECRET;
    const auth = (req.headers && req.headers.authorization) || '';
    if (!secret || auth !== `Bearer ${secret}`) throw new ApiError(401, 'Unauthorized');
    const cfg = requireOpen();
    const st = store(cfg);
    const files = await st.list(WAITLIST_PREFIX);
    const entries = [];
    for (const f of files) {
      const got = await st.getJson(f.pathname).catch(() => null);
      if (!got) continue;
      try { entries.push(open(cfg.secret, got.data)); } catch (e) { /* written with another secret */ }
    }
    entries.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const format = Array.isArray(req.query && req.query.format) ? req.query.format[0] : req.query && req.query.format;
    if (format === 'csv') {
      const rows = ['email,joined,source', ...entries.map((e) => [e.email, e.at, e.source].map(csvCell).join(','))];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.status(200).send(rows.join('\n') + '\n');
      return;
    }
    res.status(200).json({ count: entries.length, entries });
  } catch (e) {
    sendError(res, e);
  }
}
