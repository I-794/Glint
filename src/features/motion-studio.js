// v29 — Motion Studio: the unified multi-lane timeline panel.
//
// The orchestration layer that sits ON TOP of the existing motion editors
// (Animation, Ken Burns, Video trim, 3D turntable). Those panels still own WHAT
// the motion is; Motion Studio owns WHEN / ordering / playback / export. It
// reads the four motion sources, lays each out as a draggable clip on its own
// lane against one shared clock, and lets you scrub and export the COMBINATION —
// including pairings that were mutually exclusive before (Ken Burns + staggered
// entrances + turntable, all on one playhead).
//
// Lanes are derived from state via syncLanesFromState(); clip start/duration are
// the only things the user edits here, and they ride state.timeline (undoable +
// serialized). Visual params stay in each source's own state — one source of
// truth per parameter.

import { state } from '../state/state.js';
import { saveStateToHistory, onHistoryChange } from '../state/history.js';
import {
  bindPlayback, pause, togglePlay, seek, stop,
  deriveDuration, timelineActive, setTransportCallback
} from './playback.js';
import { exportTimeline } from './timeline-export.js';

const MIN_CLIP = 100;   // ms — smallest a clip can be dragged to

// True while a clip/ruler drag is in flight. Suppresses the onHistoryChange →
// renderLanes() DOM rebuild (a clip drag calls saveStateToHistory(), whose emit
// would otherwise tear out the very element being dragged).
let interacting = false;

const $ = (id) => document.getElementById(id);

function targetLabel(target) {
  if (!target || target === 'image') return 'Main image';
  if (target === 'L:text') return 'Text';
  const m = /^L:(ann|extra):/.exec(target);
  if (m) return m[1] === 'ann' ? 'Annotation' : 'Image layer';
  return target;
}

const KIND_META = {
  entrance:  { icon: '✦', accent: 'var(--accent-primary)' },
  kenburns:  { icon: '🎥', accent: '#10b981' },
  video:     { icon: '🎬', accent: '#f59e0b' },
  turntable: { icon: '↻', accent: '#8b5cf6' },
  compare:   { icon: '◧', accent: '#ec4899' }   // v35
};

// ── lane reconciliation ────────────────────────────────────────────────────
// Rebuild state.timeline.lanes from the live motion sources, PRESERVING the
// start (and, where the user owns it, duration) of any lane that already exists
// so dragging survives an unrelated edit. Keyed by stable lane ids.
export function syncLanesFromState() {
  const tl = state.timeline;
  const prev = new Map((tl.lanes || []).map(l => [l.id, l]));
  const baseDur = state.animation.duration || 3000;
  const lanes = [];

  const keep = (id, fallbackStart) => {
    const p = prev.get(id);
    return p && p.clips && p.clips[0] ? p.clips[0] : { start: fallbackStart || 0, duration: baseDur };
  };

  // Entrance lanes — one per animated element. start mirrors the (now-respected)
  // per-track startTime; both stay in sync.
  if (state.animation.enabled && Array.isArray(state.animation.tracks)) {
    for (const tr of state.animation.tracks) {
      const target = tr.target || 'image';
      const id = 'ent:' + target;
      const old = keep(id, tr.startTime || 0);
      const clip = { start: old.start, duration: old.duration || baseDur, easing: tr.easing, ref: { preset: tr.preset } };
      tr.startTime = clip.start;
      lanes.push({ id, kind: 'entrance', target, label: `${targetLabel(target)} · ${tr.preset}`, clips: [clip] });
    }
  }

  // Ken Burns lane (still images only — auto-zoom owns the crop on video).
  if (state.kenBurns && state.kenBurns.enabled && !state.video.loaded) {
    const old = keep('kenburns', 0);
    lanes.push({ id: 'kenburns', kind: 'kenburns', target: null, label: 'Ken Burns pan / zoom',
      clips: [{ start: old.start, duration: old.duration || baseDur, easing: state.kenBurns.easing, ref: {} }] });
  }

  // Video lane — duration always follows the trim; only start is user-owned.
  if (state.video && state.video.loaded) {
    const old = keep('video', 0);
    const dur = Math.max(MIN_CLIP, (state.video.out - state.video.in) * 1000);
    lanes.push({ id: 'video', kind: 'video', target: null, label: 'Video clip',
      clips: [{ start: old.start, duration: dur, ref: { in: state.video.in, out: state.video.out } }] });
  }

  // Turntable lane — live preview of the 3D spin (was export-only before v29).
  if (state.mockup3d && state.mockup3d.enabled && state.mockup3d.spin && state.mockup3d.spin.enabled) {
    const old = keep('turntable', 0);
    lanes.push({ id: 'turntable', kind: 'turntable', target: null, label: 'Turntable spin',
      clips: [{ start: old.start, duration: old.duration || 3000, ref: { turns: state.mockup3d.spin.turns || 1 } }] });
  }

  // v35 — Before / After wipe: the divider sweeps from Before to After.
  const cmp = state.compare;
  if (cmp && cmp.enabled && cmp.wipe && cmp.beforeSrc && !state.video.loaded) {
    const old = keep('compare', 0);
    lanes.push({ id: 'compare', kind: 'compare', target: null, label: 'Before / After wipe',
      clips: [{ start: old.start, duration: old.duration || baseDur, ref: {} }] });
  }

  tl.lanes = lanes;
  tl.enabled = lanes.length > 0;
  deriveDuration();
}

