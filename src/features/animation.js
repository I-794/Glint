import { state } from '../state/state.js';
import { showNotification } from '../ui/notification.js';
import { render } from '../render/render.js';
import { saveStateToHistory } from '../state/history.js';
import { getEasing, EASING_OPTIONS } from '../render/easing.js';
import { localProgress } from '../state/motion-clock.js';

const ANIMATION_PRESETS = {
  'fade-in':   { from: { opacity: 0 }, to: { opacity: 1 } },
  'slide-up':  { from: { translateY: 40, opacity: 0 }, to: { translateY: 0, opacity: 1 } },
  'slide-left': { from: { translateX: -40, opacity: 0 }, to: { translateX: 0, opacity: 1 } },
  'bounce':    { from: { scale: 0, opacity: 0 }, to: { scale: 1, opacity: 1 }, easing: 'bounce' },
  'scale-pop': { from: { scale: 0.5, opacity: 0 }, to: { scale: 1, opacity: 1 } },
  'rotate-in': { from: { rotate: -90, scale: 0.5, opacity: 0 }, to: { rotate: 0, scale: 1, opacity: 1 } }
};

function lerp(a, b, t) { return a + (b - a) * t; }

export function interpolateFrame(track, t) {
  const preset = ANIMATION_PRESETS[track.preset];
  if (!preset) return {};
  // v15.2 — the track's own easing wins; otherwise the preset's; otherwise the
  // easeInOut default (getEasing falls back). Pre-v15.2 tracks have no
  // track.easing, so they replay exactly as before.
  const ease = getEasing(track.easing || preset.easing);
  const et = ease(Math.max(0, Math.min(1, t)));
  const result = {};
  for (const key of Object.keys(preset.to)) {
    const from = preset.from[key] ?? preset.to[key];
    result[key] = lerp(from, preset.to[key], et);
  }
  return result;
}

let animationFrameId = null;
let startTime = 0;

function playAnimation() {
  // v15.2 — Ken Burns drives the same clock, so playback runs when either an
  // entrance track exists OR Ken Burns is enabled (and no clip is loaded).
  const hasTracks = state.animation.enabled && state.animation.tracks.length > 0;
  const hasKenBurns = state.kenBurns && state.kenBurns.enabled && !state.video.loaded;
  if (!hasTracks && !hasKenBurns) {
    showNotification('Add an animation preset or enable Ken Burns first.', 'error');
    return;
  }

  saveStateToHistory();
  // v29 — hand the preview back to the legacy animation clock (the Motion Studio
  // unified clock stands down) so this Play button drives the frame.
  state.timeline._driving = false;
  state.animation.playing = true;
  startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    state.animation.currentTime = elapsed;

    if (elapsed >= state.animation.duration) {
      state.animation.playing = false;
      state.animation.currentTime = state.animation.duration;
      render();
      updatePlaybackUI();
      return;
    }

    render();
    animationFrameId = requestAnimationFrame(tick);
  }

  animationFrameId = requestAnimationFrame(tick);
  updatePlaybackUI();
}

function stopAnimation() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  state.animation.playing = false;
  state.animation.currentTime = 0;
  render();
  updatePlaybackUI();
}

// v15.2 — which element a new entrance targets: the single selected animatable
// layer, else the main image. 'image' for the screenshot; otherwise the layer id
// (L:text / L:ann:<id> / L:extra:<id>) which the per-element draws key off.
function activeAnimTarget() {
  const ids = state.selection && state.selection.layerIds || [];
  if (ids.length === 1) {
    const id = ids[0];
    if (id === 'L:image') return 'image';
    if (id === 'L:text' || /^L:(ann|extra):/.test(id)) return id;
  }
  return 'image';
}

function targetLabel(target) {
  if (!target || target === 'image') return 'Main image';
  if (target === 'L:text') return 'Text';
  const m = /^L:(ann|extra):/.exec(target);
  if (m) return m[1] === 'ann' ? 'Annotation' : 'Image';
  return target;
}

