// v41 — Share links: delete every file of a share. Needs the owner key that
// share-create handed out (kept by the editor, or carried in a manage link).
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, checkKey, readId, pendingPath, sendError } from './_share.js';
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
    await st.del([...files.map((f) => f.pathname), pendingPath(id)]);
    res.status(204).end();
  } catch (e) {
    sendError(res, e);
  }
}
