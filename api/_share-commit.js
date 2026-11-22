// v41 — Share links: check the manifest and the uploaded files, then publish
// the share by writing manifest.json. A share can be committed once.
import { ApiError, parseBody } from './_shared.js';
import { requireEnabled, store, checkKey, readId, pendingPath, expiryPath, sendError, siteOrigin } from './_share.js';
import { accountConfig, readBearer, userFromToken, useCredits, runSql, memoryAccounts } from './_account.js';
import { billingConfig } from './_billing.js';
import { normalizeManifest, manifestAssets, sharePrefix, LIMITS, MANIFEST_NAME } from '../src/share/share-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const cfg = requireEnabled();
    const body = parseBody(req);
    const id = readId(body.id);
    if (!(await checkKey(cfg.secret, id, body.key))) throw new ApiError(403, 'Not your share');

    // v43 — Keepsake: attach share ownership when signed in, and clamp Free
    // links to 30 days once Glint Pro billing is active.
    const acctCfg = accountConfig();
    const billingCfg = billingConfig();
    let user = null;
    let isPro = false;
    if (acctCfg.enabled) {
      const token = readBearer(req);
      if (token) {
        try { user = await userFromToken(acctCfg, token); } catch (_) { user = null; }
        if (user) {
          try {
            const usage = await useCredits(acctCfg, user.id, 0);
            isPro = usage.plan === 'pro';
          } catch (_) { isPro = false; }
        }
      }
    }

    const enforceFreeExpiry = acctCfg.enabled && billingCfg.enabled && !isPro;
    let requestedExpiry = body.expiresIn == null ? (enforceFreeExpiry ? '30d' : undefined) : body.expiresIn;
    let clampedExpiry = false;
    if (enforceFreeExpiry && (requestedExpiry === 'never' || requestedExpiry == null)) {
      requestedExpiry = '30d';
      clampedExpiry = true;
    }

    let manifest;
    // v42 — `expiresIn` ('never' | '1d' | '7d' | '30d') sets the link's expiry;
    // the time itself is stamped here, never taken from the client.
    try { manifest = normalizeManifest(body.manifest, { id, now: Date.now(), expiresIn: requestedExpiry }); } catch (e) { throw new ApiError(400, e.message); }

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
    if (acctCfg.enabled && user) {
      const posterFile = manifest.poster ? byName.get(manifest.poster) : null;
      const posterUrl = posterFile ? posterFile.url : null;
      const shareKind = manifest.kind === 'gallery' ? manifest.gallery.source : manifest.kind;
      const createdAt = manifest.createdAt || new Date().toISOString();
      try {
        if (acctCfg.memory) {
          const { shares } = memoryAccounts();
          if (!shares.has(id)) {
            shares.set(id, {
              share_id: id,
              user_id: user.id,
              kind: shareKind,
              title: manifest.title || '',
              poster_url: posterUrl,
              expires_at: manifest.expiresAt || null,
              created_at: createdAt,
            });
          }
        } else {
          await runSql(
            acctCfg,
            'insert into user_shares (share_id, user_id, kind, title, poster_url, expires_at, created_at) values ($1, $2, $3, $4, $5, $6, $7) on conflict (share_id) do nothing',
            [id, user.id, shareKind, manifest.title || '', posterUrl, manifest.expiresAt || null, createdAt]
          );
        }
      } catch (e) {
        console.error('[share-commit] user_shares', e);
      }
    }
    res.status(201).json({
      id,
      url: `${siteOrigin(req)}/s/${id}`,
      expiresAt: manifest.expiresAt || null,
      ...(clampedExpiry ? { clampedExpiry: true } : {}),
    });
  } catch (e) {
    sendError(res, e);
  }
}
