// v41 — Share links: serves /s/<id> (rewritten here by vercel.json). Fills the
// static viewer page's two placeholders: Open Graph tags, so a pasted link
// shows a preview card, and the manifest as inline JSON, so the viewer draws
// without a second request. The page itself is our own built HTML; nothing
// from the manifest is ever written into it except escaped text and JSON.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { shareConfig, store, readManifest, siteOrigin } from './_share.js';
import { normalizeManifest, describeShare, isShareId } from '../src/share/share-core.js';

export const SHARE_CSP = "default-src 'self'; img-src 'self' data: https://*.public.blob.vercel-storage.com; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'none'";

let templateCache = null;

async function loadTemplate(origin) {
  if (templateCache) return templateCache;
  try {
    templateCache = await readFile(path.join(process.cwd(), 'dist', 's', 'index.html'), 'utf8');
    return templateCache;
  } catch (_) { /* not bundled with the function; fetch the deployed copy */ }
  if (!origin) return null;
  try {
    const r = await fetch(`${origin}/s/index.html`, { redirect: 'error' });
    if (!r.ok) return null;
    const html = await r.text();
    if (!html.includes('<!--SHARE_DATA-->')) return null;
    templateCache = html;
    return html;
  } catch (_) {
    return null;
  }
}

export const escAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function shareMeta({ manifest, base, origin, id }) {
  const title = manifest ? (manifest.title || 'Shared from Glint') : 'Link not found';
  const desc = manifest ? describeShare(manifest) : 'This link was removed, or it never existed.';
  const tags = [
    `<title>${escAttr(title)} · Glint</title>`,
    `<meta name="description" content="${escAttr(desc)}">`,
    `<meta property="og:site_name" content="Glint">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(desc)}">`,
  ];
  if (origin && id) tags.push(`<meta property="og:url" content="${escAttr(`${origin}/s/${id}`)}">`);
  if (manifest && manifest.poster && base) {
    tags.push(`<meta property="og:image" content="${escAttr(base + manifest.poster)}">`);
    tags.push(`<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`);
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary">`);
  }
  return tags.join('\n    ');
}

export function fillTemplate(template, meta, data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return template
    .replace(/<title>[^<]*<\/title>/, '')
    .replace('<!--SHARE_META-->', () => meta)
    .replace('<!--SHARE_DATA-->', () => json);
}

export default async function handler(req, res) {
  const raw = req.query && req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const origin = siteOrigin(req);
  const cfg = shareConfig();

  let found = null;
  if (cfg.enabled && isShareId(id)) {
    try {
      const got = await readManifest(store(cfg), id);
      if (got) found = { manifest: normalizeManifest(got.manifest, { id }), base: got.base };
    } catch (e) {
      console.error('[share-page]', e);
    }
  }

  const template = await loadTemplate(origin);
  if (!template) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', `/s/?id=${encodeURIComponent(isShareId(id) ? id : '')}`);
    res.status(302).end();
    return;
  }

  const data = found ? { manifest: found.manifest, base: found.base, report: cfg.reportEmail || null } : { missing: true };
  const html = fillTemplate(template, shareMeta({ ...(found || {}), origin, id: isShareId(id) ? id : null }), data);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', SHARE_CSP);
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', found ? 'public, max-age=0, s-maxage=60' : 'public, max-age=0, s-maxage=30');
  res.status(found ? 200 : 404).send(html);
}
