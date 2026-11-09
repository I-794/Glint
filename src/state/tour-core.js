// v42 — Junction: branching tours. DOM-free tour data helpers, shared by the
// editor, the tour export and the tests.
//
// A hotspot's `target` is the id of the page it jumps to, or null for "the next
// step". It is stored as a page id (not a step number) so it survives page
// reorder. The player addresses steps by index, and blank pages are not steps,
// so resolveTourTargets() turns each target into a `goto` step index when the
// steps are collected. A target whose page is gone, blank, or the hotspot's own
// page resolves to nothing, and the hotspot goes to the next step as before.

const SIDES = ['top', 'bottom', 'left', 'right'];
const MAX_AUTO_MS = 60000;

export function tourDefaults() {
  return { hotspots: [], autoAdvanceMs: 0 };
}

function frac(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

export function normalizeHotspot(h, index = 0) {
  const src = h && typeof h === 'object' ? h : {};
  const x = frac(src.x), y = frac(src.y);
  const c = src.callout && typeof src.callout === 'object' ? src.callout : {};
  return {
    id: typeof src.id === 'string' && src.id ? src.id : `hs-${index}-${Math.random().toString(36).slice(2, 8)}`,
    x, y,
    w: Math.min(frac(src.w), 1 - x),
    h: Math.min(frac(src.h), 1 - y),
    label: str(src.label),
    callout: { title: str(c.title), body: str(c.body), side: SIDES.includes(c.side) ? c.side : 'bottom' },
    target: typeof src.target === 'string' && src.target ? src.target : null,
  };
}

// Repairs a tour block. v25 to v41 hotspots carried an unused `action: 'next'`,
// which is dropped here; they all become "next step" hotspots (target null).
export function normalizeTour(tour) {
  const src = tour && typeof tour === 'object' ? tour : {};
  const ms = Math.round(Number(src.autoAdvanceMs));
  return {
    hotspots: Array.isArray(src.hotspots) ? src.hotspots.map(normalizeHotspot) : [],
    autoAdvanceMs: Number.isFinite(ms) ? Math.max(0, Math.min(MAX_AUTO_MS, ms)) : 0,
  };
}

// steps: [{ pageId, hotspots, ...rest }] in player order. Returns new steps
// without `pageId`, whose hotspots carry `goto` (a step index) when the target
// resolves to another step.
export function resolveTourTargets(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const indexOf = new Map();
  list.forEach((s, i) => { if (s && s.pageId != null && !indexOf.has(s.pageId)) indexOf.set(s.pageId, i); });
  return list.map((s, i) => {
    const { pageId, hotspots, ...rest } = s;
    return {
      ...rest,
      hotspots: (Array.isArray(hotspots) ? hotspots : []).map((h) => {
        const out = { x: h.x, y: h.y, w: h.w, h: h.h, label: h.label || '', callout: h.callout || null };
        const to = h.target != null ? indexOf.get(h.target) : undefined;
        if (to !== undefined && to !== i) out.goto = to;
        return out;
      }),
    };
  });
}

// pages: [{ id, payload }] (pages.js getPageMeta()). Returns the jumps between
// pages, one per pair, for the board's tour map.
export function tourLinks(pages) {
  const list = Array.isArray(pages) ? pages : [];
  const ids = new Set(list.map((p) => p && p.id));
  const seen = new Set();
  const links = [];
  for (const p of list) {
    const tour = p && p.payload && p.payload.design && p.payload.design.tour;
    const hotspots = tour && Array.isArray(tour.hotspots) ? tour.hotspots : [];
    for (const h of hotspots) {
      const to = h && h.target;
      if (typeof to !== 'string' || !ids.has(to) || to === p.id) continue;
      const key = p.id + '>' + to;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ from: p.id, to });
    }
  }
  return links;
}
