// v8 — Procedural device-mockup engine.
//
// Realistic Apple-device bezels rendered entirely on canvas (no asset packs):
// the device body + screen background are drawn *behind* the screenshot, the
// caller composites the image into the returned screen `rect` (clipped to the
// device's true corner `radius`), then calls `overlay(ctx)` to paint the parts
// that sit *on top* of the screen — Dynamic Island, MacBook notch, glare, edge.
//
// This fixes the v7 frame bug where the iPhone body painted over (hid) the
// screenshot — here the layering is explicit and correct for export too.
//
// Self-contained on purpose (local rounded-rect helper, reads only `state`) so
// it has no fragile cross-module dependencies.

import { state } from '../state/state.js';
import { showingOriginal } from './hold-original.js';
import { getGradedImage } from './color-grade.js';

export const DEVICE_TYPES = new Set([
  'iphone', 'iphone16pro', 'ipadpro', 'macbookpro', 'watch', 'studiodisplay',
  'pixel', 'winlaptop'
]);

export function isDeviceMockup(type) {
  return DEVICE_TYPES.has(type);
}

// ---- helpers ---------------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Recolorable metal palettes. `device-frame-color` drives the key; unknown keys
// fall back to a graphite dark finish.
function palette(color) {
  const P = {
    dark:     { a: '#3a3a3e', b: '#1d1d20', edge: '#0b0b0d', side: '#46464a' },
    graphite: { a: '#4a4a4e', b: '#2a2a2e', edge: '#141416', side: '#56565a' },
    light:    { a: '#f2f2f4', b: '#d6d8dc', edge: '#b9bbc0', side: '#fbfbfd' },
    silver:   { a: '#eceef0', b: '#c7cacf', edge: '#a8abb1', side: '#fdfdff' },
    titanium: { a: '#c9c3b8', b: '#9b958b', edge: '#736d64', side: '#d9d4c9' },
    gold:     { a: '#eedcb7', b: '#ccb789', edge: '#a3895c', side: '#f4e7c9' }
  };
  return P[color] || P.dark;
}

// Fit a device of aspect `ar` (w/h) centered in the canvas with breathing room.
function fitDevice(canvas, ar) {
  const pad = Math.max(24, state.padding || 0);
  const maxW = Math.max(1, canvas.width - pad * 2);
  const maxH = Math.max(1, canvas.height - pad * 2);
  let w = maxW;
  let h = w / ar;
  if (h > maxH) { h = maxH; w = h * ar; }
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
}

function drawGlare(ctx, rect, radius) {
  if (state.deviceFrame.glare === false) return;
  ctx.save();
  rr(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w * 0.85, rect.y + rect.h);
  g.addColorStop(0,    'rgba(255,255,255,0.18)');
  g.addColorStop(0.16, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.42, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function screenEdge(ctx, rect, radius) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  rr(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, radius);
  ctx.stroke();
  ctx.restore();
}

// Composite the screenshot into a device screen: clipped to the screen's
// rounded corners and "cover"-scaled so it fills without distortion.
export function drawScreenImage(ctx, rect, radius) {
  if (!state.image) return;
  const { x, y, w, h } = rect;
  ctx.save();
  rr(ctx, x, y, w, h, radius);
  ctx.clip();

  const f = state.imageFilters;
  const fl = [];
  if (f.brightness !== 100) fl.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100)   fl.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) fl.push(`saturate(${f.saturation}%)`);
  if (f.blur > 0)           fl.push(`blur(${f.blur}px)`);
  if (f.grayscale > 0)      fl.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0)          fl.push(`sepia(${f.sepia}%)`);
  if (fl.length && !showingOriginal()) ctx.filter = fl.join(' ');   // v39: off while holding backslash

  const img = getGradedImage(state.image);   // v17 — color-graded source
  const ir = img.width / img.height;
  const rrt = w / h;
  let dw, dh;
  if (ir > rrt) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// ---- devices ---------------------------------------------------------------

