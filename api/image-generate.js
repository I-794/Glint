// v9.1 — Vercel serverless proxy: text→image generation via OpenAI gpt-image-2.
//
// Keeps the OpenAI key server-side (OPENAI_API_KEY env var) so hosted users
// don't need their own key. Returns HTTP 501 when no server key is configured,
// which signals the client to fall back to bring-your-own-key (local dev).
//
// Request  (POST JSON): { prompt: string, size?: '1024x1024'|'1536x1024'|'1024x1536' }
// Response (200 JSON):  { b64: string }   // base64 PNG, no data: prefix

import { metered } from './_account.js';

export default metered('image', handler);

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(501).json({ error: 'No server key configured' });
    return;
  }
  try {
    const { prompt, size } = req.body || {};
    if (!prompt) { res.status(400).json({ error: 'Missing prompt' }); return; }
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size: size || '1024x1024', n: 1 })
    });
    const data = await r.json();
    if (!r.ok) { res.status(r.status).json({ error: data.error?.message || 'OpenAI error' }); return; }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) { res.status(502).json({ error: 'No image returned' }); return; }
    res.status(200).json({ b64 });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
