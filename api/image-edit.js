// v9.1 — Vercel serverless proxy: image edit (inpaint / outpaint) via OpenAI
// gpt-image-2. Used for the magic eraser and canvas-extend (outpainting).
//
// Mask semantics (OpenAI): transparent areas of the mask mark where the image
// should be regenerated; opaque areas are kept. The client builds both PNGs.
//
// Request  (POST JSON): { image: b64png, mask: b64png, prompt: string, size?: string }
// Response (200 JSON):  { b64: string }
//
// Returns 501 when no server key is set so the client falls back to BYOK.

import { metered } from './_account.js';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

function b64ToBlob(b64, type = 'image/png') {
  const buf = Buffer.from(b64, 'base64');
  return new Blob([buf], { type });
}

export default metered('image', handler);

async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const key = process.env.OPENAI_API_KEY;
  if (!key) { res.status(501).json({ error: 'No server key configured' }); return; }
  try {
    const { image, mask, prompt, size } = req.body || {};
    if (!image || !prompt) { res.status(400).json({ error: 'Missing image or prompt' }); return; }
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt);
    form.append('size', size || 'auto');
    form.append('image', b64ToBlob(image), 'image.png');
    if (mask) form.append('mask', b64ToBlob(mask), 'mask.png');

    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: form
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
