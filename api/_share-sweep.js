// v41 — Share links: daily cron. Removes uploads that were never published
// (a closed tab, a cancelled upload) once their pending marker is a day old.
// v42 — it also deletes links whose expiry has passed, found through the
// markers in shares-expiry/ (the time is in each marker's name).
import { ApiError } from './_shared.js';
import { requireEnabled, store, sendError, PENDING_PREFIX, EXPIRY_PREFIX } from './_share.js';
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
    // Expired links, with whatever is left of this run's budget.
    const now = Date.now();
    let expired = 0;
    const due = [];
    for (const m of await st.list(EXPIRY_PREFIX)) {
      const hit = /^(\d{1,16})-([A-Za-z0-9]{12})\.json$/.exec(m.pathname.slice(EXPIRY_PREFIX.length));
      if (!hit) { due.push({ marker: m.pathname, id: null }); continue; }
      if (Number(hit[1]) <= now) due.push({ marker: m.pathname, id: hit[2] });
    }
    for (const d of due.slice(0, Math.max(0, MAX_PER_RUN - markers.length))) {
      if (!d.id) { await st.del([d.marker]); continue; }
      const files = await st.list(sharePrefix(d.id));
      await st.del([...files.map((f) => f.pathname), d.marker]);
      if (files.length) expired++;
    }
    console.log(`[share-sweep] removed ${removed} unpublished share(s), ${expired} expired link(s)`);
    res.status(200).json({ removed, expired });
  } catch (e) {
    sendError(res, e);
  }
}
