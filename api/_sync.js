// v43 — Keepsake: Glint Pro hosted "Your links" + cross-device cloud sync.
// Routed through api/account.js (?op=shares|sync-list|sync-project|sync-library)
// so we stay within Vercel's 12-function deployment limit.
import { ApiError, parseBody } from './_shared.js';
import {
  accountConfig, MeterError, readBearer, userFromToken, useCredits,
  runSql, unavailable, memoryAccounts,
} from './_account.js';
import { shareConfig, keyFor, checkKey, siteOrigin } from './_share.js';
import { isShareId } from '../src/share/share-core.js';
import {
  SYNC_LIMITS, isValidProjectId, isLibraryKind, utf8Bytes, isSafeThumbUrl,
} from '../src/state/sync-core.js';

const SHARE_KINDS = new Set(['image', 'tour', 'compare', 'roll', 'pins', 'gallery']);

function fail(res, e) {
  if (e instanceof ApiError) {
    res.status(e.status).json({
      error: e.message,
      ...(e.code ? { code: e.code } : {}),
      ...(e.extra || {}),
    });
    return;
  }
  console.error('[sync]', e);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
}

async function db(cfg, text, args) {
  try {
    return await runSql(cfg, text, args);
  } catch (e) {
    console.error('[sync] db error:', e.code || '', e.message);
    throw unavailable();
  }
}

async function requirePro(req, methods) {
  if (!methods.includes(req.method)) throw new ApiError(405, 'Method not allowed');
  const cfg = accountConfig();
  if (!cfg.enabled) throw new ApiError(501, 'Accounts are not set up on this copy of Glint.');
  const user = await userFromToken(cfg, readBearer(req));
  if (!user) throw new MeterError(401, 'sign_in', 'Sign in first.');
  const usage = await useCredits(cfg, user.id, 0);
  if (usage.plan !== 'pro') {
    throw new MeterError(403, 'pro_required', 'Glint Pro is needed for cross-device sync and link stats.');
  }
  return { cfg, user, usage };
}

function queryParam(req, name) {
  const raw = req.query && req.query[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

const isoOrNull = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

// ── GET / POST ?op=shares ────────────────────────────────────────────────────

export async function shares(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await requirePro(req, ['GET', 'POST']);
    const sCfg = shareConfig();

    if (req.method === 'POST') {
      if (!sCfg.enabled) throw new ApiError(501, 'Sharing is not set up');
      const body = parseBody(req);
      const list = Array.isArray(body.claim) ? body.claim.slice(0, 50) : [];
      let claimed = 0;
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const id = item.id;
        if (!isShareId(id) || typeof item.key !== 'string') continue;
        if (!(await checkKey(sCfg.secret, id, item.key))) continue;
        const kind = SHARE_KINDS.has(item.kind) ? item.kind : 'image';
        const title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : '';
        const posterUrl = isSafeThumbUrl(item.posterUrl) ? item.posterUrl : null;
        const createdAt = isoOrNull(item.createdAt) || new Date().toISOString();
        const expiresAt = isoOrNull(item.expiresAt);

        if (cfg.memory) {
          const map = memoryAccounts().shares;
          if (!map.has(id)) {
            map.set(id, {
              share_id: id,
              user_id: user.id,
              kind,
              title,
              poster_url: posterUrl,
              expires_at: expiresAt,
              created_at: createdAt,
            });
            claimed++;
          }
        } else {
          const rows = await db(
            cfg,
            'insert into user_shares (share_id, user_id, kind, title, poster_url, expires_at, created_at) values ($1, $2, $3, $4, $5, $6, $7) on conflict (share_id) do nothing returning share_id',
            [id, user.id, kind, title, posterUrl, expiresAt, createdAt]
          );
          if (rows.length) claimed++;
        }
      }
      res.status(200).json({ claimed });
      return;
    }

    let rows;
    if (cfg.memory) {
      const { shares: shareMap, views: viewMap } = memoryAccounts();
      rows = [...shareMap.values()]
        .filter((r) => r.user_id === user.id)
        .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
        .slice(0, 100)
        .map((r) => {
          const v = viewMap.get(r.share_id);
          return {
            ...r,
            views: v ? v.views : 0,
            last_viewed_at: v ? v.last_viewed_at : null,
          };
        });
    } else {
      rows = await db(
        cfg,
        `select s.share_id, s.kind, s.title, s.poster_url, s.expires_at, s.created_at,
                coalesce(v.views, 0)::int as views, v.last_viewed_at
           from user_shares s
           left join share_views v on v.share_id = s.share_id
          where s.user_id = $1
          order by s.created_at desc
          limit 100`,
        [user.id]
      );
    }

    const origin = siteOrigin(req);
    const out = [];
    for (const r of rows) {
      const key = sCfg.secret ? await keyFor(sCfg.secret, r.share_id) : null;
      out.push({
        id: r.share_id,
        kind: r.kind,
        title: r.title || '',
        url: origin ? `${origin}/s/${r.share_id}` : `/s/${r.share_id}`,
        key,
        posterUrl: r.poster_url || null,
        createdAt: isoOrNull(r.created_at),
        expiresAt: isoOrNull(r.expires_at),
        views: Number(r.views) || 0,
        lastViewedAt: isoOrNull(r.last_viewed_at),
      });
    }
    res.status(200).json({ shares: out });
  } catch (e) {
    fail(res, e);
  }
}

