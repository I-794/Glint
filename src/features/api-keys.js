import { showNotification } from '../ui/notification.js';

const KEY = 'snapshotpro_api_keys';

function loadKeys() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}

function saveKeys(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); }
  catch (e) {}
}

export function getKey(provider) {
  return loadKeys()[provider] || '';
}

export function setKey(provider, key) {
  const all = loadKeys();
  if (key) all[provider] = key.trim();
  else delete all[provider];
  saveKeys(all);
  renderApiKeyStatus();
}

function maskKey(k) {
  if (!k) return '—';
  if (k.length < 12) return '••••';
  return k.slice(0, 7) + '…' + k.slice(-4);
}

export function renderApiKeyStatus() {
  const status = document.getElementById('api-key-status');
  if (!status) return;
  const all = loadKeys();
  const providers = ['openai', 'anthropic'];
  status.innerHTML = providers.map(p => {
    const v = all[p];
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px;">
      <span><strong>${p}</strong> <span class="account-pill" style="background:var(--bg-tertiary);">${maskKey(v)}</span></span>
      ${v ? `<button class="btn btn-secondary" data-clear="${p}" style="padding:2px 8px;font-size:11px;">Clear</button>` : ''}
    </div>`;
  }).join('');
  status.querySelectorAll('button[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      setKey(btn.dataset.clear, '');
      showNotification(`Cleared ${btn.dataset.clear} key.`, 'success');
    });
  });
}

export function bindApiKeysPanel() {
  const openaiInp = document.getElementById('openai-key-input');
  const anthropicInp = document.getElementById('anthropic-key-input');
  const saveBtn = document.getElementById('api-keys-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (openaiInp && openaiInp.value.trim()) setKey('openai', openaiInp.value);
    if (anthropicInp && anthropicInp.value.trim()) setKey('anthropic', anthropicInp.value);
    if (openaiInp) openaiInp.value = '';
    if (anthropicInp) anthropicInp.value = '';
    showNotification('API keys saved locally.', 'success');
  });
  renderApiKeyStatus();
}
