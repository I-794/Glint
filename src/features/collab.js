// v11.4 — Live collaboration over Supabase Realtime.
//
// A session is an id carried in a ?collab=<id> link. Everyone who joins
// subscribes to the channel `project:<id>` and shares:
//   - presence + live cursors (rendered as fixed overlay divs above the canvas,
//     never on it, so they never enter exports), and
//   - design state: on each local commit we broadcast snapshotProject() (the
//     shared serializer); on receive we Object.assign + render + refresh UI.
//
// Sync is last-write-wins (documented; no CRDT). We broadcast only on commits —
// saveStateToHistory() fires onHistoryChange, our broadcast trigger — and we
// suppress re-broadcast while applying a remote update, so there's no echo and
// remote updates never pollute local undo history (they don't call
// saveStateToHistory at all).

import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { render } from '../render/render.js';
import { showNotification } from '../ui/notification.js';
import { getClient, getUser } from './auth.js';
import { snapshotProject } from '../state/serialize.js';
import { onHistoryChange } from '../state/history.js';

let channel = null;
let applyingRemote = false;
let selfKey = null;
let sessionId = null;
let lastStateSend = 0;
let lastCursorSend = 0;
const cursors = {}; // key -> { name, color, xFrac, yFrac }

const PALETTE = ['#ff3b30', '#34c759', '#007aff', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa'];
const me = {
  name: 'Guest ' + Math.floor(Math.random() * 900 + 100),
  color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
};

function rand() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) ;
}

// ---- cursor overlay -------------------------------------------------------

let overlay = null;
function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'collab-cursors';
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9000;';
  document.body.appendChild(overlay);
  return overlay;
}

function renderCursors() {
  const box = ensureOverlay();
  const canvas = el.previewCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  box.innerHTML = Object.entries(cursors).map(([key, c]) => {
    if (key === selfKey) return '';
    const x = rect.left + (c.xFrac || 0) * rect.width;
    const y = rect.top + (c.yFrac || 0) * rect.height;
    return `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-2px,-2px);transition:left .08s linear,top .08s linear;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${c.color}" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));"><path d="M4 2l7 18 2.5-7.5L21 10z"/></svg>
      <span style="background:${c.color};color:#fff;font:500 11px system-ui;padding:1px 6px;border-radius:8px;margin-left:6px;white-space:nowrap;">${escape(c.name || 'Guest')}</span>
    </div>`;
  }).join('');
}

function escape(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function clearCursors() {
  if (overlay) overlay.innerHTML = '';
}

// ---- state sync -----------------------------------------------------------

function applyRemoteState(payload) {
  applyingRemote = true;
  try {
    // v40 — pins are per-page project data and never travel in collab
    // updates; a peer's payload is not trusted to set them.
    const next = { ...(payload || {}) };
    delete next.versions;
    Object.assign(state, next);
    render();
    if (typeof window.__updateUIFromState === 'function') window.__updateUIFromState();
  } finally {
    applyingRemote = false;
  }
}

function broadcastState() {
  if (!channel || applyingRemote) return;
  const now = Date.now();
  if (now - lastStateSend < 100) return; // ~10/s cap
  lastStateSend = now;
  channel.send({ type: 'broadcast', event: 'state', payload: snapshotProject() });
}

function onPointerMove(e) {
  if (!channel) return;
  const canvas = el.previewCanvas;
  if (!canvas) return;
  const now = Date.now();
  if (now - lastCursorSend < 50) return; // ~20/s
  lastCursorSend = now;
  const rect = canvas.getBoundingClientRect();
  const xFrac = (e.clientX - rect.left) / rect.width;
  const yFrac = (e.clientY - rect.top) / rect.height;
  channel.send({ type: 'broadcast', event: 'cursor', payload: { key: selfKey, name: me.name, color: me.color, xFrac, yFrac } });
}

// ---- session lifecycle ----------------------------------------------------

export async function joinSession(id) {
  const client = await getClient();
  if (!client) { showNotification('Connect Supabase to collaborate.', 'error'); return false; }

  if (channel) await leaveSession();
  sessionId = id;
  selfKey = rand();
  const user = getUser();
  if (user?.email) me.name = user.email.split('@')[0];

  channel = client.channel(`project:${id}`, { config: { presence: { key: selfKey } } });

  channel
    .on('broadcast', { event: 'state' }, ({ payload }) => applyRemoteState(payload))
    .on('broadcast', { event: 'cursor' }, ({ payload }) => {
      if (!payload || payload.key === selfKey) return;
      cursors[payload.key] = payload;
      renderCursors();
    })
    .on('presence', { event: 'sync' }, () => {
      const stateP = channel.presenceState();
      const live = new Set(Object.keys(stateP));
      for (const k of Object.keys(cursors)) if (!live.has(k)) delete cursors[k];
      renderCursors();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ name: me.name, color: me.color });
        broadcastState(); // share current design with whoever's already here
      }
    });

  document.addEventListener('pointermove', onPointerMove, true);
  updateCollabUI(true);
  showNotification('Live session started. Share the link to collaborate.', 'success');
  return true;
}

export async function leaveSession() {
  document.removeEventListener('pointermove', onPointerMove, true);
  if (channel) { try { await channel.unsubscribe(); } catch (_) {} channel = null; }
  sessionId = null;
  for (const k of Object.keys(cursors)) delete cursors[k];
  clearCursors();
  updateCollabUI(false);
}

function shareLink() {
  const url = new URL(window.location.href);
  url.searchParams.set('collab', sessionId);
  return url.toString();
}

function updateCollabUI(active) {
  const start = document.getElementById('collab-start-btn');
  const linkBox = document.getElementById('collab-link-box');
  const linkInput = document.getElementById('collab-link');
  const status = document.getElementById('collab-status');
  if (start) start.textContent = active ? '⏹ Leave session' : '👥 Start live session';
  if (linkBox) linkBox.style.display = active ? 'block' : 'none';
  if (active && linkInput) linkInput.value = shareLink();
  if (status) status.textContent = active ? 'Live. Others can join via the link.' : '';
}

// ---- bind -----------------------------------------------------------------

export function bindCollab() {
  // Broadcast on every local commit (saveStateToHistory → onHistoryChange).
  onHistoryChange(() => broadcastState());

  const startBtn = document.getElementById('collab-start-btn');
  if (startBtn) startBtn.addEventListener('click', () => {
    if (channel) leaveSession();
    else joinSession(rand());
  });

  const copyBtn = document.getElementById('collab-copy-btn');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const input = document.getElementById('collab-link');
    if (input && input.value) {
      try { await navigator.clipboard.writeText(input.value); showNotification('Collaboration link copied.', 'success'); } catch (_) {}
    }
  });

  // Reposition cursors when the canvas moves (zoom/pan/scroll/resize).
  window.addEventListener('scroll', renderCursors, true);
  window.addEventListener('resize', renderCursors);

  // Auto-join from a ?collab=<id> link.
  const id = new URLSearchParams(window.location.search).get('collab');
  if (id) joinSession(id);
}
