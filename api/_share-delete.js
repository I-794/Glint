// v41 — Share links: delete every file of a share. Needs the owner key that
// share-create handed out (kept by the editor, or carried in a manage link).
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, checkKey, readId, pendingPath, expiryPath, readManifest, sendError } from './_share.js';
import { sharePrefix } from '../src/share/share-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const body = parseBody(req);
    const id = readId(body.id);
    if (!(await checkKey(cfg.secret, id, body.key))) throw new ApiError(403, 'Not your share');
    const st = store(cfg);
    const files = await st.list(sharePrefix(id));
    if (!files.length) throw new ApiError(404, 'This link is already gone.');
    // v42 — a link with an expiry also has a marker for the sweep.
    const extra = [pendingPath(id)];
    try {
      const found = await readManifest(st, id);
      const t = found && typeof found.manifest.expiresAt === 'string' ? Date.parse(found.manifest.expiresAt) : NaN;
      if (Number.isFinite(t)) extra.push(expiryPath(id, t));
    } catch (e) {
      console.error('[share-delete] expiry marker', e);   // the sweep removes a stray marker
    }
    await st.del([...files.map((f) => f.pathname), ...extra]);
    res.status(204).end();
  } catch (e) {
    sendError(res, e);
  }
}
