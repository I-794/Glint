// Sign-in, through Clerk. Glint works without an account; signing in is how
// the hosted AI counts its free monthly credits (see features/account.js).
//
// Clerk's browser bundles are loaded from the Clerk instance itself (its
// "Frontend API", whose host is encoded in the publishable key), so nothing
// is added to Glint's own build and a copy of Glint without a key loads
// nothing and shows no sign-in at all.

const PUBLISHABLE_KEY = (import.meta.env
  && (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)) || '';

let clerk = null;
let loading = null;
let failed = false;
let currentUserId = null;
const listeners = [];

export function onAuthChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach((fn) => { try { fn(getUser()); } catch (e) { console.error(e); } }); }

// The Frontend API host: the key is pk_<env>_<base64 of "host$">.
export function frontendApiHost(key) {
  const m = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(String(key || ''));
  if (!m) return '';
  try {
    const host = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')).replace(/\$$/, '');
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) && host.includes('.') ? host : '';
  } catch (e) {
    return '';
  }
}

export function isConfigured() {
  return Boolean(frontendApiHost(PUBLISHABLE_KEY));
}

export function getUser() {
  const u = clerk && clerk.user;
  if (!u) return null;
  const email = (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || '';
  return { id: u.id, email, name: u.fullName || u.username || email || 'You' };
}

function addScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error('Could not load ' + src)); };
    document.head.appendChild(s);
  });
}

async function loadClerk() {
  const host = frontendApiHost(PUBLISHABLE_KEY);
  // The UI bundle first, then the SDK, which finds its key on its own tag.
  await addScript(`https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`);
  await addScript(`https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { 'data-clerk-publishable-key': PUBLISHABLE_KEY });
  const instance = window.Clerk;
  if (!instance) throw new Error('Clerk did not start');
  await instance.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
  clerk = instance;
  currentUserId = clerk.user ? clerk.user.id : null;
  // Clerk calls this on every refresh of the session; only a change of person matters here.
  clerk.addListener(({ user }) => {
    const id = user ? user.id : null;
    if (id === currentUserId) return;
    currentUserId = id;
    renderAuthPill();
    emit();
  });
  return clerk;
}

// Resolves to the Clerk instance, or null when sign-in is not set up or could
// not load (offline, blocked). A later call tries again.
export function ready() {
  if (!isConfigured()) return Promise.resolve(null);
  if (clerk) return Promise.resolve(clerk);
  if (!loading) {
    loading = loadClerk()
      .then((c) => { failed = false; return c; })
      .catch((e) => { failed = true; console.warn('[auth]', e.message); return null; })
      .finally(() => { loading = null; });
  }
  return loading;
}

// The signed-in person's session token for our own API, or '' when signed out.
export async function getToken() {
  const c = await ready();
  if (!c || !c.session) return '';
  try { return (await c.session.getToken()) || ''; } catch (e) { return ''; }
}

export async function openSignIn() {
  const c = await ready();
  if (!c) {
    const { showNotification } = await import('../ui/notification.js');
    showNotification('Sign-in could not load. Check your connection and try again.', 'error');
    renderAuthPill();
    return;
  }
  if (c.user) return;
  c.openSignIn();
}

function renderAuthPill() {
  const pill = document.getElementById('auth-pill');
  if (!pill) return;
  if (!isConfigured()) { pill.replaceChildren(); return; }
  if (clerk && clerk.user) {
    // Clerk's own account button: avatar, manage account, sign out.
    const holder = document.createElement('span');
    holder.id = 'auth-user-button';
    holder.style.display = 'inline-flex';
    pill.replaceChildren(holder);
    clerk.mountUserButton(holder);
    return;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.id = 'auth-signin-btn';
  btn.title = failed ? 'Sign-in could not load. Click to try again.' : 'Sign in for free hosted AI credits';
  btn.textContent = 'Sign in';
  btn.addEventListener('click', openSignIn);
  pill.replaceChildren(btn);
}

export async function bindAuth() {
  renderAuthPill();
  if (!isConfigured()) return;
  await ready();
  renderAuthPill();
  emit();
}