// ── GET ?op=sync-list ────────────────────────────────────────────────────────

export async function syncList(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await requirePro(req, ['GET']);
    let projects;
    let libraries;
    if (cfg.memory) {
      const { projects: pMap, libraries: lMap } = memoryAccounts();
      projects = [...pMap.values()]
        .filter((r) => r.user_id === user.id)
        .sort((a, b) => Number(b.updated_at) - Number(a.updated_at))
        .map((r) => ({
          id: r.project_id,
          name: r.name,
          thumbnail: r.thumbnail || null,
          sizeBytes: Number(r.size_bytes) || 0,
          createdAt: Number(r.created_at) || 0,
          updatedAt: Number(r.updated_at) || 0,
          deleted: Boolean(r.deleted),
        }));
      libraries = {};
      for (const r of lMap.values()) {
        if (r.user_id === user.id) libraries[r.kind] = { updatedAt: Number(r.updated_at) || 0 };
      }
    } else {
      const pRows = await db(
        cfg,
        'select project_id, name, thumbnail, size_bytes, created_at, updated_at, deleted from user_projects where user_id = $1 order by updated_at desc',
        [user.id]
      );
      projects = pRows.map((r) => ({
        id: r.project_id,
        name: r.name,
        thumbnail: r.thumbnail || null,
        sizeBytes: Number(r.size_bytes) || 0,
        createdAt: Number(r.created_at) || 0,
        updatedAt: Number(r.updated_at) || 0,
        deleted: Boolean(r.deleted),
      }));
      const lRows = await db(
        cfg,
        'select kind, updated_at from user_libraries where user_id = $1',
        [user.id]
      );
      libraries = {};
      for (const r of lRows) libraries[r.kind] = { updatedAt: Number(r.updated_at) || 0 };
    }
    res.status(200).json({
      projects,
      libraries,
      limits: {
        maxProjectBytes: SYNC_LIMITS.maxProjectBytes,
        maxProjects: SYNC_LIMITS.maxProjects,
        maxTotalBytes: SYNC_LIMITS.maxTotalBytes,
        maxLibraryBytes: SYNC_LIMITS.maxLibraryBytes,
      },
    });
  } catch (e) {
    fail(res, e);
  }
}

// ── GET / POST / DELETE ?op=sync-project ─────────────────────────────────────

async function readProjectRow(cfg, userId, projectId) {
  if (cfg.memory) {
    return memoryAccounts().projects.get(`${userId}:${projectId}`) || null;
  }
  const rows = await db(
    cfg,
    'select project_id, name, thumbnail, payload, size_bytes, created_at, updated_at, deleted from user_projects where user_id = $1 and project_id = $2',
    [userId, projectId]
  );
  return rows[0] || null;
}

async function writeProjectRow(cfg, row) {
  if (cfg.memory) {
    memoryAccounts().projects.set(`${row.user_id}:${row.project_id}`, row);
    return;
  }
  await db(
    cfg,
    `insert into user_projects (user_id, project_id, name, thumbnail, payload, size_bytes, created_at, updated_at, deleted)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (user_id, project_id) do update set
       name = excluded.name,
       thumbnail = excluded.thumbnail,
       payload = excluded.payload,
       size_bytes = excluded.size_bytes,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted`,
    [row.user_id, row.project_id, row.name, row.thumbnail, row.payload, row.size_bytes, row.created_at, row.updated_at, row.deleted]
  );
}