// ── rendering ───────────────────────────────────────────────────────────────
function fmt(ms) {
  const s = ms / 1000;
  const f = Math.round((ms / 1000) * (state.timeline.fps || 30));
  return `${s.toFixed(2)}s · f${f}`;
}

export function renderLanes() {
  if (interacting) return;   // don't tear out a clip mid-drag
  syncLanesFromState();
  const wrap = $('ms-lanes');
  const empty = $('ms-empty');
  const body = $('ms-body');
  if (!wrap) return;

  const active = timelineActive();
  if (empty) empty.style.display = active ? 'none' : 'block';
  if (body) body.style.display = active ? 'block' : 'none';
  if (!active) { wrap.innerHTML = ''; return; }

  const dur = deriveDuration();
  wrap.innerHTML = '';
  for (const lane of state.timeline.lanes) {
    const clip = lane.clips[0];
    const meta = KIND_META[lane.kind] || KIND_META.entrance;
    const row = document.createElement('div');
    row.className = 'mlane';

    const name = document.createElement('div');
    name.className = 'mlane-name';
    name.innerHTML = `<span class="mlane-icon">${meta.icon}</span><span>${lane.label}</span>`;

    const track = document.createElement('div');
    track.className = 'mlane-track';

    const block = document.createElement('div');
    block.className = 'mclip';
    block.style.left = (clip.start / dur) * 100 + '%';
    block.style.width = Math.max(2, (clip.duration / dur) * 100) + '%';
    block.style.background = meta.accent;
    block.dataset.laneId = lane.id;
    block.title = `${lane.label} — drag to move${lane.kind === 'video' ? '' : ', drag edges to resize'}`;

    if (lane.kind !== 'video') {
      const lh = document.createElement('div'); lh.className = 'mclip-handle mclip-handle-l'; lh.dataset.edge = 'l';
      const rh = document.createElement('div'); rh.className = 'mclip-handle mclip-handle-r'; rh.dataset.edge = 'r';
      block.appendChild(lh); block.appendChild(rh);
    }
    bindClipDrag(block, track, lane, clip);

    track.appendChild(block);
    row.appendChild(name);
    row.appendChild(track);
    wrap.appendChild(row);
  }
  updateTransportUI(state.timeline.currentTime);
}

