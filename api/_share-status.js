// v41 — Share links: tells the editor whether links work on this deployment.
import { shareConfig } from './_share.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.status(200).json({ enabled: shareConfig().enabled });
}
