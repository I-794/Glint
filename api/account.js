// Glint Pro groundwork: one serverless function for every account route,
// dispatched on ?op= like api/share.js (the Hobby plan allows 12 functions).
// `me` is the account itself; the rest is billing (api/_billing.js): checkout,
// confirming a finished checkout, the billing portal and Stripe's webhook.
import { me } from './_account.js';
import { checkout, confirm, portal, webhook } from './_billing.js';
import { shares, syncList, syncProject, syncLibrary } from './_sync.js';

const ROUTES = {
  me,
  checkout,
  confirm,
  portal,
  webhook,
  shares,
  'sync-list': syncList,
  'sync-project': syncProject,
  'sync-library': syncLibrary,
};

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
