// v41 — Share links: check the manifest and the uploaded files, then publish
// the share by writing manifest.json. A share can be committed once.
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, checkKey, readId, pendingPath, expiryPath, sendError, siteOrigin } from './_share.js';
import { normalizeManifest, manifestAssets, sharePrefix, LIMITS, MANIFEST_NAME } from '../src/share/share-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const body = parseBody(req);
    const id = readId(body.id);
    if (!(await checkKey(cfg.secret, id, body.key))) throw new ApiError(403, 'Not your share');

    let manifest;
    // v42 — `expiresIn` ('never' | '1d' | '7d' | '30d') sets the link's expiry;
    // the time itself is stamped here, never taken from the client.
    try { manifest = normalizeManifest(body.manifest, { id, now: Date.now(), expiresIn: body.expiresIn == null ? undefined : body.expiresIn }); } catch (e) { throw new ApiError(400, e.message); }

    const st = store(cfg);
    const prefix = sharePrefix(id);
    const files = await st.list(prefix);
    const byName = new Map(files.map((f) => [f.pathname.slice(prefix.length), f]));
    if (byName.has(MANIFEST_NAME)) throw new ApiError(409, 'This link was already published');
    for (const name of manifestAssets(manifest)) {
      const f = byName.get(name);
      if (!f) throw new ApiError(400, `Missing upload: ${name}`);
      if (!(f.size > 0)) throw new ApiError(400, `Empty upload: ${name}`);
    }
    const total = files.reduce((s, f) => s + (f.size || 0), 0);
    if (total > LIMITS.shareBytes) throw new ApiError(400, 'This share is too large');

    try {
      await st.put(prefix + MANIFEST_NAME, JSON.stringify(manifest), { contentType: 'application/json', cacheSeconds: 60 });
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (/exist/i.test(e && e.message)) throw new ApiError(409, 'This link was already published');
      throw e;
    }
    await st.del([pendingPath(id)]);
    if (manifest.expiresAt) {
      // The marker only speeds up cleanup; the link stops working at its time
      // either way, so a failed write is logged and the publish still stands.
      try {
        await st.put(expiryPath(id, Date.parse(manifest.expiresAt)), JSON.stringify({ id, expiresAt: manifest.expiresAt }), { contentType: 'application/json', cacheSeconds: 60 });
      } catch (e) {
        console.error('[share-commit] expiry marker', e);
      }
    }
    res.status(201).json({ id, url: `${siteOrigin(req)}/s/${id}`, expiresAt: manifest.expiresAt || null });
  } catch (e) {
    sendError(res, e);
  }
}
