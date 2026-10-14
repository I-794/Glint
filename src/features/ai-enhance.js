import { state } from '../state/state.js';
import { el } from '../ui/elements.js';
import { showNotification } from '../ui/notification.js';
import { render } from '../render/render.js';
import { saveStateToHistory } from '../state/history.js';

const STYLE_PRESETS = {
  watercolor: { brightness: 110, contrast: 90, saturation: 130, blur: 1, grayscale: 0, sepia: 15 },
  sketch:     { brightness: 120, contrast: 150, saturation: 0,   blur: 0, grayscale: 100, sepia: 0 },
  oil:        { brightness: 105, contrast: 120, saturation: 140, blur: 0.5, grayscale: 0, sepia: 0 },
  vintage:    { brightness: 95,  contrast: 110, saturation: 70,  blur: 0, grayscale: 0, sepia: 40 },
  cyber:      { brightness: 110, contrast: 140, saturation: 160, blur: 0, grayscale: 0, sepia: 0 },
  noir:       { brightness: 90,  contrast: 130, saturation: 0,   blur: 0, grayscale: 100, sepia: 0 }
};

function applyStylePreset(presetName) {
  const preset = STYLE_PRESETS[presetName];
  if (!preset) return;
  saveStateToHistory();
  state.aiEnhance.stylePreset = presetName;
  Object.assign(state.imageFilters, preset);
  updateFilterUI();
  render();
  showNotification(`Style "${presetName}" applied.`, 'success');
}

function clearStylePreset() {
  saveStateToHistory();
  state.aiEnhance.stylePreset = null;
  state.imageFilters = { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0 };
  updateFilterUI();
  render();
  showNotification('Filters reset.', 'success');
}

function updateFilterUI() {
  const filters = state.imageFilters;
  const map = {
    brightness: ['%'], contrast: ['%'], saturation: ['%'],
    blur: ['px'], grayscale: ['%'], sepia: ['%']
  };
  for (const [key, [unit]] of Object.entries(map)) {
    const slider = document.getElementById(key);
    const display = document.getElementById(`${key}-value`);
    if (slider) slider.value = filters[key];
    if (display) display.textContent = `${filters[key]}${unit}`;
  }
}

function dataUrlToBase64(url) {
  const i = url.indexOf(',');
  return i >= 0 ? url.slice(i + 1) : url;
}

