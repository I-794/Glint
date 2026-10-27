// v41 — Share links: the 1200x630 preview image a chat app shows when a link
// is pasted. Built from the frames being shared, on Glint's graphite base.

const W = 1200, H = 630, BG = '#0d0d0f', AMBER = '#f2a93b';

function fit(sw, sh, bw, bh) {
  const s = Math.min(bw / sw, bh / sh);
  const w = Math.round(sw * s), h = Math.round(sh * s);
  return { w, h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
}

function base() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  // The same faint amber light leak the viewer page has.
  const g = ctx.createRadialGradient(W * 0.85, -H * 0.1, 0, W * 0.85, -H * 0.1, W * 0.8);
  g.addColorStop(0, 'rgba(242,169,59,0.16)');
  g.addColorStop(1, 'rgba(242,169,59,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return { c, ctx };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function framed(ctx, draw, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = '#18181b';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 6);
  ctx.clip();
  draw();
  ctx.restore();
}

function chip(ctx, text, x, y) {
  ctx.save();
  ctx.font = '600 22px "Funnel Sans", "Geist", -apple-system, "Segoe UI", sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  roundRect(ctx, x, y, w, 44, 22);
  ctx.fillStyle = AMBER;
  ctx.fill();
  ctx.fillStyle = '#141416';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 18, y + 23);
  ctx.restore();
}

// kind: 'image' | 'tour' | 'compare'
// frames: image -> [canvas]; tour -> [firstStepCanvas]; compare -> [before, after]
export function makePoster(kind, frames, { steps = 0 } = {}) {
  const { c, ctx } = base();
  const first = frames[0];
  const r = fit(first.width, first.height, W - 120, H - 100);
  if (kind === 'compare' && frames[1]) {
    const [before, after] = frames;
    framed(ctx, () => {
      ctx.drawImage(after, r.x, r.y, r.w, r.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w / 2, r.h);
      ctx.clip();
      ctx.drawImage(before, r.x, r.y, r.w, r.h);
      ctx.restore();
      ctx.fillStyle = AMBER;
      ctx.fillRect(Math.round(r.x + r.w / 2) - 2, r.y, 4, r.h);
    }, r);
  } else {
    framed(ctx, () => ctx.drawImage(first, r.x, r.y, r.w, r.h), r);
  }
  if (kind === 'tour' && steps > 1) chip(ctx, `${steps} steps`, r.x + 20, r.y + r.h - 64);
  return c;
}
