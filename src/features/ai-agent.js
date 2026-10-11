// v20 — AI Design Agent: conversational copilot. Owns the message history, the
// tool-use loop, the panel, and persistence. Renders streamed assistant text,
// narrates tool actions live, and surfaces suggestion chips.

import { state } from '../state/state.js';
import { saveStateToHistory } from '../state/history.js';
import { render } from '../render/render.js';
import { runAgentTurn } from './ai-cloud.js';
import { TOOLS, runTool, consumeChips } from './agent-tools.js';
import { loadChat, saveChat, loadMemory } from './agent-memory.js';
import { getPageMeta } from './pages.js';
import { revealSection } from './studio-nav.js';

const MAX_ITERS = 8;
let messages = [];          // neutral history
let running = false;
let stopFlag = false;

function systemPrompt() {
  const mem = loadMemory();
  const memBlock = mem.length ? `\nThings you remember about this user:\n- ${mem.join('\n- ')}` : '';
  const c = state.canvas;
  const lines = [
    'You are the SnapShotPro Design Agent. You design and refine the PRESENTATION of a screenshot by calling tools.',
    'Prefer apply_design for background/frame/layout/shadow/filter/color changes. Use generate_background for AI imagery, isolate_subject for product-shot composites, set_palette for color schemes, set_text for headlines, set_filters for tone, look_at_canvas when unsure about visual quality.',
    'Be tasteful and on-brand. Keep replies short. After acting, ALWAYS call suggest_next with 2-4 short follow-up prompts.',
    `Canvas is ${c.width}x${c.height}. Do not edit the screenshot content beyond isolate/background.`,
    memBlock
  ];
  if (state.mode === 'board') {
    const meta = getPageMeta();
    const list = meta.slice(0, 12).map((m, i) => `card ${i + 1}: pageId ${m.id}`).join('; ');
    const more = meta.length > 12 ? ` (and ${meta.length - 12} more)` : '';
    lines.push(`\nThe user is on the Open Canvas board, viewing ${meta.length} card${meta.length === 1 ? '' : 's'} (each card is a page). Card page ids: ${list}${more}. You can drive the board: add_page_from_url (seed cards from a link), add_page (add/duplicate a card), arrange_cards (layout grid|row|hero|bento; pass page ids or omit for all), group_cards (pass ≥2 page ids; returns the group id), ungroup (pass the group id), export_board (export the whole board as one PNG).`);
  }
  return lines.join('\n');
}

function el(id) { return document.getElementById(id); }

function addLine(role, text) {
  const log = el('agent-log');
  if (!log) return null;
  const div = document.createElement('div');
  div.className = 'agent-msg agent-' + role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function renderChips(chips) {
  const row = el('agent-chips');
  if (!row) return;
  row.innerHTML = '';
  for (const c of chips) {
    const b = document.createElement('button');
    b.className = 'agent-chip'; b.type = 'button'; b.textContent = c;
    b.addEventListener('click', () => { const inp = el('agent-input'); if (inp) inp.value = c; send(); });
    row.appendChild(b);
  }
}

function renderHistory() {
  const log = el('agent-log');
  if (!log) return;
  log.innerHTML = '';
  for (const m of messages) {
    if (m.role === 'user') addLine('user', m.content);
    else if (m.role === 'assistant' && m.content) addLine('assistant', m.content);
  }
}

function setStatus(s) { const e = el('agent-status'); if (e) e.textContent = s || ''; }

async function send() {
  if (running) return;
  const inp = el('agent-input');
  const text = inp ? inp.value.trim() : '';
  if (!text) return;
  inp.value = '';
  renderChips([]);
  messages.push({ role: 'user', content: text });
  addLine('user', text);
  running = true; stopFlag = false;
  const stopBtn = el('agent-stop'); if (stopBtn) stopBtn.style.display = 'inline-block';
  saveStateToHistory();   // whole turn = one undo step

  try {
    let iters = 0;
    while (iters++ < MAX_ITERS) {
      if (stopFlag) { addLine('assistant', 'Stopped.'); break; }
      setStatus('Thinking…');
      let bubble = null;
      const onText = (delta) => {
        if (!bubble) bubble = addLine('assistant', '');
        bubble.textContent += delta;
        const log = el('agent-log'); if (log) log.scrollTop = log.scrollHeight;
      };
      const turn = await runAgentTurn(messages, TOOLS, { system: systemPrompt(), onText });
      messages.push({ role: 'assistant', content: turn.text || '', toolCalls: turn.toolCalls });

      if (!turn.toolCalls || !turn.toolCalls.length) break;   // model is done talking

      for (const call of turn.toolCalls) {
        if (call.name !== 'suggest_next') setStatus(`Running ${call.name}…`);
        const result = await runTool(call.name, call.args);
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
        if (call.name !== 'suggest_next') addLine('action', `• ${result}`);
      }
      render();
      if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
    }
  } catch (e) {
    if (e && e.code === 'NO_KEY') {
      addLine('assistant', 'Add an OpenAI or Claude key in AI settings to use the Design Agent.');
      const d = el('api-keys-details'); if (d) { revealSection(d); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } else {
      console.error(e);
      addLine('assistant', `Something went wrong: ${e.message || e}`);
    }
  } finally {
    running = false;
    setStatus('');
    if (stopBtn) stopBtn.style.display = 'none';
    render();
    if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
    renderChips(consumeChips());
    saveChat(messages);
  }
}

export function bindAiAgent() {
  messages = loadChat();
  renderHistory();
  el('agent-send')?.addEventListener('click', send);
  el('agent-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  el('agent-stop')?.addEventListener('click', () => { stopFlag = true; });
}
