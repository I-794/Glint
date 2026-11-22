// v43 — Keepsake: count one aggregate view per visitor session on /s/<id>.
// Triggered non-blockingly by the share viewer; never stores cookies or IPs.
import { ApiError, parseBody } from './_shared.js';
import { shareConfig, store, readId, readManifest, sendError } from './_share.js';
import { accountConfig, memoryAccounts, runSql } from './_account.js';
import { normalizeManifest, isExpired } from '../src/share/share-core.js';

const COOLDOWN_MS = 5 * 60 * 1000;
const recentViews = new Map();

export function resetViewCooldown() {
  recentViews.clear();
}

function isBot(req) {
  const h = req.headers || {};
  const ua = String(h['user-agent'] || '');
  const purpose = String(h['sec-purpose'] || h.purpose || '');
  return /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|embedly|pinterest|headless|curl|wget/i.test(ua)
    || /prefetch/i.test(purpose);
}

function clientIp(req) {
  const h = req.headers || {};
  return String(h['x-forwarded-for'] || h['x-real-ip'] || 'unknown').split(',')[0].trim() || 'unknown';
}

function seenRecently(key, now) {
  const at = recentViews.get(key);
  return typeof at === 'number' && now - at < COOLDOWN_MS;
}

function markSeen(key, now) {
  if (recentViews.size > 10000) recentViews.clear();
  recentViews.set(key, now);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const body = parseBody(req);
    const id = readId(body && body.id);

    const sCfg = shareConfig();
    const acctCfg = accountConfig();
    if (!sCfg.enabled || !acctCfg.enabled) {
      res.status(204).end();
      return;
    }
    if (isBot(req)) {
      res.status(204).end();
      return;
    }

    const now = Date.now();
    const dedupeKey = `${clientIp(req)}:${id}`;
    if (seenRecently(dedupeKey, now)) {
      res.status(204).end();
      return;
    }

    const found = await readManifest(store(sCfg), id);
    if (!found) {
      res.status(204).end();
      return;
    }
    const manifest = normalizeManifest(found.manifest, { id });
    if (isExpired(manifest)) {
      res.status(204).end();
      return;
    }

    markSeen(dedupeKey, now);
    try {
      if (acctCfg.memory) {
        const { views } = memoryAccounts();
        const cur = views.get(id);
        views.set(id, { views: (cur ? cur.views : 0) + 1, last_viewed_at: new Date(now).toISOString() });
      } else {
        await runSql(
          acctCfg,
          'insert into share_views (share_id, views, last_viewed_at) values ($1, 1, now()) on conflict (share_id) do update set views = share_views.views + 1, last_viewed_at = now()',
          [id]
        );
      }
    } catch (e) {
      console.error('[share-view]', e.message);
    }
    res.status(204).end();
  } catch (e) {
    sendError(res, e);
  }
}
