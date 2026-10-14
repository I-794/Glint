// v36 — Glint rebrand: carry SnapShotPro-era browser data over to the new names.
//
// Must stay the FIRST import in src/main.js: ES modules evaluate in import
// order and several feature modules read localStorage while loading.
// Runs once (MIGRATED_FLAG). Never overwrites a glint_ key, and leaves the
// snapshotpro_ keys in place as a backup until v37 removes them. If a copy
// does not fit in the quota, the value is moved instead (old key removed
// first, restored if the write still fails).

export const OLD_PREFIX = 'snapshotpro_';
export const NEW_PREFIX = 'glint_';
export const MIGRATED_FLAG = 'glint_migrated_v1';

export function migrateLocalStorage(storage) {
  if (!storage || storage.getItem(MIGRATED_FLAG) !== null) return 0;
  const oldKeys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(OLD_PREFIX)) oldKeys.push(k);
  }
  let copied = 0;
  for (const oldKey of oldKeys) {
    const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
    if (storage.getItem(newKey) !== null) continue;
    const value = storage.getItem(oldKey);
    if (value === null) continue;
    try {
      storage.setItem(newKey, value);
      copied++;
    } catch (e) {
      try {
        storage.removeItem(oldKey);
        storage.setItem(newKey, value);
        copied++;
      } catch (e2) {
        try { storage.setItem(oldKey, value); } catch (e3) { /* nothing more to do */ }
      }
    }
  }
  try { storage.setItem(MIGRATED_FLAG, '1'); } catch (e) { /* retried next load */ }
  return copied;
}

if (typeof window !== 'undefined') {
  try { migrateLocalStorage(window.localStorage); } catch (e) { /* storage blocked */ }
}