async function tryHostedEnhance(dataUrl) {
  try {
    const r = await fetch('/api/ai-enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrlToBase64(dataUrl),
        mimeType: 'image/jpeg'
      })
    });
    if (r.status === 404 || r.status === 501) return null;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Backend error ${r.status}`);
    return data.filters || null;
  } catch (e) {
    if (e.message && /Backend error/.test(e.message)) throw e;
    return null;
  }
}

function applyEnhanceFilters(vals, message) {
  saveStateToHistory();
  state.imageFilters.brightness = Math.round(vals.brightness);
  state.imageFilters.contrast = Math.round(vals.contrast);
  state.imageFilters.saturation = Math.round(vals.saturation);
  updateFilterUI();
  render();
  showNotification(message, 'success');
}

async function autoEnhance() {
  if (!state.image) { showNotification('Upload an image first.', 'error'); return; }

  const dataUrl = el.previewCanvas.toDataURL('image/jpeg', 0.6);
  try {
    const hosted = await tryHostedEnhance(dataUrl);
    if (hosted) {
      applyEnhanceFilters(hosted, 'Enhanced with hosted AI.');
      return;
    }
  } catch (e) {
    console.warn('Hosted enhance failed; falling back to browser/local enhance.', e);
  }

  const anthropicKey = localStorage.getItem('glint_anthropic_key');
  const openaiKey = localStorage.getItem('glint_openai_key');

  if (anthropicKey) {
    await autoEnhanceWithClaude(anthropicKey);
  } else if (openaiKey) {
    await autoEnhanceWithOpenAI(openaiKey);
  } else {
    autoEnhanceLocal();
  }
}

function autoEnhanceLocal() {
  saveStateToHistory();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.min(state.image.width, 200);
  canvas.height = Math.min(state.image.height, 200);
  ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let totalR = 0, totalG = 0, totalB = 0;
  let minBright = 255, maxBright = 0;
  const pixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    totalR += r; totalG += g; totalB += b;
    const brightness = (r + g + b) / 3;
    if (brightness < minBright) minBright = brightness;
    if (brightness > maxBright) maxBright = brightness;
  }

  const avgR = totalR / pixels;
  const avgG = totalG / pixels;
  const avgB = totalB / pixels;
  const avgBrightness = (avgR + avgG + avgB) / 3;
  const contrastRange = maxBright - minBright;

  let brightness = 100, contrast = 100, saturation = 100;

  if (avgBrightness < 100) brightness = Math.round(100 + (100 - avgBrightness) * 0.15);
  if (avgBrightness > 180) brightness = Math.round(100 - (avgBrightness - 180) * 0.1);
  if (contrastRange < 150) contrast = Math.round(100 + (150 - contrastRange) * 0.12);
  const colorVariance = Math.abs(avgR - avgG) + Math.abs(avgG - avgB) + Math.abs(avgR - avgB);
  if (colorVariance < 30) saturation = 115;

  brightness = Math.max(85, Math.min(130, brightness));
  contrast = Math.max(90, Math.min(140, contrast));
  saturation = Math.max(80, Math.min(140, saturation));

  state.imageFilters.brightness = brightness;
  state.imageFilters.contrast = contrast;
  state.imageFilters.saturation = saturation;
  updateFilterUI();
  render();
  showNotification('Auto-enhanced (local analysis).', 'success');
}

async function autoEnhanceWithClaude(apiKey) {
  showNotification('Analyzing with Claude...', 'success');
  try {
    const dataUrl = el.previewCanvas.toDataURL('image/jpeg', 0.6);
    const base64 = dataUrl.split(',')[1];

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Analyze this image and suggest optimal CSS filter values to enhance it. Return ONLY a JSON object with keys: brightness (80-140), contrast (80-150), saturation (60-160). No explanation.' }
        ]
      }]
    });

    const text = response.content[0].text;
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const vals = JSON.parse(match[0]);
      saveStateToHistory();
      if (vals.brightness) state.imageFilters.brightness = Math.round(vals.brightness);
      if (vals.contrast) state.imageFilters.contrast = Math.round(vals.contrast);
      if (vals.saturation) state.imageFilters.saturation = Math.round(vals.saturation);
      updateFilterUI();
      render();
      showNotification('Enhanced with Claude AI.', 'success');
    }
  } catch (err) {
    showNotification('AI enhance failed: ' + err.message, 'error');
    autoEnhanceLocal();
  }
}

async function autoEnhanceWithOpenAI(apiKey) {
  showNotification('Analyzing with GPT-4 Vision...', 'success');
  try {
    const dataUrl = el.previewCanvas.toDataURL('image/jpeg', 0.6);
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    const response = await client.chat.completions.create({
      model: 'gpt-5.5', // v30 model policy: gpt-5.5 for all non-image OpenAI calls
      max_completion_tokens: 200, // gpt-5.x requires max_completion_tokens, not max_tokens
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: 'Analyze this image and suggest optimal CSS filter values to enhance it. Return ONLY a JSON object with keys: brightness (80-140), contrast (80-150), saturation (60-160). No explanation.' }
        ]
      }]
    });

    const text = response.choices[0].message.content;
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const vals = JSON.parse(match[0]);
      saveStateToHistory();
      if (vals.brightness) state.imageFilters.brightness = Math.round(vals.brightness);
      if (vals.contrast) state.imageFilters.contrast = Math.round(vals.contrast);
      if (vals.saturation) state.imageFilters.saturation = Math.round(vals.saturation);
      updateFilterUI();
      render();
      showNotification('Enhanced with GPT-4 Vision.', 'success');
    }
  } catch (err) {
    showNotification('AI enhance failed: ' + err.message, 'error');
    autoEnhanceLocal();
  }
}

export function bindAiEnhance() {
  const enhanceBtn = document.getElementById('ai-enhance-btn');
  const resetStyleBtn = document.getElementById('style-reset-btn');

  if (enhanceBtn) {
    enhanceBtn.addEventListener('click', autoEnhance);
  }

  if (resetStyleBtn) {
    resetStyleBtn.addEventListener('click', clearStylePreset);
  }

  document.querySelectorAll('[data-style-preset]').forEach(btn => {
    btn.addEventListener('click', () => applyStylePreset(btn.dataset.stylePreset));
  });
}
