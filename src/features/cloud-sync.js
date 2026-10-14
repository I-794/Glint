// Template cloud sync. (v12: full project sync + version history moved to
// features/projects.js, which owns the `projects`/`project_versions` tables.)
import { showNotification } from '../ui/notification.js';
import { getClient, getUser, onAuthChange } from './auth.js';

const TEMPLATES_KEY = 'glint_templates';

function loadLocalTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveLocalTemplates(obj) {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(obj)); }
  catch (e) {}
}

export async function pushTemplates() {
  const user = getUser();
  const c = await getClient();
  if (!user || !c) return;
  const all = loadLocalTemplates();
  const names = Object.keys(all);
  if (names.length === 0) return;
  const rows = names.map(name => ({
    user_id: user.id,
    name,
    payload: all[name],
    updated_at: new Date().toISOString()
  }));
  const { error } = await c.from('templates').upsert(rows, { onConflict: 'user_id,name' });
  if (error) console.warn('template sync push failed', error);
}

export async function pullTemplates() {
  const user = getUser();
  const c = await getClient();
  if (!user || !c) return;
  const { data, error } = await c.from('templates').select('name, payload').eq('user_id', user.id);
  if (error) { console.warn('template sync pull failed', error); return; }
  const local = loadLocalTemplates();
  let added = 0;
  data.forEach(row => {
    if (!local[row.name]) { local[row.name] = row.payload; added++; }
  });
  if (added > 0) {
    saveLocalTemplates(local);
    showNotification(`Synced ${added} template${added === 1 ? '' : 's'} from cloud.`, 'success');
    if (typeof window.__refreshTemplateList === 'function') window.__refreshTemplateList();
  }
}

async function syncOnSignIn(user) {
  if (!user) return;
  await pullTemplates();
  await pushTemplates();
}

export function bindCloudSync() {
  onAuthChange(syncOnSignIn);
}
