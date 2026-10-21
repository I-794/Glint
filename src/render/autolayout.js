import { state, imageRegistry } from '../state/state.js';
import { drawShadow, drawBorder } from './shadow.js';
import { getGradedImage, cssFilterFor } from './color-grade.js';

function drawImageCell(ctx, img, x, y, w, h, isMain, canvas) {
  if (!img || w <= 0 || h <= 0) return;
  if (state.shadow.opacity > 0) drawShadow(ctx, canvas, x, y, w, h);
  ctx.save();
  const radius = state.borderRadius;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
  if (isMain) {
    ctx.translate(x + w / 2, y + h / 2);
    if (state.imageTransform.rotation !== 0) ctx.rotate((state.imageTransform.rotation * Math.PI) / 180);
    ctx.scale(state.imageTransform.flipH ? -1 : 1, state.imageTransform.flipV ? -1 : 1);
    ctx.filter = cssFilterFor();
    let dw = w, dh = h;
    if (state.imageTransform.rotation === 90 || state.imageTransform.rotation === 270) { dw = h; dh = w; }
    // v38 — the main image gets the per-pixel grade, curves, Bokeh and Compare too.
    ctx.drawImage(getGradedImage(img), -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
  if (state.showBorder) drawBorder(ctx, x, y, w, h);
}

export function renderAutoLayout(ctx, canvas) {
  const gap = state.autoLayout.gap;
  const align = state.autoLayout.align;
  const pattern = state.autoLayout.pattern;
  const padding = state.padding;

  const allImages = [];
  if (state.image) allImages.push({ img: state.image, isMain: true });
  state.extraImages.forEach(ei => {
    const img = imageRegistry[ei.id];
    if (img) allImages.push({ img, isMain: false });
  });
  if (allImages.length === 0) return;

  const availW = canvas.width - padding * 2;
  const availH = canvas.height - padding * 2;
  const positions = [];

  if (pattern === 'col-1') {
    const n = allImages.length;
    const cellH = (availH - gap * (n - 1)) / n;
    let yPos = padding;
    allImages.forEach(({ img, isMain }) => {
      const ratio = img.width / img.height;
      let w = Math.min(cellH * ratio, availW);
      let h = w / ratio;
      if (h > cellH) { h = cellH; w = h * ratio; }
      let x;
      if (align === 'start') x = padding;
      else if (align === 'end') x = canvas.width - padding - w;
      else x = (canvas.width - w) / 2;
      positions.push({ img, x, y: yPos + (cellH - h) / 2, w, h, isMain });
      yPos += cellH + gap;
    });
  } else if (pattern === 'row-1') {
    const n = allImages.length;
    const cellW = (availW - gap * (n - 1)) / n;
    let xPos = padding;
    allImages.forEach(({ img, isMain }) => {
      const ratio = img.width / img.height;
      let h = Math.min(cellW / ratio, availH);
      let w = h * ratio;
      if (w > cellW) { w = cellW; h = w / ratio; }
      let y;
      if (align === 'start') y = padding;
      else if (align === 'end') y = canvas.height - padding - h;
      else y = (canvas.height - h) / 2;
      positions.push({ img, x: xPos + (cellW - w) / 2, y, w, h, isMain });
      xPos += cellW + gap;
    });
  } else if (pattern === 'grid-2x2') {
    const cols = 2;
    const rows = Math.ceil(allImages.length / cols);
    const cellW = (availW - gap * (cols - 1)) / cols;
    const cellH = (availH - gap * (rows - 1)) / rows;
    allImages.forEach(({ img, isMain }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = padding + col * (cellW + gap);
      const cellY = padding + row * (cellH + gap);
      const ratio = img.width / img.height;
      let w, h;
      if (ratio > cellW / cellH) { w = cellW; h = w / ratio; }
      else { h = cellH; w = h * ratio; }
      let x, y;
      if (align === 'start') { x = cellX; y = cellY; }
      else if (align === 'end') { x = cellX + cellW - w; y = cellY + cellH - h; }
      else { x = cellX + (cellW - w) / 2; y = cellY + (cellH - h) / 2; }
      positions.push({ img, x, y, w, h, isMain });
    });
  }

  positions.forEach(({ img, x, y, w, h, isMain }) => drawImageCell(ctx, img, x, y, w, h, isMain, canvas));
}
