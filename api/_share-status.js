// v41 — Share links: tells the editor whether links work on this deployment.
import { shareConfig } from './_share.js';
import { accountConfig } from './_account.js';
import { billingConfig } from './_billing.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const freeMaxExpiry = accountConfig().enabled && billingConfig().enabled ? '30d' : 'never';
  res.status(200).json({ enabled: shareConfig().enabled, freeMaxExpiry });
}
