// v41 — Share links: reserve an id and plan its files. The server names every
// file itself (0.webp, 1.webp, poster.webp) and records each one's type and
// size in the pending marker; /api/share-upload then presigns an upload for
// exactly those paths, so the browser uploads straight to Blob without the
// bytes passing through this function.
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, keyFor, randomNode, pendingPath, sendError } from './_share.js';
import { newShareId, planUploads, assetPath } from '../src/share/share-core.js';

export const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const body = parseBody(req);
    let plan;
    try { plan = planUploads(body); } catch (e) { throw new ApiError(400, e.message); }

    const st = store(cfg);
    const id = newShareId(randomNode);
    const key = await keyFor(cfg.secret, id);
    const expiresAt = Date.now() + UPLOAD_WINDOW_MS;
    // The marker holds only file names, types and sizes (no secrets).
    await st.put(pendingPath(id), JSON.stringify({ id, kind: body.kind, at: new Date().toISOString(), expiresAt, files: plan }), { contentType: 'application/json' });
    const uploads = plan.map((p) => ({ name: p.name, pathname: assetPath(id, p.name), contentType: p.type }));
    res.status(200).json({ id, key, uploads, expiresAt });
  } catch (e) {
    sendError(res, e);
  }
}
