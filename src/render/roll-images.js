// v37 — decode Roll shot images (roll-core rollSources dataURLs) into
// imageRegistry, so a loaded project or page can render its shots.

import { imageRegistry } from '../state/state.js';
import { rollSources } from './roll-core.js';

function decode(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Resolves once every shot of `roll` has an Image in imageRegistry (shots whose
// data fails to decode are skipped).
export async function ensureRollImages(roll) {
  const shots = roll && Array.isArray(roll.shots) ? roll.shots : [];
  await Promise.all(shots.map(async (s) => {
    if (imageRegistry[s.id] || !rollSources[s.id]) return;
    const img = await decode(rollSources[s.id]);
    if (img) imageRegistry[s.id] = img;
  }));
}
