// v22 — Command Center: lightweight recents/frequents for the command palette.
// Persisted under glint_cmd_usage as { [id]: { count, last } }.
const KEY = 'glint_cmd_usage';
const MAX = 50;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function recordUse(id) {
  if (!id) return;
  const data = read();
  const entry = data[id] || { count: 0, last: 0 };
  entry.count += 1;
  entry.last = Date.now();
  data[id] = entry;
  // Prune to the MAX most-recently-used ids so the store can't grow unbounded.
  const ids = Object.keys(data);
  if (ids.length > MAX) {
    ids.sort((a, b) => data[b].last - data[a].last).slice(MAX).forEach((k) => delete data[k]);
  }
  write(data);
}

export function getRecent(limit = 6) {
  const data = read();
  return Object.keys(data).sort((a, b) => data[b].last - data[a].last).slice(0, limit);
}

export function getFrequencyBoost(id) {
  const data = read();
  const e = data[id];
  if (!e) return 0;
  return Math.min(0.5, e.count * 0.05); // small, capped additive boost
}
