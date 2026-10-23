// v39.5 Amplified — the Gallery looks, shared by the site and the editor.
//
// Each look is a patch deep-merged onto the editor state: background, frame,
// shadow and finish, never the canvas size or the image. scripts/build-site-shots.mjs
// renders the Gallery images from these same patches, and features/look-link.js
// applies one when the editor opens at /editor/?look=<name>, so a Gallery card's
// "Open in studio" gives you the look you clicked. DOM-free (the shots script
// imports it in Node).

const shadow = (blur, opacity, y, spread = 0) => ({ blur, spread, opacity, x: 0, y, color: '#000000' });

export const LOOKS = {
  'warm-gradient': {
    label: 'Warm gradient',
    state: {
      padding: 64, borderRadius: 18,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 150, colors: ['#ffb45c', '#ff5e7e', '#c5318f'], positions: [0, 55, 100] },
      shadow: shadow(60, 34, 24)
    }
  },
  'cobalt-mesh': {
    label: 'Cobalt mesh',
    state: {
      padding: 80, borderRadius: 12,
      bgMode: 'mesh',
      meshGradient: { points: [
        // The first point's color is also the base fill; the rest blend additively.
        { x: 0.2, y: 0.85, color: '#0c1a5e', radius: 0.7 },
        { x: 0.78, y: 0.12, color: '#1f45e0', radius: 0.7 },
        { x: 0.08, y: 0.08, color: '#139e93', radius: 0.4 },
        { x: 0.95, y: 0.95, color: '#4a22b8', radius: 0.5 }
      ] },
      deviceFrame: { type: 'chrome', color: 'dark', url: 'lumen.app/overview', title: 'Lumen' },
      tilt3d: { rx: 10, ry: -24, rz: 3, perspective: 1400 },
      shadow: shadow(70, 45, 30)
    }
  },
  'glass-spotlight': {
    label: 'Glass and spotlight',
    state: {
      padding: 56, borderRadius: 14,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 160, colors: ['#3a2d6b', '#15161a'], positions: [0, 100] },
      glass: { enabled: true, x: 0.63, y: 0.55, w: 0.27, h: 0.32, radius: 22, blur: 14, tint: '#ffffff', tintOpacity: 14, rim: true, rimOpacity: 50 },
      shadow: shadow(50, 40, 20)
    }
  },
  'device-mockup': {
    label: 'Device mockup',
    state: {
      padding: 40,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 135, colors: ['#5b82ff', '#2348ff', '#6a3cff'], positions: [0, 55, 100] },
      deviceFrame: { type: 'iphone16pro', color: 'titanium', glare: true },
      reflection: { enabled: true, opacity: 0.3, length: 0.35, gap: 6 },
      shadow: shadow(50, 40, 24)
    }
  },
  'sunset-pop': {
    label: 'Sunset pop',
    state: {
      padding: 70, borderRadius: 16,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 120, colors: ['#ffd36e', '#ff7a59', '#e0379b'], positions: [0, 50, 100] },
      imageFilters: { brightness: 104, contrast: 112, saturation: 145, blur: 0, grayscale: 0, sepia: 0, temperature: 18, tint: 0 },
      grain: { enabled: true, amount: 22, scale: 1, blend: 'overlay', monochrome: true },
      shadow: shadow(60, 40, 26)
    }
  },
  'aurora-mesh': {
    label: 'Aurora mesh',
    state: {
      padding: 72, borderRadius: 14,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.5, y: 0.95, color: '#061620', radius: 0.7 },
        { x: 0.12, y: 0.1, color: '#14a37a', radius: 0.55 },
        { x: 0.6, y: 0.05, color: '#1f5fc4', radius: 0.5 },
        { x: 0.95, y: 0.4, color: '#6a2fd0', radius: 0.5 }
      ] },
      deviceFrame: { type: 'macos', color: 'dark', title: 'Tasklane' },
      shadow: shadow(60, 55, 26)
    }
  },
  'frosted-panel': {
    label: 'Frosted panel',
    state: {
      padding: 60, borderRadius: 16,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.85, y: 0.9, color: '#25163f', radius: 0.6 },
        { x: 0.1, y: 0.1, color: '#6a4fe0', radius: 0.6 },
        { x: 0.9, y: 0.15, color: '#2f7fd0', radius: 0.55 },
        { x: 0.2, y: 0.9, color: '#c2408f', radius: 0.5 }
      ] },
      glass: { enabled: true, x: 0.12, y: 0.62, w: 0.76, h: 0.26, radius: 26, blur: 18, tint: '#ffffff', tintOpacity: 16, rim: true, rimOpacity: 55 },
      shadow: shadow(60, 45, 24)
    }
  },
  'laptop-scene': {
    label: 'Laptop scene',
    state: {
      padding: 40,
      bgMode: 'gradient', gradient: { type: 'linear', angle: 180, colors: ['#eef1f8', '#cfd6e6'], positions: [0, 100] },
      deviceFrame: { type: 'macbookpro', color: 'silver', glare: true },
      shadow: shadow(40, 22, 18)
    }
  },
  // v36 Glint: graphite with one amber flare, the brand's own look.
  'amber-flare': {
    label: 'Amber flare',
    state: {
      padding: 80, borderRadius: 12,
      bgMode: 'mesh',
      meshGradient: { points: [
        { x: 0.5, y: 0.9, color: '#121214', radius: 0.8 },
        { x: 0.1, y: 0.06, color: '#f2a93b', radius: 0.5 },
        { x: 0.98, y: 0.98, color: '#e8613a', radius: 0.42 },
        { x: 0.85, y: 0.1, color: '#2a2a30', radius: 0.5 }
      ] },
      deviceFrame: { type: 'chrome', color: 'dark', url: 'lumen.app/overview', title: 'Lumen' },
      shadow: shadow(70, 50, 30)
    }
  }
};

// Deep-merge a look patch onto a state object: plain objects merge key by key,
// arrays and values replace. Returns the target.
export function mergeLook(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) mergeLook(target[k], v);
    else target[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? { ...x } : x)) : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  }
  return target;
}