export function addAnimationTrack(preset) {
  saveStateToHistory();
  state.animation.enabled = true;
  const target = activeAnimTarget();
  if (!Array.isArray(state.animation.tracks)) state.animation.tracks = [];
  // One entrance per element: drop any existing track for this target first.
  state.animation.tracks = state.animation.tracks.filter(tr => (tr.target || 'image') !== target);
  state.animation.tracks.push({ preset, startTime: 0, target });

  const toggle = document.getElementById('animation-enabled');
  if (toggle) toggle.checked = true;
  const controls = document.getElementById('animation-controls');
  if (controls) controls.style.display = 'block';

  updateTrackDisplay();
  render();
  if (window.__motionStudioRefresh) window.__motionStudioRefresh();
  showNotification(`${targetLabel(target)}: "${preset}" added.`, 'success');
}

// v15.2 — remove the entrance track for a given target (used by the layers
// footer "None" option).
export function removeAnimationTrack(target) {
  if (!Array.isArray(state.animation.tracks)) return;
  saveStateToHistory();
  state.animation.tracks = state.animation.tracks.filter(tr => (tr.target || 'image') !== target);
  if (state.animation.tracks.length === 0) state.animation.enabled = false;
  updateTrackDisplay();
  render();
  if (window.__motionStudioRefresh) window.__motionStudioRefresh();
}

// The entrance track currently targeting `target`, or null.
export function trackForTarget(target) {
  return (state.animation.tracks || []).find(tr => (tr.target || 'image') === target) || null;
}

function updateTrackDisplay() {
  const trackList = document.getElementById('animation-track-list');
  if (!trackList) return;

  const tracks = state.animation.tracks || [];
  if (tracks.length === 0) {
    trackList.innerHTML = '<p class="info-text">No animation set. Choose a preset below.</p>';
    return;
  }

  const optionsFor = (selected) => EASING_OPTIONS.map(o =>
    `<option value="${o.id}"${o.id === selected ? ' selected' : ''}>${o.name}</option>`).join('');

  trackList.innerHTML = tracks.map((track, i) => {
    const preset = ANIMATION_PRESETS[track.preset];
    const selectedEasing = track.easing || (preset && preset.easing) || 'easeInOut';
    return `
    <div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;">
      <span style="flex:1;color:var(--text-primary);">${targetLabel(track.target)} · ${track.preset}</span>
      <select data-track-easing="${i}" class="control-input" style="width:auto;padding:2px 4px;font-size:11px;" title="Easing">${optionsFor(selectedEasing)}</select>
      <button class="btn btn-secondary" data-remove-track="${i}" style="padding:2px 8px;font-size:10px;">Remove</button>
    </div>`;
  }).join('');

  trackList.querySelectorAll('[data-remove-track]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveStateToHistory();
      state.animation.tracks.splice(parseInt(btn.dataset.removeTrack), 1);
      if (state.animation.tracks.length === 0) state.animation.enabled = false;
      updateTrackDisplay();
      render();
      if (window.__motionStudioRefresh) window.__motionStudioRefresh();
    });
  });
  trackList.querySelectorAll('[data-track-easing]').forEach(sel => {
    sel.addEventListener('change', () => {
      saveStateToHistory();
      state.animation.tracks[parseInt(sel.dataset.trackEasing)].easing = sel.value;
      render();
    });
  });
}

function updatePlaybackUI() {
  const playBtn = document.getElementById('animation-play-btn');
  if (playBtn) {
    playBtn.textContent = state.animation.playing ? '⏸ Pause' : '▶ Play';
  }
}

