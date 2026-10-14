// v20 — Agent memory. Per-project conversation + global learned preferences,
// in localStorage. Not part of undo/state (these are agent features).

import { state } from '../state/state.js';

const CHAT_PREFIX = 'glint_agent_chat_';
const MEM_KEY = 'glint_agent_memory';
const MAX_TURNS = 20;     // keep last N messages (lossy by design)
const MAX_MEMORY = 20;    // keep last N learned-preference notes

function projectId() {
  // Use the active project id when available, else a global bucket.
  return (state.project && state.project.id) ? state.project.id : 'global';
}

export function loadChat() {
  try { return JSON.parse(localStorage.getItem(CHAT_PREFIX + projectId())) || []; }
  catch (_) { return []; }
}
export function saveChat(messages) {
  try {
    const trimmed = messages.slice(-MAX_TURNS);
    localStorage.setItem(CHAT_PREFIX + projectId(), JSON.stringify(trimmed));
  } catch (_) {}
}
export function clearChat() {
  try { localStorage.removeItem(CHAT_PREFIX + projectId()); } catch (_) {}
}

export function loadMemory() {
  try { return JSON.parse(localStorage.getItem(MEM_KEY)) || []; }
  catch (_) { return []; }
}
export function addMemory(note) {
  if (!note || typeof note !== 'string') return;
  const n = note.trim().slice(0, 200);
  if (!n) return;
  let mem = loadMemory();
  if (mem.some(x => x.toLowerCase() === n.toLowerCase())) return; // dedupe
  mem.push(n);
  mem = mem.slice(-MAX_MEMORY);
  try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (_) {}
}
