// v30 — Hosted tool-calling agent turn. Keeps OPENAI_API_KEY server-side so the
// Design Agent (and any runAgentTurn caller) works for hosted visitors without
// their own key. NON-streaming (the client only streams on the BYO path).
// Returns HTTP 501 when no server key is configured → client falls back to BYO.
//
// The client pre-converts to OpenAI shape, so `messages` are already OpenAI chat
// messages and `tools` are already OpenAI function tools.
//
// Request  (POST JSON): { messages: [...], tools?: [...], model?: string, max_tokens?: number }
// Response (200 JSON):  { text: string, toolCalls: [{ id, name, args }] }

import { requirePost, parseBody, ApiError, openAIChat } from './_shared.js';
import { metered } from './_account.js';

// Only allow known tool-capable chat models (the client sends AGENT_MODELS.openai).
// v30 model policy: gpt-5.5 for agent reasoning. Override with OPENAI_TEXT_MODEL.
const DEFAULT_AGENT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-5.5';
const ALLOWED_MODELS = [DEFAULT_AGENT_MODEL, 'gpt-5.5', 'gpt-4o', 'gpt-4o-mini'];

export default metered('agent', handler);

async function handler(req, res) {
  if (!requirePost(req, res)) return;
  try {
    const { messages, tools, model, max_tokens } = parseBody(req);
    if (!Array.isArray(messages) || messages.length === 0) throw new ApiError(400, 'Missing messages');

    const data = await openAIChat({
      model: ALLOWED_MODELS.includes(model) ? model : DEFAULT_AGENT_MODEL,
      max_tokens: Math.min(Number(max_tokens) || 1500, 4096),
      messages,
      ...(Array.isArray(tools) && tools.length ? { tools } : {})
    });

    const msg = data.choices?.[0]?.message || {};
    const toolCalls = (msg.tool_calls || []).map((t) => {
      let args = {};
      try { args = JSON.parse(t.function?.arguments || '{}'); } catch (_) { args = {}; }
      return { id: t.id, name: t.function?.name || '', args };
    });
    res.status(200).json({ text: msg.content || '', toolCalls });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error' });
  }
}
