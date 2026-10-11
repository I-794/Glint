import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { getKey } from './api-keys.js';
import { revealSection } from './studio-nav.js';

function imageToDataUrl(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

function dataUrlToBase64(url) {
  const i = url.indexOf(',');
  return i >= 0 ? url.slice(i + 1) : url;
}

function setAiStatus(msg) {
  const s = document.getElementById('ai-cloud-status');
  if (s) s.textContent = msg || '';
}

function showAiResult(text) {
  const out = document.getElementById('ai-cloud-result');
  if (!out) return;
  if (!text) { out.style.display = 'none'; out.textContent = ''; return; }
  out.style.display = 'block';
  out.textContent = text;
}

function promptForKey() {
  const details = document.getElementById('api-keys-details');
  if (details) {
    revealSection(details);   // v35 — the key fields live in a Pro-only section
    details.open = true;
    details.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const inp = document.getElementById('anthropic-key-input');
    if (inp) setTimeout(() => inp.focus(), 300);
  }
}

async function tryHostedJson(path, body) {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 404 || r.status === 501) return { fellThrough: true };
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Backend error ${r.status}`);
    return data;
  } catch (e) {
    if (e.message && /Backend error/.test(e.message)) throw e;
    return { fellThrough: true };
  }
}

async function chooseProvider(needVision) {
  const oai = getKey('openai');
  const ant = getKey('anthropic');
  // Prefer Anthropic for vision when both present
  if (needVision && ant) return { provider: 'anthropic', key: ant };
  if (oai) return { provider: 'openai', key: oai };
  if (ant) return { provider: 'anthropic', key: ant };
  return null;
}

async function callAnthropicVision(key, prompt, dataUrl) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: dataUrlToBase64(dataUrl) } },
        { type: 'text', text: prompt }
      ]
    }]
  });
  return res.content?.[0]?.text || '';
}

async function callOpenAIVision(key, prompt, dataUrl) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  const res = await client.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    max_completion_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }]
  });
  return res.choices?.[0]?.message?.content || '';
}

async function callHostedVision(prompt, dataUrl) {
  const out = await tryHostedJson('/api/ai-vision', {
    prompt,
    image: dataUrlToBase64(dataUrl),
    mimeType: 'image/png'
  });
  if (out.fellThrough) return null;
  return out;
}

async function callHostedImageGenerate(prompt, size) {
  const out = await tryHostedJson('/api/image-generate', { prompt, size });
  if (out.fellThrough) return null;
  return out.b64;
}

async function runVisionPrompt(prompt) {
  if (!state.image) { showNotification('Load an image first.', 'error'); return null; }
  const dataUrl = imageToDataUrl(state.image);
  setAiStatus('Checking hosted AI...');
  try {
    const hosted = await callHostedVision(prompt, dataUrl);
    if (hosted?.text) {
      setAiStatus(`Done via hosted ${hosted.provider || 'AI'}.`);
      return hosted.text;
    }
  } catch (e) {
    console.warn('Hosted vision failed; falling back to browser key.', e);
  }

  const choice = await chooseProvider(true);
  if (!choice) {
    showNotification('Hosted AI is not configured yet. Paste your Claude or OpenAI key below to use this locally.', 'error');
    promptForKey();
    return null;
  }
  setAiStatus(`Calling ${choice.provider}…`);
  try {
    const out = choice.provider === 'anthropic'
      ? await callAnthropicVision(choice.key, prompt, dataUrl)
      : await callOpenAIVision(choice.key, prompt, dataUrl);
    setAiStatus(`Done via ${choice.provider}.`);
    return out;
  } catch (e) {
    console.error(e);
    setAiStatus('Failed.');
    showNotification(`AI call failed: ${e.message || e}`, 'error');
    return null;
  }
}

async function callAnthropicText(key, prompt, json) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const system = json ? 'Respond with ONLY valid minified JSON — no markdown fences, no commentary.' : undefined;
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }]
  });
  return res.content?.[0]?.text || '';
}

async function callOpenAIText(key, prompt, json) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  const res = await client.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    max_completion_tokens: 1024,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [{ role: 'user', content: prompt }]
  });
  return res.choices?.[0]?.message?.content || '';
}

// Text-only sibling of runVisionPrompt: BYOK chat call with optional JSON mode.
// (OpenAI's json_object format requires the word "JSON" to appear in the prompt;
// callers building JSON prompts should include it.) Returns the raw string or
// null (after prompting for a key) when no provider is configured.
export async function runTextPrompt(prompt, { json = false } = {}) {
  // BYO key wins if the user set one ("BYOK if you want"); otherwise fall back to
  // the hosted proxy (server OPENAI_API_KEY) before prompting for a key.
  const choice = await chooseProvider(false);
  if (!choice) {
    try {
      const hosted = await tryHostedJson('/api/ai-text', { prompt, json });
      if (!hosted.fellThrough && typeof hosted.text === 'string') {
        setAiStatus('Done via hosted AI.');
        return hosted.text;
      }
    } catch (e) {
      console.warn('Hosted text failed; prompting for a key.', e);
    }
    showNotification('Add a Claude or OpenAI key below to use AI features.', 'error');
    promptForKey();
    return null;
  }
  setAiStatus(`Calling ${choice.provider}…`);
  try {
    const out = choice.provider === 'anthropic'
      ? await callAnthropicText(choice.key, prompt, json)
      : await callOpenAIText(choice.key, prompt, json);
    setAiStatus(`Done via ${choice.provider}.`);
    return out;
  } catch (e) {
    console.error(e);
    setAiStatus('Failed.');
    showNotification(`AI call failed: ${e.message || e}`, 'error');
    return null;
  }
}

// Parse a JSON value from a model response, tolerating markdown fences and
// surrounding prose. Returns null on failure.
export function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const span = t.match(/[{[][\s\S]*[}\]]/);
  if (span) t = span[0];
  try { return JSON.parse(t); } catch (_) { return null; }
}

// v30 — structured-vision sibling of runVisionPrompt. Asks the model for a JSON
// object and returns it parsed (or null). Reused by Brand Brain (URL→system),
// the AI Screenshot Editor (locate regions), and the Producer (goal→plan).
// OpenAI's json_object mode requires the literal word "JSON" in the prompt, so
// callers MUST include it (the wrappers below append a reminder defensively).
async function callAnthropicVisionJson(key, prompt, dataUrl) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'Respond with ONLY valid minified JSON — no markdown fences, no commentary.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: dataUrlToBase64(dataUrl) } },
        { type: 'text', text: prompt }
      ]
    }]
  });
  return res.content?.[0]?.text || '';
}

async function callOpenAIVisionJson(key, prompt, dataUrl) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  const res = await client.chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    max_completion_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt + '\n\nRespond with a single JSON object.' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }]
  });
  return res.choices?.[0]?.message?.content || '';
}

// Run a vision prompt against an explicit dataURL and parse the JSON reply.
export async function runVisionJsonOnDataUrl(prompt, dataUrl) {
  if (!dataUrl) return null;
  // Hosted proxy first (text response carrying JSON), then BYO-key.
  setAiStatus('Checking hosted AI…');
  try {
    const hosted = await callHostedVision(prompt + '\n\nRespond with a single JSON object.', dataUrl);
    if (hosted?.text) {
      const parsed = parseJsonLoose(hosted.text);
      if (parsed) { setAiStatus(`Done via hosted ${hosted.provider || 'AI'}.`); return parsed; }
    }
  } catch (e) {
    console.warn('Hosted vision (json) failed; falling back to browser key.', e);
  }
  const choice = await chooseProvider(true);
  if (!choice) {
    showNotification('Add a Claude or OpenAI key below to use this feature.', 'error');
    promptForKey();
    return null;
  }
  setAiStatus(`Calling ${choice.provider}…`);
  try {
    const raw = choice.provider === 'anthropic'
      ? await callAnthropicVisionJson(choice.key, prompt, dataUrl)
      : await callOpenAIVisionJson(choice.key, prompt, dataUrl);
    setAiStatus(`Done via ${choice.provider}.`);
    return parseJsonLoose(raw);
  } catch (e) {
    console.error(e);
    setAiStatus('Failed.');
    showNotification(`AI call failed: ${e.message || e}`, 'error');
    return null;
  }
}

// Convenience: run against the currently loaded screenshot.
export async function runVisionJson(prompt) {
  if (!state.image) { showNotification('Load an image first.', 'error'); return null; }
  return runVisionJsonOnDataUrl(prompt, imageToDataUrl(state.image));
}

export async function aiAltText() {
  const out = await runVisionPrompt(
    'Write concise, accessible alt text for this image (1-2 sentences, no preamble). Describe the most important visible content.'
  );
  if (out) showAiResult(out);
}

const CAPTION_MODES = {
  social: 'Write a short, punchy social-media caption for this image (under 25 words, no hashtags, no preamble).',
  technical: 'Write a technical description of this image suitable for documentation. Focus on UI elements, layout, and technical details. Be precise and concise (2-3 sentences, no preamble).',
  accessibility: 'Write a detailed, accessible alt text for this image following WCAG guidelines. Describe all meaningful visual content, layout, and relationships. Be thorough but concise (2-4 sentences, no preamble).',
  seo: 'Write an SEO-optimized description for this image suitable for a website meta description or image caption. Include relevant keywords naturally. (1-2 sentences, under 160 characters, no preamble).'
};

export async function aiCaption() {
  const modeSelect = document.getElementById('ai-caption-mode');
  const mode = modeSelect ? modeSelect.value : 'social';
  const prompt = CAPTION_MODES[mode] || CAPTION_MODES.social;
  const out = await runVisionPrompt(prompt);
  if (out) showAiResult(out);
}

export async function aiScreenshotToCode() {
  const out = await runVisionPrompt(
    'This is a UI screenshot. Produce a single self-contained HTML file (with inline CSS) that recreates the visible interface as closely as possible. Return ONLY the code, no markdown fences or commentary.'
  );
  if (out) showAiResult(out);
}

// v19 — reusable text→background generator. Tries hosted gpt-image-2, then a
// BYO OpenAI key (also gpt-image-2, for consistent output). Returns a loaded
// Image. Throws an error with code 'NO_KEY' when neither is available.
export async function generateBackgroundImage(prompt, size) {
  let b64 = await callHostedImageGenerate(prompt, size);
  if (!b64) {
    const key = getKey('openai');
    if (!key) { const e = new Error('No AI key'); e.code = 'NO_KEY'; throw e; }
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    const res = await client.images.generate({ model: OPENAI_IMAGE_MODEL, prompt, size, n: 1 });
    b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned');
  }
  const dataUrl = 'data:image/png;base64,' + b64;
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
  return img;
}

async function copyAiResult() {
  const out = document.getElementById('ai-cloud-result');
  if (!out || !out.textContent) return;
  try {
    await navigator.clipboard.writeText(out.textContent);
    showNotification('Copied.', 'success');
  } catch (e) {}
}

export function bindAiCloud() {
  const alt = document.getElementById('ai-alt-btn');
  const cap = document.getElementById('ai-caption-btn');
  const s2c = document.getElementById('ai-s2c-btn');
  const cp = document.getElementById('ai-copy-btn');
  if (alt) alt.addEventListener('click', aiAltText);
  if (cap) cap.addEventListener('click', aiCaption);
  if (s2c) s2c.addEventListener('click', aiScreenshotToCode);
  if (cp) cp.addEventListener('click', copyAiResult);
}

// v20 — AI Design Agent provider layer. Configurable model per provider (bump
// these as stronger models ship; defaults are known-good ids in this codebase).
// v30 — OpenAI model policy (product decision): gpt-image-2 for image
// generation/editing, gpt-5.5 for ALL text / vision / agent reasoning. Single
// source of truth — flip OPENAI_TEXT_MODEL if OpenAI's exact id differs (e.g. a
// dated snapshot). The hosted routes mirror this and also honor the
// OPENAI_VISION_MODEL / OPENAI_ENHANCE_MODEL env overrides. The Anthropic BYO
// path keeps its own model.
export const OPENAI_TEXT_MODEL = 'gpt-5.5';
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const AGENT_MODELS = { openai: OPENAI_TEXT_MODEL, anthropic: 'claude-sonnet-4-6' };
const AGENT_MAX_TOKENS = 1500;

// Convert neutral history → OpenAI chat messages.
function toOpenAIMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.content || '' };
      if (m.toolCalls && m.toolCalls.length) {
        msg.content = m.content || null;
        msg.tool_calls = m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args || {}) } }));
      }
      out.push(msg);
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

// Convert neutral history → Anthropic messages (tool_result blocks must ride in a
// user turn; consecutive tool messages are merged into one user message).
function toAnthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const t of (m.toolCalls || [])) content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.args || {} });
      out.push({ role: 'assistant', content });
    } else if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

async function openAIAgentTurn(key, system, messages, tools, onText) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  const stream = await client.chat.completions.create({
    model: AGENT_MODELS.openai,
    max_completion_tokens: AGENT_MAX_TOKENS,
    messages: toOpenAIMessages(system, messages),
    tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    stream: true
  });
  let text = '';
  const acc = [];
  for await (const chunk of stream) {
    const d = chunk.choices?.[0]?.delta || {};
    if (d.content) { text += d.content; onText && onText(d.content); }
    for (const tc of (d.tool_calls || [])) {
      const i = tc.index;
      acc[i] = acc[i] || { id: '', name: '', args: '' };
      if (tc.id) acc[i].id = tc.id;
      if (tc.function?.name) acc[i].name += tc.function.name;
      if (tc.function?.arguments) acc[i].args += tc.function.arguments;
    }
  }
  const toolCalls = acc.filter(Boolean).map(t => ({ id: t.id, name: t.name, args: safeJson(t.args) }));
  return { text, toolCalls };
}

async function anthropicAgentTurn(key, system, messages, tools, onText) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const stream = client.messages.stream({
    model: AGENT_MODELS.anthropic,
    max_tokens: AGENT_MAX_TOKENS,
    system,
    messages: toAnthropicMessages(messages),
    tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  });
  if (onText) stream.on('text', (t) => onText(t));
  const final = await stream.finalMessage();
  let text = '';
  const toolCalls = [];
  for (const block of (final.content || [])) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input || {} });
  }
  return { text, toolCalls };
}

function safeJson(s) { try { return JSON.parse(s || '{}'); } catch (_) { return {}; } }

// One normalized tool-calling turn. Returns { text, toolCalls:[{id,name,args}] }.
// BYO key streams (onText); the hosted fallback is non-streaming.
// Throws { code:'NO_KEY' } only when neither a BYO key nor the hosted proxy works.
export async function runAgentTurn(messages, tools, { system = '', onText = null } = {}) {
  // BYO key wins if the user set one ("BYOK if you want"); else hosted server key.
  const choice = await chooseProvider(false);
  if (!choice) {
    const hosted = await tryHostedAgentTurn(system, messages, tools);
    if (hosted) return hosted;
    const e = new Error('No AI key'); e.code = 'NO_KEY'; throw e;
  }
  return choice.provider === 'anthropic'
    ? anthropicAgentTurn(choice.key, system, messages, tools, onText)
    : openAIAgentTurn(choice.key, system, messages, tools, onText);
}

// Hosted (server-key) tool-calling turn via /api/ai-agent. The client pre-converts
// to OpenAI shape so the route stays a thin forwarder. Non-streaming. Returns the
// normalized { text, toolCalls } or null when the proxy isn't available (BYO path).
async function tryHostedAgentTurn(system, messages, tools) {
  try {
    const out = await tryHostedJson('/api/ai-agent', {
      messages: toOpenAIMessages(system, messages),
      tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      model: AGENT_MODELS.openai
    });
    if (out.fellThrough) return null;
    return { text: out.text || '', toolCalls: Array.isArray(out.toolCalls) ? out.toolCalls : [] };
  } catch (e) {
    console.warn('Hosted agent turn failed; falling back.', e);
    return null;
  }
}

// Vision critique of an arbitrary rendered dataURL (the agent's look_at_canvas).
// Reuses the existing hosted/BYO vision paths. Returns text or a graceful note.
export async function runVisionOnDataUrl(prompt, dataUrl) {
  try {
    const hosted = await callHostedVision(prompt, dataUrl);
    if (hosted?.text) return hosted.text;
  } catch (_) {}
  const choice = await chooseProvider(true);
  if (!choice) return 'I could not see the canvas (no vision-capable key configured).';
  try {
    return choice.provider === 'anthropic'
      ? await callAnthropicVision(choice.key, prompt, dataUrl)
      : await callOpenAIVision(choice.key, prompt, dataUrl);
  } catch (e) { return 'I could not analyze the canvas right now.'; }
}
