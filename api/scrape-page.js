// v32 — Seed (URL -> set). Fetch a page server-side, extract its title and the
// images that best represent it (Open Graph, apple-touch-icon, hero <img>/<picture>,
// favicon), and return a small JSON manifest. The client then loads each image
// CORS-clean through the existing /api/fetch-url media proxy and drops them as
// board cards. Reuses the SSRF guard from _shared.js — never fetches private IPs.

import { ApiError, handleApiError, assertHttpUrl, fetchPublic } from './_shared.js';

const MAX_HTML_BYTES = 5 * 1024 * 1024;   // 5 MB of HTML
const MAX_IMAGES = 12;

// Resolve a possibly-relative URL against the page URL.
function abs(u, base) {
  try { return new URL(u, base).toString(); } catch (_) { return null; }
}

// Only image-looking http(s) URLs (skip trackers/scripts by extension). v32.1 —
// .ico and inline data: URIs are never useful cards (favicons, 1px spacers).
function looksLikeImage(u) {
  if (!u || !/^https?:/i.test(u)) return false;
  const path = u.split('?')[0].split('#')[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\b|$)/.test(path);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
    const raw = req.query?.url;
    const target = Array.isArray(raw) ? raw[0] : raw;
    if (!target) throw new ApiError(400, 'Missing url parameter');
    let parsed;
    try { parsed = new URL(target); } catch (_) { throw new ApiError(400, 'Invalid URL'); }
    assertHttpUrl(parsed);

    const upstream = await fetchPublic(parsed, { userAgent: 'Mozilla/5.0 Glint/36 scraper' });
    if (!upstream.ok) throw new ApiError(upstream.status, `Upstream returned ${upstream.status}`);

    const type = (upstream.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('html') && !type.includes('xml') && !type.includes('text')) {
      throw new ApiError(415, 'URL is not an HTML page');
    }
    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
      throw new ApiError(413, 'Page is too large');
    }
    const text = await upstream.text();
    if (text.length > MAX_HTML_BYTES) throw new ApiError(413, 'Page is too large');

    const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const base = parsed.toString();
    const seen = new Set();
    const images = [];

    const icons = [];   // favicons: only used when the page has nothing better
    const push = (url, alt, list = images) => {
      const a = abs(url, base);
      if (!a || seen.has(a) || !looksLikeImage(a)) return;
      seen.add(a);
      list.push({ url: a, w: null, h: null, alt: alt || '' });
    };

    // Open Graph image(s) — primary signal. Match whole <meta> tags and check
    // property/content independently so content-first tags (some CMSes) work too.
    const metas = text.match(/<meta[^>]*>/ig) || [];
    for (const tag of metas) {
      if (/property=["']og:image(?::secure_url)?["']/i.test(tag)) {
        const c = (tag.match(/content=["']([^"']+)["']/i) || [])[1];
        if (c) push(c, 'Open Graph image');
      }
    }

    // Apple-touch-icon + favicon (order-independent): match whole <link> tags.
    const links = text.match(/<link[^>]*>/ig) || [];
    for (const tag of links) {
      const rel = (tag.match(/rel=["']([^"']+)["']/i) || [])[1] || '';
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      if (!href) continue;
      if (/apple-touch-icon/i.test(rel)) push(href, 'App icon', icons);
      else if (/(^|\s)icon(\s|$)/i.test(rel) || /shortcut\s+icon/i.test(rel)) push(href, 'Favicon', icons);
    }

    // Hero <img> and <picture><source srcset>. srcset first entry only.
    const imgs = text.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/ig) || [];
    for (const m of imgs) {
      const src = (m.match(/src=["']([^"']+)["']/i) || [])[1];
      const alt = (m.match(/alt=["']([^"']*)["']/i) || [])[1];
      if (src) push(src, alt);
    }
    const srcsets = text.match(/<source[^>]+srcset=["']([^"'\s]+)/ig) || [];
    for (const m of srcsets) {
      const s = (m.match(/srcset=["']([^"'\s]+)/i) || [])[1];
      if (s) push(s, '');
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({
      title: title.replace(/\s+/g, ' ').trim().slice(0, 200),
      images: (images.length ? images : icons).slice(0, MAX_IMAGES)
    });
  } catch (e) {
    handleApiError(res, e);
  }
}