async function projectUsageTotals(cfg, userId, excludeId) {
  if (cfg.memory) {
    let count = 0;
    let totalBytes = 0;
    for (const r of memoryAccounts().projects.values()) {
      if (r.user_id === userId && r.project_id !== excludeId && !r.deleted) {
        count++;
        totalBytes += Number(r.size_bytes) || 0;
      }
    }
    return { count, totalBytes };
  }
  const rows = await db(
    cfg,
    'select count(*)::int as cnt, coalesce(sum(size_bytes), 0)::bigint as bytes from user_projects where user_id = $1 and project_id <> $2 and deleted = false',
    [userId, excludeId]
  );
  return { count: Number(rows[0]?.cnt) || 0, totalBytes: Number(rows[0]?.bytes) || 0 };
}

export async function syncProject(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await requirePro(req, ['GET', 'POST', 'DELETE']);
    const qId = queryParam(req, 'id');

    if (req.method === 'GET') {
      if (!isValidProjectId(qId)) throw new ApiError(400, 'Bad project id');
      const row = await readProjectRow(cfg, user.id, qId);
      if (!row) throw new ApiError(404, 'Project not found');
      if (row.deleted) {
        res.status(200).json({ project: { id: row.project_id, deleted: true, updatedAt: Number(row.updated_at) || 0 } });
        return;
      }
      let payload = null;
      try { payload = JSON.parse(row.payload); } catch (_) { throw new ApiError(500, 'Stored project data is corrupted'); }
      res.status(200).json({
        project: {
          id: row.project_id,
          name: row.name,
          thumbnail: row.thumbnail || null,
          payload,
          sizeBytes: Number(row.size_bytes) || 0,
          createdAt: Number(row.created_at) || 0,
          updatedAt: Number(row.updated_at) || 0,
          deleted: false,
        },
      });
      return;
    }

    if (req.method === 'DELETE') {
      let body = {};
      try { body = parseBody(req); } catch (_) { body = {}; }
      const id = qId || body.id;
      if (!isValidProjectId(id)) throw new ApiError(400, 'Bad project id');
      const rawAt = Number(queryParam(req, 'updatedAt') || body.updatedAt);
      const updatedAt = Number.isFinite(rawAt) && rawAt > 0 ? Math.floor(rawAt) : Date.now();
      const existing = await readProjectRow(cfg, user.id, id);
      if (existing && Number(existing.updated_at) > updatedAt) {
        throw new MeterError(409, 'conflict', 'Project changed elsewhere.', { serverUpdatedAt: Number(existing.updated_at) });
      }
      await writeProjectRow(cfg, {
        user_id: user.id,
        project_id: id,
        name: existing ? existing.name : '',
        thumbnail: null,
        payload: '',
        size_bytes: 0,
        created_at: existing ? Number(existing.created_at) : updatedAt,
        updated_at: updatedAt,
        deleted: true,
      });
      res.status(200).json({ id, deleted: true, updatedAt });
      return;
    }

    // POST (upsert project or tombstone)
    const body = parseBody(req);
    const id = body.id;
    if (!isValidProjectId(id)) throw new ApiError(400, 'Bad project id');
    const rawAt = Number(body.updatedAt);
    if (!Number.isFinite(rawAt) || rawAt <= 0) throw new ApiError(400, 'Bad updatedAt');
    const updatedAt = Math.floor(rawAt);

    const existing = await readProjectRow(cfg, user.id, id);
    if (existing && Number(existing.updated_at) > updatedAt) {
      throw new MeterError(409, 'conflict', 'Project changed elsewhere.', { serverUpdatedAt: Number(existing.updated_at) });
    }

    if (body.deleted === true) {
      await writeProjectRow(cfg, {
        user_id: user.id,
        project_id: id,
        name: existing ? existing.name : '',
        thumbnail: null,
        payload: '',
        size_bytes: 0,
        created_at: existing ? Number(existing.created_at) : updatedAt,
        updated_at: updatedAt,
        deleted: true,
      });
      res.status(200).json({ id, deleted: true, updatedAt });
      return;
    }

    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      throw new ApiError(400, 'Bad project payload');
    }
    const name = String(body.name || 'Untitled').slice(0, 120);
    const thumbnail = isSafeThumbUrl(body.thumbnail) ? body.thumbnail : null;
    const rawCreated = Number(body.createdAt);
    const createdAt = Number.isFinite(rawCreated) && rawCreated > 0 ? Math.floor(rawCreated) : updatedAt;
    const payloadStr = JSON.stringify(body.payload);
    const sizeBytes = utf8Bytes(payloadStr) + utf8Bytes(thumbnail || '');
    if (sizeBytes > SYNC_LIMITS.maxProjectBytes) {
      throw new MeterError(413, 'too_large', 'Project is over 3.6 MB and stays local.');
    }

    const totals = await projectUsageTotals(cfg, user.id, id);
    if (totals.count + 1 > SYNC_LIMITS.maxProjects) {
      throw new MeterError(413, 'quota_exceeded', `Cloud sync supports up to ${SYNC_LIMITS.maxProjects} projects.`);
    }
    if (totals.totalBytes + sizeBytes > SYNC_LIMITS.maxTotalBytes) {
      throw new MeterError(413, 'quota_exceeded', 'Cloud sync storage limit (50 MB) reached.');
    }

    await writeProjectRow(cfg, {
      user_id: user.id,
      project_id: id,
      name,
      thumbnail,
      payload: payloadStr,
      size_bytes: sizeBytes,
      created_at: createdAt,
      updated_at: updatedAt,
      deleted: false,
    });
    res.status(200).json({ id, updatedAt, sizeBytes });
  } catch (e) {
    fail(res, e);
  }
}

