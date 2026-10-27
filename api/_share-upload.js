// v41 — Share links: the Blob client's upload handshake. The browser calls
// uploadPresigned() with handleUploadUrl '/api/share-upload'; the client sends
// { type: 'blob.generate-presigned-url', payload: { pathname, clientPayload } }
// and expects { presignedUrlPayload }. clientPayload carries the share id and
// owner key, and only a path planned by share-create (still pending, inside
// its upload window) gets a presigned PUT, bound to its type and size.
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, checkKey, readId, pendingPath, sendError } from './_share.js';

export const ASSET_CACHE_SECONDS = 3600;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const body = parseBody(req);
    if (!body || body.type !== 'blob.generate-presigned-url' || !body.payload) throw new ApiError(400, 'Unsupported upload request');
    let client;
    try { client = JSON.parse(body.payload.clientPayload || ''); } catch (_) { throw new ApiError(400, 'Missing share details'); }
    const id = readId(client && client.id);
    if (!(await checkKey(cfg.secret, id, client.key))) throw new ApiError(403, 'Not your share');

    const pathname = String(body.payload.pathname || '');
    const m = pathname.match(/^shares\/([A-Za-z0-9]{12})\/([^/]+)$/);
    if (!m || m[1] !== id) throw new ApiError(400, 'Wrong upload path');

    const st = store(cfg);
    const pending = await st.getJson(pendingPath(id));
    if (!pending) throw new ApiError(409, 'This link was already published, or it expired');
    const plan = pending.data;
    if (!(plan.expiresAt > Date.now())) throw new ApiError(410, 'The upload window closed. Try again.');
    const file = Array.isArray(plan.files) ? plan.files.find((f) => f.name === m[2]) : null;
    if (!file) throw new ApiError(400, 'That file was not planned');

    const presignedUrlPayload = await st.presignPut({
      pathname, type: file.type, maxBytes: file.size, validUntil: plan.expiresAt,
      cacheSeconds: ASSET_CACHE_SECONDS, body, req,
    });
    res.status(200).json({ type: body.type, presignedUrlPayload });
  } catch (e) {
    sendError(res, e);
  }
}
