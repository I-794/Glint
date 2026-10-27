// v41 — Share links: one serverless function for every share route. The Hobby
// plan allows 12 functions per deployment, so instead of one file per route,
// vercel.json rewrites /api/share-<op> and /s/<id> here with ?op=<op>, and the
// route modules live in underscore files (which Vercel does not deploy as
// functions of their own).
import status from './_share-status.js';
import create from './_share-create.js';
import commit from './_share-commit.js';
import manifest from './_share-manifest.js';
import remove from './_share-delete.js';
import page from './_share-page.js';
import sweep from './_share-sweep.js';

const ROUTES = { status, create, commit, manifest, delete: remove, page, sweep };

export default async function handler(req, res) {
  const raw = req.query && req.query.op;
  const op = Array.isArray(raw) ? raw[0] : raw;
  const route = typeof op === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, op) ? ROUTES[op] : null;
  if (!route) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  return route(req, res);
}
