// v41 — Share links: reserve an id and hand the browser one upload token per
// file. The server names every file itself (0.webp, 1.webp, poster.webp) and
// binds each token to that exact path, content type and byte size, so the
// browser can upload straight to Blob without passing through this function.
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, keyFor, randomNode, pendingPath, sendError } from './_share.js';
import { newShareId, planUploads, assetPath } from '../src/share/share-core.js';

const TOKEN_TTL_MS = 15 * 60 * 1000;
export const ASSET_CACHE_SECONDS = 3600;

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
    const validUntil = Date.now() + TOKEN_TTL_MS;
    const uploads = await Promise.all(plan.map(async (p) => {
      const pathname = assetPath(id, p.name);
      const token = await st.clientToken({ pathname, type: p.type, maxBytes: p.size, validUntil, cacheSeconds: ASSET_CACHE_SECONDS });
      return { name: p.name, pathname, contentType: p.type, token };
    }));
    await st.put(pendingPath(id), JSON.stringify({ id, kind: body.kind, at: new Date().toISOString() }), { contentType: 'application/json' });
    res.status(200).json({ id, key, uploads, expiresAt: validUntil });
  } catch (e) {
    sendError(res, e);
  }
}