function iphone(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const b = fitDevice(canvas, 0.49);
  const bodyR = b.w * 0.30;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.40)';
  ctx.shadowBlur = b.w * 0.18;
  ctx.shadowOffsetY = b.w * 0.06;
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, pal.a); g.addColorStop(0.5, pal.b); g.addColorStop(1, pal.edge);
  ctx.fillStyle = g;
  rr(ctx, b.x, b.y, b.w, b.h, bodyR);
  ctx.fill();
  ctx.restore();

  // brushed-edge highlight
  ctx.save();
  ctx.lineWidth = Math.max(1, b.w * 0.006);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  const inset = b.w * 0.012;
  rr(ctx, b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2, bodyR - inset);
  ctx.stroke();
  ctx.restore();

  const bz = b.w * 0.038;
  const rect = { x: b.x + bz, y: b.y + bz, w: b.w - bz * 2, h: b.h - bz * 2 };
  const screenR = bodyR - bz;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  const overlay = (c) => {
    // Dynamic Island
    const diW = rect.w * 0.34;
    const diH = diW * 0.30;
    const diX = rect.x + rect.w / 2 - diW / 2;
    const diY = rect.y + rect.h * 0.024;
    c.save();
    c.fillStyle = '#000';
    rr(c, diX, diY, diW, diH, diH / 2);
    c.fill();
    c.fillStyle = '#11131c';
    c.beginPath();
    c.arc(diX + diW - diH * 0.6, diY + diH / 2, diH * 0.22, 0, Math.PI * 2);
    c.fill();
    c.restore();
    drawGlare(c, rect, screenR);
    screenEdge(c, rect, screenR);
  };
  return { rect, radius: screenR, overlay, bounds: b };
}

function ipad(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const b = fitDevice(canvas, 0.74);
  const bodyR = b.w * 0.055;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = b.w * 0.10;
  ctx.shadowOffsetY = b.w * 0.04;
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, pal.a); g.addColorStop(0.5, pal.b); g.addColorStop(1, pal.edge);
  ctx.fillStyle = g;
  rr(ctx, b.x, b.y, b.w, b.h, bodyR);
  ctx.fill();
  ctx.restore();

  const bz = b.w * 0.035;
  const rect = { x: b.x + bz, y: b.y + bz, w: b.w - bz * 2, h: b.h - bz * 2 };
  const screenR = bodyR - bz;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  const overlay = (c) => {
    c.save();
    c.fillStyle = '#11131c';
    c.beginPath();
    c.arc(rect.x + rect.w / 2, b.y + bz / 2, Math.max(2, bz * 0.12), 0, Math.PI * 2);
    c.fill();
    c.restore();
    drawGlare(c, rect, screenR);
    screenEdge(c, rect, screenR);
  };
  return { rect, radius: screenR, overlay, bounds: b };
}

function macbook(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const fit = fitDevice(canvas, 1.49);
  const lidH = fit.h * 0.90;
  const baseH = fit.h - lidH;
  const lidW = fit.w * 0.86;
  const lidX = fit.x + (fit.w - lidW) / 2;
  const lidY = fit.y;
  const lidR = Math.max(6, lidW * 0.018);

  // lid housing
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.40)';
  ctx.shadowBlur = fit.w * 0.05;
  ctx.shadowOffsetY = fit.w * 0.025;
  const lg = ctx.createLinearGradient(lidX, lidY, lidX, lidY + lidH);
  lg.addColorStop(0, pal.a); lg.addColorStop(1, pal.b);
  ctx.fillStyle = lg;
  rr(ctx, lidX, lidY, lidW, lidH, lidR);
  ctx.fill();
  ctx.restore();

  const bz = lidW * 0.018;
  const rect = { x: lidX + bz, y: lidY + bz, w: lidW - bz * 2, h: lidH - bz * 2 };
  const screenR = lidR * 0.6;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  // base deck (hinge + palm rest), with the lid-opening cutout at front-center
  const baseY = lidY + lidH;
  ctx.save();
  const bg = ctx.createLinearGradient(fit.x, baseY, fit.x, baseY + baseH);
  bg.addColorStop(0, pal.side); bg.addColorStop(1, pal.b);
  ctx.fillStyle = bg;
  rr(ctx, fit.x, baseY, fit.w, baseH, baseH * 0.5);
  ctx.fill();
  ctx.fillStyle = pal.edge;
  const ncW = fit.w * 0.14;
  const ncH = baseH * 0.5;
  rr(ctx, fit.x + fit.w / 2 - ncW / 2, baseY, ncW, ncH, ncH / 2);
  ctx.fill();
  ctx.restore();

  const overlay = (c) => {
    // menu-bar notch
    const noW = rect.w * 0.10;
    const noH = Math.max(8, rect.h * 0.03);
    rr(c, rect.x + rect.w / 2 - noW / 2, rect.y, noW, noH, noH * 0.4);
    c.save(); c.fillStyle = '#000'; c.fill(); c.restore();
    drawGlare(c, rect, screenR);
    screenEdge(c, rect, screenR);
  };
  return { rect, radius: screenR, overlay, bounds: fit };
}

