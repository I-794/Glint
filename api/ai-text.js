// v30 — Hosted text / JSON completion proxy. Keeps OPENAI_API_KEY server-side so
// hosted visitors get text features (e.g. the Producer goal planner via
// runTextPrompt) without their own key. Returns HTTP 501 when no server key is
// configured, which signals the client to fall back to bring-your-own-key.
//
// Request  (POST JSON): { prompt: string, json?: boolean, system?: string }
// Response (200 JSON):  { text: string }

import { requirePost, parseBody, ApiError, openAIChat } from './_shared.js';
import { metered } from './_account.js';

export default metered('text', handler);

async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const { prompt, json = false, system } = parseBody(req);
    if (!prompt || typeof prompt !== 'string') throw new ApiError(400, 'Missing prompt');

    const messages = [];
    if (system) messages.push({ role: 'system', content: String(system) });
    // OpenAI's json_object mode requires the word "JSON" somewhere in the input;
    // a JSON system line guarantees it even if the prompt omits it.
    else if (json) messages.push({ role: 'system', content: 'Respond with ONLY valid minified JSON — no markdown fences, no commentary.' });
    messages.push({ role: 'user', content: prompt });

    const data = await openAIChat({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.5',
      max_tokens: 1500,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages
    });
    res.status(200).json({ text: data.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error' });
  }
}