// ── GET / POST ?op=sync-library ──────────────────────────────────────────────

async function readLibraryRow(cfg, userId, kind) {
  if (cfg.memory) {
    return memoryAccounts().libraries.get(`${userId}:${kind}`) || null;
  }
  const rows = await db(
    cfg,
    'select kind, data, updated_at from user_libraries where user_id = $1 and kind = $2',
    [userId, kind]
  );
  return rows[0] || null;
}

async function writeLibraryRow(cfg, row) {
  if (cfg.memory) {
    memoryAccounts().libraries.set(`${row.user_id}:${row.kind}`, row);
    return;
  }
  await db(
    cfg,
    `insert into user_libraries (user_id, kind, data, updated_at)
     values ($1, $2, $3, $4)
     on conflict (user_id, kind) do update set
       data = excluded.data,
       updated_at = excluded.updated_at`,
    [row.user_id, row.kind, row.data, row.updated_at]
  );
}

export async function syncLibrary(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { cfg, user } = await requirePro(req, ['GET', 'POST']);
    if (req.method === 'GET') {
      const kind = queryParam(req, 'kind');
      if (!isLibraryKind(kind)) throw new ApiError(400, 'Bad library kind');
      const row = await readLibraryRow(cfg, user.id, kind);
      if (!row) {
        res.status(200).json({ kind, data: null, updatedAt: 0 });
        return;
      }
      let data = null;
      try { data = JSON.parse(row.data); } catch (_) { data = null; }
      res.status(200).json({ kind, data, updatedAt: Number(row.updated_at) || 0 });
      return;
    }

    const body = parseBody(req);
    const kind = body.kind;
    if (!isLibraryKind(kind)) throw new ApiError(400, 'Bad library kind');
    const rawAt = Number(body.updatedAt);
    if (!Number.isFinite(rawAt) || rawAt <= 0) throw new ApiError(400, 'Bad updatedAt');
    const updatedAt = Math.floor(rawAt);

    const validData = kind === 'looks'
      ? Array.isArray(body.data)
      : Boolean(body.data && typeof body.data === 'object' && !Array.isArray(body.data));
    if (!validData) throw new ApiError(400, 'Bad library data');

    const dataStr = JSON.stringify(body.data);
    if (utf8Bytes(dataStr) > SYNC_LIMITS.maxLibraryBytes) {
      throw new MeterError(413, 'too_large', 'Library is over 2 MB.');
    }

    const existing = await readLibraryRow(cfg, user.id, kind);
    if (existing && Number(existing.updated_at) > updatedAt) {
      throw new MeterError(409, 'conflict', 'Library changed elsewhere.', { serverUpdatedAt: Number(existing.updated_at) });
    }

    await writeLibraryRow(cfg, { user_id: user.id, kind, data: dataStr, updated_at: updatedAt });
    res.status(200).json({ kind, updatedAt });
  } catch (e) {
    fail(res, e);
  }
}