function watch(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const fit = fitDevice(canvas, 0.84);

  // band hint behind the case
  const bandW = fit.w * 0.62;
  const bandX = fit.x + (fit.w - bandW) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(22,22,26,0.92)';
  rr(ctx, bandX, fit.y, bandW, fit.h, bandW * 0.18);
  ctx.fill();
  ctx.restore();

  const caseH = fit.h * 0.62;
  const caseW = fit.w;
  const caseX = fit.x;
  const caseY = fit.y + (fit.h - caseH) / 2;
  const caseR = caseW * 0.28;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.40)';
  ctx.shadowBlur = fit.w * 0.12;
  ctx.shadowOffsetY = fit.w * 0.04;
  const cg = ctx.createLinearGradient(caseX, caseY, caseX + caseW, caseY + caseH);
  cg.addColorStop(0, pal.a); cg.addColorStop(1, pal.edge);
  ctx.fillStyle = cg;
  rr(ctx, caseX, caseY, caseW, caseH, caseR);
  ctx.fill();
  ctx.restore();

  // crown + side button
  ctx.save();
  ctx.fillStyle = pal.b;
  rr(ctx, caseX + caseW, caseY + caseH * 0.30, caseW * 0.045, caseH * 0.18, caseW * 0.02);
  ctx.fill();
  rr(ctx, caseX + caseW, caseY + caseH * 0.54, caseW * 0.03, caseH * 0.22, caseW * 0.015);
  ctx.fill();
  ctx.restore();

  const bz = caseW * 0.07;
  const rect = { x: caseX + bz, y: caseY + bz, w: caseW - bz * 2, h: caseH - bz * 2 };
  const screenR = caseR - bz;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  const overlay = (c) => { drawGlare(c, rect, screenR); screenEdge(c, rect, screenR); };
  return { rect, radius: screenR, overlay, bounds: fit };
}

function studioDisplay(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const fit = fitDevice(canvas, 1.15);
  const screenH = fit.h * 0.80;
  const standH = fit.h - screenH;
  const bodyR = Math.max(6, fit.w * 0.02);

  // stand (neck + foot) behind the panel
  ctx.save();
  ctx.fillStyle = pal.b;
  const neckW = fit.w * 0.16;
  const neckX = fit.x + fit.w / 2 - neckW / 2;
  const neckY = fit.y + screenH;
  ctx.fillRect(neckX, neckY, neckW, standH * 0.6);
  const footW = fit.w * 0.34;
  const footX = fit.x + fit.w / 2 - footW / 2;
  const footY = neckY + standH * 0.6;
  rr(ctx, footX, footY, footW, Math.max(2, standH * 0.4), Math.max(2, standH * 0.12));
  ctx.fill();
  ctx.restore();

  // panel housing
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.40)';
  ctx.shadowBlur = fit.w * 0.05;
  ctx.shadowOffsetY = fit.w * 0.02;
  ctx.fillStyle = pal.a;
  rr(ctx, fit.x, fit.y, fit.w, screenH, bodyR);
  ctx.fill();
  ctx.restore();

  const bz = fit.w * 0.018;
  const rect = { x: fit.x + bz, y: fit.y + bz, w: fit.w - bz * 2, h: screenH - bz * 2 };
  const screenR = bodyR * 0.6;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  const overlay = (c) => { drawGlare(c, rect, screenR); screenEdge(c, rect, screenR); };
  return { rect, radius: screenR, overlay, bounds: fit };
}

