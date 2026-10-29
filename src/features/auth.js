import { showNotification } from '../ui/notification.js';
import { askConfirm } from '../ui/dialog.js';

const CFG_KEY = 'glint_supabase_cfg';

let supabaseClient = null;
let currentUser = null;
const listeners = [];

export function onAuthChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach(fn => fn(currentUser)); }

function loadLocalConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; }
  catch (e) { return null; }
}
function saveLocalConfig(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
  catch (e) {}
}
function clearLocalConfig() {
  try { localStorage.removeItem(CFG_KEY); }
  catch (e) {}
}

function getConfig() {
  const local = loadLocalConfig();
  if (local && local.url && local.anonKey) return local;
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey, source: 'env' };
  return null;
}

export function isConfigured() {
  return Boolean(getConfig());
}

export function getUser() { return currentUser; }

export async function getClient() {
  if (supabaseClient) return supabaseClient;
  const cfg = getConfig();
  if (!cfg) return null;
  const { createClient } = await import('@supabase/supabase-js');
  supabaseClient = createClient(
    cfg.url,
    cfg.anonKey,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );
  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;
  supabaseClient.auth.onAuthStateChange((_event, sess) => {
    currentUser = sess?.user || null;
    renderAuthPill();
    emit();
  });
  return supabaseClient;
}

function openModal() {
  const m = document.getElementById('auth-modal');
  if (m) m.classList.add('visible');
}
function closeModal() {
  const m = document.getElementById('auth-modal');
  if (m) m.classList.remove('visible');
}

function openSetupModal() {
  const m = document.getElementById('cloud-setup-modal');
  if (m) {
    m.classList.add('visible');
    const cfg = loadLocalConfig();
    const urlInp = document.getElementById('cloud-setup-url');
    const keyInp = document.getElementById('cloud-setup-key');
    if (urlInp && cfg) urlInp.value = cfg.url || '';
    if (keyInp && cfg) keyInp.value = cfg.anonKey || '';
  }
}
function closeSetupModal() {
  const m = document.getElementById('cloud-setup-modal');
  if (m) m.classList.remove('visible');
}

async function saveCloudConfig() {
  const url = document.getElementById('cloud-setup-url').value.trim();
  const anonKey = document.getElementById('cloud-setup-key').value.trim();
  if (!url || !anonKey) { showNotification('Both URL and anon key are required.', 'error'); return; }
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    showNotification('URL should look like https://xxx.supabase.co', 'error');
    return;
  }
  saveLocalConfig({ url, anonKey });
  supabaseClient = null;
  currentUser = null;
  await getClient();
  renderAuthPill();
  closeSetupModal();
  showNotification('Cloud configured. You can now sign in.', 'success');
  openModal();
}

async function disconnectCloud() {
  if (!await askConfirm('Disconnect cloud sync?', { message: 'Your local data stays, but sync will stop.', okLabel: 'Disconnect', danger: true })) return;
  clearLocalConfig();
  supabaseClient = null;
  currentUser = null;
  renderAuthPill();
  closeSetupModal();
  showNotification('Cloud disconnected.', 'success');
}

async function signUp() {
  const c = await getClient();
  if (!c) return;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showNotification('Enter email and password.', 'error'); return; }
  const { error } = await c.auth.signUp({ email, password });
  if (error) showNotification(error.message, 'error');
  else { showNotification('Check your email to confirm your account.', 'success'); closeModal(); }
}

async function signIn() {
  const c = await getClient();
  if (!c) return;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showNotification('Enter email and password.', 'error'); return; }
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) showNotification(error.message, 'error');
  else { showNotification('Signed in.', 'success'); closeModal(); }
}

async function signInWithProvider(provider) {
  const c = await getClient();
  if (!c) return;
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
  if (error) showNotification(error.message, 'error');
}

async function signOut() {
  const c = await getClient();
  if (!c) return;
  await c.auth.signOut();
  showNotification('Signed out.', 'success');
}

