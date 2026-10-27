// v41 — Share links: daily cron. Removes uploads that were never published
// (a closed tab, a cancelled upload) once their pending marker is a day old.
import { ApiError } from './_shared.js';
import { requireEnabled, store, sendError, PENDING_PREFIX } from './_share.js';
import { sharePrefix, isShareId, MANIFEST_NAME } from '../src/share/share-core.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 200;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const secret = process.env.CRON_SECRET;
    const auth = (req.headers && req.headers.authorization) || '';
    if (!secret || auth !== `Bearer ${secret}`) throw new ApiError(401, 'Unauthorized');
    const cfg = requireEnabled();
    const st = store(cfg);
    const cutoff = Date.now() - DAY_MS;
    const markers = (await st.list(PENDING_PREFIX)).filter((m) => m.uploadedAt.getTime() < cutoff).slice(0, MAX_PER_RUN);
    let removed = 0;
    for (const m of markers) {
      const id = m.pathname.slice(PENDING_PREFIX.length).replace(/\.json$/, '');
      if (!isShareId(id)) { await st.del([m.pathname]); continue; }
      const files = await st.list(sharePrefix(id));
      const published = files.some((f) => f.pathname.endsWith('/' + MANIFEST_NAME));
      if (published) { await st.del([m.pathname]); continue; }
      await st.del([...files.map((f) => f.pathname), m.pathname]);
      removed++;
    }
    console.log(`[share-sweep] removed ${removed} unpublished share(s)`);
    res.status(200).json({ removed });
  } catch (e) {
    sendError(res, e);
  }
}
