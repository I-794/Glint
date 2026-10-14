// v30 — Brand Brain URL extraction. Fetches a page server-side (no CORS limits)
// and returns lightweight brand signals: <title>, a theme-color, an OG image,
// and a best-guess icon URL. Deliberately does NOT call any AI provider — the
// client runs vision on the returned image via the existing runVisionJson path,
// so BYO-key visitors work identically. Mirrors api/fetch-url.js conventions.

import { ApiError, handleApiError, parseBody } from './_shared.js';
import { lookup } from 'dns/promises';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function abs(base, href) {
  if (!href) return null;
  try { return new URL(href, base).href; } catch (_) { return null; }
}

// SSRF guard: reject loopback / link-local / private / unique-local / unspecified
// addresses across IPv4 + the common IPv6 cases (incl. IPv4-mapped ::ffff:a.b.c.d).
function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  let addr = ip.trim().toLowerCase();
  // Strip zone id (e.g. fe80::1%eth0).
  const pct = addr.indexOf('%');
  if (pct >= 0) addr = addr.slice(0, pct);

  // IPv4-mapped / -compatible IPv6 → evaluate the embedded v4 address.
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) addr = mapped[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) {
    const parts = addr.split('.').map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true;                         // 0.0.0.0/8 (incl. unspecified)
    if (a === 127) return true;                       // loopback 127.0.0.0/8
    if (a === 10) return true;                        // private 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // private 192.168.0.0/16
    if (a === 169 && b === 254) return true;          // link-local 169.254.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;// CGNAT 100.64.0.0/10
    if (a >= 224) return true;                         // multicast/reserved 224.0.0.0+
    return false;
  }

  // IPv6
  if (addr === '::' || addr === '::1') return true;   // unspecified / loopback
  if (addr.startsWith('fe8') || addr.startsWith('fe9') ||
      addr.startsWith('fea') || addr.startsWith('feb')) return true; // fe80::/10 link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true;   // fc00::/7 unique-local
  if (addr.startsWith('ff')) return true;             // ff00::/8 multicast
  return false;
}

// Resolve a host and reject if it's a bare private IP or resolves to any private IP.
async function assertPublicHost(host) {
  if (!host) throw new ApiError(400, 'Invalid host');
  // Bare-IP literal in the URL (IPv6 hosts arrive bracketed).
  const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (/^[0-9.]+$/.test(literal) || literal.includes(':')) {
    if (isPrivateIp(literal)) throw new ApiError(422, 'Host not allowed');
    return;
  }
  let records;
  try {
    records = await lookup(host, { all: true });
  } catch (_) {
    throw new ApiError(422, 'Host could not be resolved');
  }
  if (!records || !records.length) throw new ApiError(422, 'Host could not be resolved');
  for (const rec of records) {
    if (isPrivateIp(rec.address)) throw new ApiError(422, 'Host not allowed');
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let url = '';
  try {
    const body = parseBody(req);
    url = (body && body.url) || '';
  } catch (e) {
    return handleApiError(res, e);
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A valid http(s) url is required.' });
  }

  // SSRF guard runs before the fetch; reject (400/422) so the client degrades.
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return res.status(400).json({ error: 'A valid http(s) url is required.' });
  }
  try {
    await assertPublicHost(parsed.hostname);
  } catch (e) {
    if (e instanceof ApiError) return handleApiError(res, e);
    return res.status(422).json({ error: 'Host not allowed' });
  }

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Glint-BrandBrain/1.0' },
      redirect: 'manual',          // a public host can 30x to a private one
      signal: AbortSignal.timeout(5000)
    });

    // Redirect-safe: do NOT auto-follow. Treat any 3xx as "no signals".
    if (r.status >= 300 && r.status < 400) {
      return res.status(200).json({ title: null, themeColor: null, ogImage: null, iconUrl: null });
    }
    if (!r.ok) throw new ApiError(502, `Upstream ${r.status}`);

    const full = await r.text();
    const html = full.slice(0, 200000); // cap parse work

    const pick = (re) => { const m = html.match(re); return m ? m[1] : null; };
    const themeColor = pick(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    const ogImage = abs(url, pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i));
    const iconHref = pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
    const iconUrl = abs(url, iconHref) || abs(url, '/favicon.ico');
    const title = pick(/<title[^>]*>([^<]*)<\/title>/i);

    return res.status(200).json({
      title: title || null,
      themeColor: themeColor || null,
      ogImage: ogImage || null,
      iconUrl: iconUrl || null
    });
  } catch (e) {
    // Fall-through contract: 501 → client degrades to asset/manual entry.
    if (e instanceof ApiError) return handleApiError(res, e);
    return res.status(501).json({ error: 'Brand extraction unavailable', detail: String(e && e.message || e) });
  }
}