function pixel(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const b = fitDevice(canvas, 0.48);
  const bodyR = b.w * 0.13; // Android corners are squarer than iPhone

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.40)';
  ctx.shadowBlur = b.w * 0.16;
  ctx.shadowOffsetY = b.w * 0.06;
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, pal.a); g.addColorStop(0.5, pal.b); g.addColorStop(1, pal.edge);
  ctx.fillStyle = g;
  rr(ctx, b.x, b.y, b.w, b.h, bodyR);
  ctx.fill();
  ctx.restore();

  const bz = b.w * 0.03;
  const rect = { x: b.x + bz, y: b.y + bz, w: b.w - bz * 2, h: b.h - bz * 2 };
  const screenR = bodyR - bz;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  const overlay = (c) => {
    // centered punch-hole camera
    c.save();
    c.fillStyle = '#11131c';
    c.beginPath();
    c.arc(rect.x + rect.w / 2, rect.y + rect.h * 0.035, Math.max(3, rect.w * 0.022), 0, Math.PI * 2);
    c.fill();
    c.restore();
    drawGlare(c, rect, screenR);
    screenEdge(c, rect, screenR);
  };
  return { rect, radius: screenR, overlay, bounds: b };
}

function winlaptop(ctx, canvas) {
  const pal = palette(state.deviceFrame.color);
  const fit = fitDevice(canvas, 1.52);
  const lidH = fit.h * 0.91;
  const baseH = fit.h - lidH;
  const lidW = fit.w * 0.88;
  const lidX = fit.x + (fit.w - lidW) / 2;
  const lidY = fit.y;
  const lidR = Math.max(5, lidW * 0.012);

  // lid housing
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.40)';
  ctx.shadowBlur = fit.w * 0.05;
  ctx.shadowOffsetY = fit.w * 0.025;
  const lg = ctx.createLinearGradient(lidX, lidY, lidX, lidY + lidH);
  lg.addColorStop(0, pal.a); lg.addColorStop(1, pal.b);
  ctx.fillStyle = lg;
  rr(ctx, lidX, lidY, lidW, lidH, lidR);
  ctx.fill();
  ctx.restore();

  const bz = lidW * 0.024; // thicker, uniform bezels (no notch)
  const rect = { x: lidX + bz, y: lidY + bz * 1.4, w: lidW - bz * 2, h: lidH - bz * 2.4 };
  const screenR = lidR * 0.5;
  ctx.save(); ctx.fillStyle = '#000'; rr(ctx, rect.x, rect.y, rect.w, rect.h, screenR); ctx.fill(); ctx.restore();

  // base deck
  const baseY = lidY + lidH;
  ctx.save();
  const bg = ctx.createLinearGradient(fit.x, baseY, fit.x, baseY + baseH);
  bg.addColorStop(0, pal.side); bg.addColorStop(1, pal.b);
  ctx.fillStyle = bg;
  rr(ctx, fit.x, baseY, fit.w, baseH, baseH * 0.4);
  ctx.fill();
  // trackpad lip hint
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(fit.x + fit.w * 0.42, baseY, fit.w * 0.16, baseH * 0.28);
  ctx.restore();

  const overlay = (c) => {
    // webcam dot centered in top bezel
    c.save();
    c.fillStyle = '#11131c';
    c.beginPath();
    c.arc(rect.x + rect.w / 2, lidY + bz * 0.7, Math.max(2, bz * 0.14), 0, Math.PI * 2);
    c.fill();
    c.restore();
    drawGlare(c, rect, screenR);
    screenEdge(c, rect, screenR);
  };
  return { rect, radius: screenR, overlay, bounds: fit };
}

// ---- dispatch --------------------------------------------------------------

export function drawDeviceMockup(ctx, canvas, type) {
  switch (type) {
    case 'iphone':
    case 'iphone16pro':   return iphone(ctx, canvas);
    case 'ipadpro':       return ipad(ctx, canvas);
    case 'macbookpro':    return macbook(ctx, canvas);
    case 'watch':         return watch(ctx, canvas);
    case 'studiodisplay': return studioDisplay(ctx, canvas);
    case 'pixel':         return pixel(ctx, canvas);
    case 'winlaptop':     return winlaptop(ctx, canvas);
    default:              return null;
  }
}