// v15.2 — the interpolated frame for a specific element target ('image',
// 'L:text', 'L:ann:<id>', 'L:extra:<id>'), or null when nothing animates it.
// A track with no `target` is treated as 'image' so pre-v15.2 projects replay.
export function getElementAnimState(targetId) {
  const anim = state.animation;
  if (!anim || !anim.enabled || !anim.tracks || anim.tracks.length === 0) return null;
  const track = anim.tracks.find(tr => (tr.target || 'image') === targetId);
  if (!track) return null;
  // v29 — when Motion Studio drives the preview, each entrance derives its own
  // local progress from its lane/clip (respecting per-element start → staggered
  // entrances). Otherwise fall back to the legacy shared animation clock.
  const t = localProgress('entrance', targetId, anim.currentTime / anim.duration);
  return interpolateFrame(track, t);
}

// The main image's entrance — what render.js consumes (behavior unchanged).
export function getAnimationState() {
  return getElementAnimState('image');
}

// v15.2 — apply an element's entrance transform around its center, then draw.
// Multiplies globalAlpha (stacks with withLayer's per-layer opacity) and mirrors
// the main-image transform recipe in render.js. Returns true if it pushed a
// ctx.save() the caller must restore. Single source of truth for entrances.
export function applyEntrance(ctx, targetId, cx, cy) {
  const a = getElementAnimState(targetId);
  if (!a) return false;
  ctx.save();
  if (a.opacity !== undefined) ctx.globalAlpha = ctx.globalAlpha * a.opacity;
  if (a.translateX || a.translateY || a.scale !== undefined || a.rotate) {
    ctx.translate(cx, cy);
    if (a.rotate) ctx.rotate((a.rotate * Math.PI) / 180);
    if (a.scale !== undefined) ctx.scale(a.scale, a.scale);
    ctx.translate(-cx + (a.translateX || 0), -cy + (a.translateY || 0));
  }
  return true;
}

// Expose preset names for the layers-footer entrance picker.
export function animationPresetIds() {
  return Object.keys(ANIMATION_PRESETS);
}

// v15.2 — reflect animation state into the section after a load / reset / undo.
// The toggle, duration, controls visibility, and track list weren't synced on
// restore before animation persisted (Feature 4); now that it does, a loaded
// design opens showing its tracks with the controls revealed when motion is set.
export function refreshAnimationUI() {
  const toggle = document.getElementById('animation-enabled');
  const controls = document.getElementById('animation-controls');
  const durationSlider = document.getElementById('animation-duration');
  const durationValue = document.getElementById('animation-duration-value');
  const secs = (state.animation.duration || 3000) / 1000;
  if (toggle) toggle.checked = !!state.animation.enabled;
  if (durationSlider) durationSlider.value = secs;
  if (durationValue) durationValue.textContent = `${secs}s`;
  if (controls) controls.style.display =
    (state.animation.enabled || (state.kenBurns && state.kenBurns.enabled)) ? 'block' : 'none';
  updateTrackDisplay();
  updatePlaybackUI();
}

export function bindAnimation() {
  const toggle = document.getElementById('animation-enabled');
  const controls = document.getElementById('animation-controls');
  const durationSlider = document.getElementById('animation-duration');
  const durationValue = document.getElementById('animation-duration-value');
  const playBtn = document.getElementById('animation-play-btn');

  if (toggle) {
    toggle.addEventListener('change', () => {
      state.animation.enabled = toggle.checked;
      // Keep the controls visible if Ken Burns is still on (it shares Play +
      // Duration), so disabling entrance animation doesn't hide them.
      if (controls) controls.style.display =
        (toggle.checked || (state.kenBurns && state.kenBurns.enabled)) ? 'block' : 'none';
      if (window.__motionStudioRefresh) window.__motionStudioRefresh();
    });
  }

  if (durationSlider) {
    durationSlider.addEventListener('input', () => {
      const secs = parseFloat(durationSlider.value);
      state.animation.duration = secs * 1000;
      if (durationValue) durationValue.textContent = `${secs}s`;
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.animation.playing) stopAnimation();
      else playAnimation();
    });
  }

  document.querySelectorAll('[data-anim-preset]').forEach(btn => {
    btn.addEventListener('click', () => addAnimationTrack(btn.dataset.animPreset));
  });

  updateTrackDisplay();
}
