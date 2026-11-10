// v41 — Share links: the published manifest plus the folder its files live in.
// The viewer uses this when the page was not served with the data inline.
import { ApiError } from './_shared.js';
import { requireEnabled, store, readId, readManifest, sendError } from './_share.js';
import { normalizeManifest, isExpired } from '../src/share/share-core.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const id = readId(req.query && req.query.id);
    const found = await readManifest(store(cfg), id);
    if (!found) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
      throw new ApiError(404, 'This link was removed, or it never existed.');
    }
    const manifest = normalizeManifest(found.manifest, { id });
    // v42 — an expired link reads as gone, even before the sweep deletes it.
    if (isExpired(manifest)) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
      throw new ApiError(404, 'This link has expired.');
    }
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.status(200).json({ manifest, base: found.base, report: cfg.reportEmail || null });
  } catch (e) {
    sendError(res, e);
  }
}
