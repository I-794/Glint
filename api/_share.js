// v41 — Share links: store adapter + helpers for the api/share-* routes.
//
// Shares live in Vercel Blob under `shares/<id>/`. A tiny marker at
// `shares-pending/<id>.json` is written when a share is created and removed
// when it is committed, so the daily sweep only has to look at unfinished
// uploads. SHARE_STORE=memory swaps Blob for an in-process Map so the
// regression tests can run every route without a network.

import { createHmac, randomBytes } from 'node:crypto';
import { put, del, list, get, issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { ApiError } from './_shared.js';
import { shareKey, verifyKey, isShareId, MANIFEST_NAME, base64url } from '../src/share/share-core.js';

export const PENDING_PREFIX = 'shares-pending/';
export const pendingPath = (id) => `${PENDING_PREFIX}${id}.json`;

// A Blob store connects in one of two ways: newer stores add BLOB_STORE_ID and
// the SDK signs in with the deployment's OIDC token; older ones add
// BLOB_READ_WRITE_TOKEN. Either is enough.
export function shareConfig() {
  const memory = process.env.SHARE_STORE === 'memory';
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  const storeId = process.env.BLOB_STORE_ID || '';
  const secret = process.env.SHARE_SIGNING_SECRET || '';
  const reportEmail = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(process.env.SHARE_REPORT_EMAIL || '')
    ? process.env.SHARE_REPORT_EMAIL : '';
  return { enabled: Boolean(secret && (memory || token || storeId)), memory, token, secret, reportEmail };
}

export function requireEnabled() {
  const cfg = shareConfig();
  if (!cfg.enabled) throw new ApiError(501, 'Sharing is not set up');
  return cfg;
}

export const hmacNode = (secret, msg) => createHmac('sha256', secret).update(msg).digest();
export const randomNode = (n) => randomBytes(n);
export const keyFor = (secret, id) => shareKey(hmacNode, secret, id);
export const checkKey = (secret, id, key) => verifyKey(hmacNode, secret, id, key);

export function readId(value) {
  const id = Array.isArray(value) ? value[0] : value;
  if (!isShareId(id)) throw new ApiError(400, 'Bad share id');
  return id;
}

// Errors that are not ApiErrors are logged and answered with a generic 500,
// so storage internals never reach the client.
export function sendError(res, error) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error('[share]', error);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
}

export function siteOrigin(req) {
  const h = req.headers || {};
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  const proto = String(h['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return '';
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

// ── stores ───────────────────────────────────────────────────────────────────

const memory = new Map();   // pathname -> { body: Buffer, contentType, size, uploadedAt }
export function memoryStoreEntries() { return memory; }
// Under the Blob domain so the share page's content policy lets tests load it.
const MEMORY_BASE = 'https://memory.public.blob.vercel-storage.com/';

const memoryStore = {
  async put(pathname, body, { contentType } = {}) {
    if (memory.has(pathname)) throw new ApiError(409, 'Already exists');
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : new Uint8Array(body));
    memory.set(pathname, { body: buf, contentType, size: buf.length, uploadedAt: new Date() });
    return { url: MEMORY_BASE + pathname, pathname };
  },
  async list(prefix) {
    return [...memory.entries()]
      .filter(([p]) => p.startsWith(prefix))
      .map(([pathname, e]) => ({ pathname, size: e.size, uploadedAt: e.uploadedAt, url: MEMORY_BASE + pathname }));
  },
  async del(pathnames) { pathnames.forEach((p) => memory.delete(p)); },
  async getJson(pathname) {
    const e = memory.get(pathname);
    if (!e) return null;
    return { data: JSON.parse(e.body.toString('utf8')), url: MEMORY_BASE + pathname };
  },
  // A presigned payload shaped like the real one (the browser's Blob client
  // reads the store id out of the delegation token); a local test server
  // catches the upload requests.
  async presignPut({ pathname }) {
    const enc = (o) => base64url(new TextEncoder().encode(JSON.stringify(o)));
    return { delegationToken: `${enc({ storeId: 'store_memory', pathname })}.memory`, signature: 'memory', params: {} };
  },
};

function blobStore(token) {
  // With no read-write token the SDK falls back to OIDC + BLOB_STORE_ID.
  const auth = token ? { token } : {};
  return {
    async put(pathname, body, { contentType, cacheSeconds } = {}) {
      return put(pathname, body, {
        access: 'public', ...auth, contentType, addRandomSuffix: false, allowOverwrite: false,
        ...(cacheSeconds ? { cacheControlMaxAge: cacheSeconds } : {}),
      });
    },
    async list(prefix) {
      const out = [];
      let cursor;
      do {
        const page = await list({ prefix, cursor, ...auth, limit: 1000 });
        out.push(...page.blobs.map((b) => ({ pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt), url: b.url })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },
    async del(pathnames) {
      if (pathnames.length) await del(pathnames, { ...auth });
    },
    async getJson(pathname) {
      const res = await get(pathname, { access: 'public', ...auth, useCache: false }).catch((e) => {
        if (e && e.name === 'BlobNotFoundError') return null;
        throw e;
      });
      if (!res || res.statusCode !== 200) return null;
      return { data: await new Response(res.stream).json(), url: res.blob.url };
    },
    // A presigned PUT for exactly one path, type and size. Deleted files can
    // stay in the CDN cache for up to cacheSeconds, so it is kept short (an
    // hour) rather than Blob's one-month default. `body` is the Blob client's
    // own 'blob.generate-presigned-url' request, answered by its helper.
    async presignPut({ pathname, type, maxBytes, validUntil, cacheSeconds, body, req }) {
      const urlOptions = {
        validUntil,
        allowedContentTypes: [type],
        maximumSizeInBytes: maxBytes,
        allowOverwrite: false,
        addRandomSuffix: false,
        cacheControlMaxAge: cacheSeconds,
      };
      const out = await handleUploadPresigned({
        body,
        request: req,
        // Only used to verify upload-completed callbacks, which shares do not
        // request; the helper insists on a value.
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused',
        getSignedToken: async () => ({
          token: await issueSignedToken({ ...auth, pathname, operations: ['put'], validUntil, allowedContentTypes: [type], maximumSizeInBytes: maxBytes }),
          urlOptions,
        }),
      });
      return out.presignedUrlPayload;
    },
  };
}

export function store(cfg = shareConfig()) {
  return cfg.memory ? memoryStore : blobStore(cfg.token);
}

export async function readManifest(st, id) {
  const got = await st.getJson(`shares/${id}/${MANIFEST_NAME}`);
  if (!got) return null;
  return { manifest: got.data, base: got.url.slice(0, got.url.length - MANIFEST_NAME.length) };
}
