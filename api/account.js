// Glint Pro groundwork: one serverless function for every account route,
// dispatched on ?op= like api/share.js (the Hobby plan allows 12 functions).
// Today that is `me`; checkout, the billing portal and the payment webhook
// join it when billing is built.
import { me } from './_account.js';

const ROUTES = { me };

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
