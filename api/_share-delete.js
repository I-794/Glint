// v41 — Share links: delete every file of a share. Needs the owner key that
// share-create handed out (kept by the editor, or carried in a manage link),
// or a Clerk token belonging to the account that owns the link (v43).
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, checkKey, readId, pendingPath, expiryPath, readManifest, sendError } from './_share.js';
import { accountConfig, readBearer, userFromToken, runSql, memoryAccounts } from './_account.js';
import { sharePrefix } from '../src/share/share-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const body = parseBody(req);
    const id = readId(body.id);

    const acctCfg = accountConfig();
    let authorized = Boolean(body.key && await checkKey(cfg.secret, id, body.key));
    if (!authorized && acctCfg.enabled) {
      const token = readBearer(req);
      if (token) {
        let user = null;
        try { user = await userFromToken(acctCfg, token); } catch (_) { user = null; }
        if (user) {
          if (acctCfg.memory) {
            const row = memoryAccounts().shares.get(id);
            if (row && row.user_id === user.id) authorized = true;
          } else {
            try {
              const rows = await runSql(acctCfg, 'select user_id from user_shares where share_id = $1', [id]);
              if (rows[0] && rows[0].user_id === user.id) authorized = true;
            } catch (e) {
              console.error('[share-delete] user_shares lookup', e);
            }
          }
        }
      }
    }
    if (!authorized) throw new ApiError(403, 'Not your share');

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

    if (acctCfg.enabled) {
      try {
        if (acctCfg.memory) {
          const { shares, views } = memoryAccounts();
          shares.delete(id);
          views.delete(id);
        } else {
          await runSql(acctCfg, 'delete from user_shares where share_id = $1', [id]);
          await runSql(acctCfg, 'delete from share_views where share_id = $1', [id]);
        }
      } catch (e) {
        console.error('[share-delete] cleanup', e);
      }
    }
    res.status(204).end();
  } catch (e) {
    sendError(res, e);
  }
}