function renderAuthPill() {
  const pill = document.getElementById('auth-pill');
  if (!pill) return;
  if (!isConfigured()) {
    pill.innerHTML = '<button class="btn btn-secondary" id="cloud-setup-btn" title="Connect a Supabase project">☁ <span class="btn-text">Set up cloud</span></button>';
    document.getElementById('cloud-setup-btn').addEventListener('click', openSetupModal);
    return;
  }
  if (currentUser) {
    const name = currentUser.email || currentUser.user_metadata?.full_name || 'You';
    pill.innerHTML = `
      <span class="account-pill" title="${name}">👤 <span class="btn-text">${name.split('@')[0]}</span></span>
      <button class="btn btn-secondary" id="auth-signout-btn" style="padding:6px 10px;">Sign out</button>
    `;
    document.getElementById('auth-signout-btn').addEventListener('click', signOut);
  } else {
    pill.innerHTML = `
      <button class="btn btn-primary" id="auth-signin-btn">🔑 <span class="btn-text">Sign in</span></button>
      <button class="btn btn-secondary" id="cloud-reconfigure-btn" title="Re-enter Supabase keys" style="padding:6px 8px;">⚙</button>
    `;
    document.getElementById('auth-signin-btn').addEventListener('click', openModal);
    document.getElementById('cloud-reconfigure-btn').addEventListener('click', openSetupModal);
  }
}

export async function bindAuth() {
  // Auth modal buttons
  const signUpBtn = document.getElementById('auth-signup-btn');
  const signInBtn = document.getElementById('auth-signin-modal-btn');
  const googleBtn = document.getElementById('auth-google-btn');
  const githubBtn = document.getElementById('auth-github-btn');
  const closeBtn = document.getElementById('auth-modal-close');
  const overlay = document.getElementById('auth-modal');
  if (signUpBtn) signUpBtn.addEventListener('click', signUp);
  if (signInBtn) signInBtn.addEventListener('click', signIn);
  if (googleBtn) googleBtn.addEventListener('click', () => signInWithProvider('google'));
  if (githubBtn) githubBtn.addEventListener('click', () => signInWithProvider('github'));
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Cloud-setup modal buttons
  const setupSaveBtn = document.getElementById('cloud-setup-save-btn');
  const setupCloseBtn = document.getElementById('cloud-setup-close');
  const setupDisconnectBtn = document.getElementById('cloud-setup-disconnect-btn');
  const setupOverlay = document.getElementById('cloud-setup-modal');
  const setupCopySqlBtn = document.getElementById('cloud-setup-copy-sql');
  if (setupSaveBtn) setupSaveBtn.addEventListener('click', saveCloudConfig);
  if (setupCloseBtn) setupCloseBtn.addEventListener('click', closeSetupModal);
  if (setupDisconnectBtn) setupDisconnectBtn.addEventListener('click', disconnectCloud);
  if (setupOverlay) setupOverlay.addEventListener('click', (e) => { if (e.target === setupOverlay) closeSetupModal(); });
  if (setupCopySqlBtn) setupCopySqlBtn.addEventListener('click', async () => {
    const sql = `create table if not exists public.templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  payload jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, name)
);
alter table public.templates enable row level security;
create policy "users own templates" on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  payload jsonb not null,
  updated_at timestamptz default now()
);
-- v12 — projects are keyed by id (not name); carry a thumbnail + created_at.
alter table public.projects add column if not exists thumbnail text;
alter table public.projects add column if not exists created_at timestamptz default now();
alter table public.projects drop constraint if exists projects_user_id_name_key;
alter table public.projects enable row level security;
create policy "users own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- v12 — version history snapshots for each project.
create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  payload jsonb not null,
  thumbnail text,
  created_at timestamptz default now()
);
alter table public.project_versions enable row level security;
create policy "users own project versions" on public.project_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- v11.3 — public community gallery (templates + brand kits)
create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('template','brandkit')),
  name text not null,
  payload jsonb not null,
  preview_url text,
  likes int default 0,
  created_at timestamptz default now()
);
alter table public.gallery enable row level security;
create policy "gallery is publicly readable" on public.gallery
  for select using (true);
create policy "authors insert their gallery items" on public.gallery
  for insert with check (auth.uid() = author_id);
create policy "authors delete their gallery items" on public.gallery
  for delete using (auth.uid() = author_id);`;
    try {
      await navigator.clipboard.writeText(sql);
      showNotification('SQL copied — paste into Supabase SQL Editor.', 'success');
    } catch (e) {
      showNotification('Copy failed — see DEPLOY.md for the SQL.', 'error');
    }
  });

  if (isConfigured()) {
    await getClient();
  }
  renderAuthPill();
}