// ── clip drag ────────────────────────────────────────────────────────────────
function bindClipDrag(block, track, lane, clip) {
  let mode = null, startX = 0, startStart = 0, startDur = 0, saved = false;

  const msPerPx = () => {
    const w = track.getBoundingClientRect().width || 1;
    return deriveDuration() / w;
  };

  const down = (e) => {
    mode = e.target.dataset.edge ? ('edge-' + e.target.dataset.edge) : 'move';
    startX = e.clientX; startStart = clip.start; startDur = clip.duration; saved = false;
    interacting = true;
    block.setPointerCapture(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  };
  const move = (e) => {
    if (!mode) return;
    if (!saved) { saveStateToHistory(); saved = true; }
    const dMs = (e.clientX - startX) * msPerPx();
    if (mode === 'move') {
      clip.start = Math.max(0, startStart + dMs);
    } else if (mode === 'edge-r') {
      clip.duration = Math.max(MIN_CLIP, startDur + dMs);
    } else if (mode === 'edge-l') {
      const ns = Math.min(startStart + startDur - MIN_CLIP, Math.max(0, startStart + dMs));
      clip.duration = startDur + (startStart - ns);
      clip.start = ns;
    }
    if (lane.kind === 'entrance') {
      const tr = (state.animation.tracks || []).find(t => (t.target || 'image') === lane.target);
      if (tr) tr.startTime = clip.start;
    }
    const dur = deriveDuration();
    block.style.left = (clip.start / dur) * 100 + '%';
    block.style.width = Math.max(2, (clip.duration / dur) * 100) + '%';
    seek(state.timeline.currentTime);   // re-sample so the preview tracks the edit
  };
  const up = (e) => { if (mode) { try { block.releasePointerCapture(e.pointerId); } catch (_) {} mode = null; interacting = false; renderLanes(); } };

  block.addEventListener('pointerdown', down);
  block.addEventListener('pointermove', move);
  block.addEventListener('pointerup', up);
  block.addEventListener('pointercancel', up);
}

// ── ruler scrub + transport ──────────────────────────────────────────────────
export function updateTransportUI(ms) {
  const dur = deriveDuration();
  const ph = $('ms-playhead');
  if (ph) ph.style.left = (ms / dur) * 100 + '%';
  const read = $('ms-time-readout');
  if (read) read.textContent = `${fmt(ms)} / ${fmt(dur)}`;
  const btn = $('ms-play-btn');
  if (btn) btn.textContent = state.timeline.playing ? '⏸' : '▶';
}

function bindRulerScrub() {
  const track = $('ms-track');
  if (!track) return;
  let scrubbing = false;
  const timeFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    return (x / r.width) * deriveDuration();
  };
  track.addEventListener('pointerdown', (e) => {
    if (!timelineActive()) return;
    pause(); scrubbing = true; interacting = true; track.setPointerCapture(e.pointerId);
    seek(timeFromEvent(e)); e.preventDefault();
  });
  track.addEventListener('pointermove', (e) => { if (scrubbing) seek(timeFromEvent(e)); });
  const end = (e) => { if (scrubbing) { try { track.releasePointerCapture(e.pointerId); } catch (_) {} scrubbing = false; interacting = false; } };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
}

export function bindMotionStudio() {
  bindPlayback();
  setTransportCallback(updateTransportUI);

  const playBtn = $('ms-play-btn');
  if (playBtn) playBtn.addEventListener('click', () => { if (!timelineActive()) return; togglePlay(); });
  const stopBtn = $('ms-stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', stop);

  const loop = $('ms-loop');
  if (loop) { loop.checked = !!state.timeline.loop; loop.addEventListener('change', () => { state.timeline.loop = loop.checked; }); }
  const fps = $('ms-fps');
  if (fps) { fps.value = String(state.timeline.fps || 30); fps.addEventListener('change', () => { state.timeline.fps = parseInt(fps.value, 10) || 30; updateTransportUI(state.timeline.currentTime); }); }

  const mp4 = $('ms-export-mp4');
  if (mp4) mp4.addEventListener('click', () => exportTimeline('mp4'));
  const gif = $('ms-export-gif');
  if (gif) gif.addEventListener('click', () => exportTimeline('gif'));

  bindRulerScrub();

  // Refresh when the design changes (undo/redo/load, and after any saved edit),
  // and expose a global so the motion editors can poke the panel the instant a
  // source is added/removed.
  onHistoryChange(renderLanes);
  window.__motionStudioRefresh = renderLanes;

  renderLanes();
}
