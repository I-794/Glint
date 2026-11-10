// Glint Pro groundwork: the editor's side of accounts and hosted AI credits.
// Every call to a hosted AI route goes through hostedFetch(), which adds the
// signed-in person's token so the server can count credits. When the server
// says "sign in" or "out of credits" this explains why, and otherwise stays
// out of the way: a person with their own API key never sees any of it.
import { getClient, onAuthChange, isConfigured, openSignIn } from './auth.js';
import { getKey } from './api-keys.js';
import { showNotification } from '../ui/notification.js';
import { track } from './analytics.js';

let usage = null;       // { used, limit, plan, resets } once known
let lastBlock = null;   // { message, at } for the Design Agent's reply

async function token() {
  if (!isConfigured()) return '';
  try {
    const client = await getClient();
    const { data } = await client.auth.getSession();
    return (data && data.session && data.session.access_token) || '';
  } catch (e) {
    return '';
  }
}

const hasOwnKey = () => Boolean(getKey('openai') || getKey('anthropic'));

function resetDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function renderChip() {
  const chip = document.getElementById('ai-credits');
  if (!chip) return;
  if (!usage) { chip.style.display = 'none'; return; }
  const left = Math.max(0, usage.limit - usage.used);
  chip.style.display = '';
  chip.textContent = `${left} AI credit${left === 1 ? '' : 's'}`;
  const day = usage.resets ? resetDay(usage.resets) : '';
  chip.title = `${left} of ${usage.limit} hosted AI credits left this month${usage.plan === 'pro' ? ' (Glint Pro)' : ''}.${day ? ` They start over on ${day}.` : ''} Your own API key does not use credits.`;
}

function setUsage(next) {
  usage = next;
  renderChip();
}

let refreshing = null;
export function refreshAccount() {
  if (!refreshing) refreshing = loadAccount().finally(() => { refreshing = null; });
  return refreshing;
}

async function loadAccount() {
  const t = await token();
  if (!t) { setUsage(null); return; }
  try {
    const r = await fetch('/api/account?op=me', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    const type = r.headers.get('content-type') || '';
    const data = r.ok && type.includes('json') ? await r.json() : null;
    if (data && data.enabled && data.hosted && data.signedIn) setUsage({ used: data.used, limit: data.limit, plan: data.plan, resets: data.resets });
    else setUsage(null);
  } catch (e) {
    setUsage(null);
  }
}

function explain(data) {
  let message = data.error || 'Hosted AI is not available for this account.';
  let action = null;
  if (data.code === 'sign_in') {
    if (isConfigured()) action = { label: 'Sign in', run: openSignIn };
  } else {
    const day = data.resets ? resetDay(data.resets) : '';
    if (day) message = message.replace(' Your own API key', ` They start over on ${day}. Your own API key`);
    action = { label: 'Glint Pro', run: () => window.open('/pricing/#pro', '_blank', 'noopener') };
  }
  lastBlock = { message, at: Date.now() };
  return { message, action };
}

// The reason hosted AI just said no, if it did in the last few seconds.
export function recentMeterBlock() {
  return lastBlock && Date.now() - lastBlock.at < 8000 ? lastBlock.message : '';
}

// POST to a hosted AI route. Returns the Response. A "sign in" or "out of
// credits" answer comes back as a 501, which every caller already treats as
// "no hosted AI here" and so falls back to the person's own key.
export async function hostedFetch(path, body, { quiet = false } = {}) {
  const t = await token();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(body),
  });
  const credits = /^(\d+)\/(\d+)$/.exec(r.headers.get('X-Glint-Credits') || '');
  if (credits && r.ok) setUsage({ ...(usage || {}), used: Number(credits[1]), limit: Number(credits[2]) });
  if (r.status !== 401 && r.status !== 402) return r;
  const data = await r.clone().json().catch(() => ({}));
  if (data.code !== 'sign_in' && data.code !== 'no_credits') return r;
  track('ai_blocked', { reason: data.code });
  if (data.code === 'no_credits' && typeof data.used === 'number') setUsage({ ...(usage || {}), used: data.used, limit: data.limit, plan: data.plan, resets: data.resets });
  const { message, action } = explain(data);
  // The caller falls back to the person's own key. Without one it shows its
  // generic "add a key" message; this lands just after and says why.
  if (!quiet && !hasOwnKey()) setTimeout(() => showNotification(message, 'info', { action, duration: 9000 }), 80);
  return new Response(JSON.stringify({ error: message }), { status: 501, headers: { 'Content-Type': 'application/json' } });
}

export function bindAccount() {
  onAuthChange(() => { refreshAccount(); });
  if (isConfigured()) refreshAccount();
}
