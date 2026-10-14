import { lookup } from 'dns/promises';

// v30 model policy: gpt-5.5 for all non-image OpenAI calls (vision/text/enhance).
// Overridable per-route via OPENAI_VISION_MODEL / OPENAI_ENHANCE_MODEL env vars.
export const DEFAULT_VISION_MODEL = 'gpt-5.5';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requirePost(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      throw new ApiError(400, 'Invalid JSON body');
    }
  }
  return req.body;
}

export function serverOpenAIKey() {
  return process.env.OPENAI_API_KEY || '';
}

export function cleanBase64Image(value) {
  if (!value || typeof value !== 'string') return '';
  const comma = value.indexOf(',');
  return comma >= 0 ? value.slice(comma + 1) : value;
}

export function dataUrlFromBase64(image, mimeType = 'image/png') {
  return `data:${mimeType};base64,${cleanBase64Image(image)}`;
}

export async function openAIChat(payload) {
  const key = serverOpenAIKey();
  if (!key) throw new ApiError(501, 'No server key configured');

  // v30 — gpt-5.x / reasoning models reject `max_tokens` and require
  // `max_completion_tokens`. Normalize here so every route (which still passes
  // the familiar `max_tokens`) works without per-route changes.
  const body = { ...payload };
  if (body.max_tokens != null && body.max_completion_tokens == null) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error?.message || 'OpenAI request failed');
  }
  return data;
}

export function textFromChat(data) {
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function handleApiError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  res.status(status).json({ error: error.message || String(error) });
}

// v32 — SSRF guard, shared by the fetch-url media proxy and scrape-page.
// Copied verbatim from api/fetch-url.js; do not relax the private-IP ranges.
export const MAX_REDIRECTS = 5;

export function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  let addr = ip.trim().toLowerCase();
  const pct = addr.indexOf('%');
  if (pct >= 0) addr = addr.slice(0, pct);

  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) addr = mapped[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) {
    const parts = addr.split('.').map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  if (addr === '::' || addr === '::1') return true;
  if (addr.startsWith('fe8') || addr.startsWith('fe9') ||
      addr.startsWith('fea') || addr.startsWith('feb')) return true;
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true;
  if (addr.startsWith('ff')) return true;
  return false;
}

export async function assertPublicHost(host) {
  if (!host) throw new ApiError(400, 'Invalid host');
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

export function assertHttpUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'Only http(s) URLs are allowed');
  }
}

export async function fetchPublic(startUrl, { maxRedirects = MAX_REDIRECTS, userAgent = 'Mozilla/5.0 Glint/36' } = {}) {
  let current = startUrl;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    assertHttpUrl(current);
    await assertPublicHost(current.hostname);

    const upstream = await fetch(current.toString(), {
      headers: { 'User-Agent': userAgent },
      redirect: 'manual'
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location');
      if (!location) throw new ApiError(502, 'Redirect missing location');
      current = new URL(location, current);
      continue;
    }

    return upstream;
  }

  throw new ApiError(508, 'Too many redirects');
}
