// v37 — dot-path helpers shared by Merge Studio and the Roll. DOM-free.

export function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setByPath(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o == null ? o : o[k]), obj);
  if (target) target[last] = val;
}

// Safe file-name stem: letters, digits, _ and -, at most 60 characters.
export function sanitize(name, fallback = 'row') {
  return String(name).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
}
