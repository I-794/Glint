# Deploy to Vercel

Vercel detects Vite automatically. There's no config needed beyond what's in `vite.config.js`.

## Prerequisites

```bash
npm install
npm run dev       # works locally at http://localhost:5173
npm run build     # produces dist/ — what gets deployed
```

If `npm run build` fails, fix that first. Vercel will hit the exact same error.

## Option A: GitHub + Vercel (recommended)

This gives you auto-deploy on every push, preview URLs for branches, the works.

1. **Create a GitHub repo and push.**
   ```bash
   git init
   git add .
   git commit -m "Initial Vite scaffold"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/glint.git
   git push -u origin main
   ```

2. **Go to https://vercel.com/new.**

3. **Import the GitHub repo.** Click "Add New..." → "Project" → select the repo.

4. **Confirm settings.** Vercel detects Vite and fills these in:
   - Framework Preset: **Vite**
   - Build Command: **`npm run build`**
   - Output Directory: **`dist`**
   - Install Command: **`npm install`**

   Don't change them.

5. **Click Deploy.** First build takes 30–60 seconds. You get a URL like `glint-yourname.vercel.app`.

6. **Done.** Every `git push` to `main` triggers a production deploy. Every push to a non-`main` branch gets its own preview URL.

## Option B: Vercel CLI (no GitHub needed)

```bash
npm install -g vercel
vercel login          # one-time
vercel                # first run: answers wizard, links project
vercel --prod         # push to production
```

The wizard asks:
- Set up and deploy? **Y**
- Which scope? Pick your account
- Link to existing project? **N**
- Project name? `glint` (or whatever)
- Code directory? `./` (default)
- Modify settings? **N** (Vite is auto-detected)

After the first deploy, `vercel` alone makes a preview build, `vercel --prod` makes a production build.

## Custom domain (optional)

In the Vercel project dashboard → Settings → Domains → add your domain. Vercel walks you through the DNS records.

## Optional environment variables

The app still works without these values for offline editing, local analysis,
PWA install, and bring-your-own-key AI. Add them when you want hosted AI,
accounts, cloud sync, or share links.

### Hosted AI backend

In Vercel → Project → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `OPENAI_API_KEY` | your server-side OpenAI API key |
| `OPENAI_VISION_MODEL` | optional override for alt text/captions/screenshot-to-HTML |
| `OPENAI_ENHANCE_MODEL` | optional override for auto-enhance |

This enables the serverless routes in `api/` so visitors can use AI features
without pasting their own key. If `OPENAI_API_KEY` is missing, those routes
return `501` and the editor falls back to the existing browser-key flow.

### Supabase (for accounts + cloud project sync)

Create a free Supabase project at https://supabase.com/, then in the Vercel project → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | from Supabase project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | from Supabase project Settings → API (the **anon public** key, safe to ship to browsers) |

Both must start with `VITE_` so Vite exposes them to the client bundle.

Then in your Supabase project, create the schema (SQL Editor → New Query):

```sql
create table if not exists public.templates (
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
  updated_at timestamptz default now(),
  unique (user_id, name)
);
alter table public.projects enable row level security;
create policy "users own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

In Supabase → Authentication → Providers, enable Email (default) and optionally Google/GitHub. For Google/GitHub, set the redirect URL to your Vercel domain.

### AI cloud features

Hosted AI uses `OPENAI_API_KEY` server-side for alt text, captions,
screenshot-to-HTML, auto-enhance, image generation, and image edits. Local/dev
users can still paste their own OpenAI or Anthropic key in the **AI Tools → API
Keys** panel; those keys live in their own browser `localStorage` and calls go
straight from their browser to the provider.

See `docs/BACKEND.md` for the route list and what the backend adds.

### Bundle size & lazy loading

v5 dependencies (Supabase SDK, OpenAI/Anthropic SDKs, Tesseract.js, @imgly/background-removal) are split into separate chunks via Vite's `manualChunks` and dynamically `import()`-ed only when the related feature is first used. Initial JS payload stays roughly the same as v4 (~30KB gzipped main bundle + small chunks).

The 23 MB `ort.wasm` (background-removal model) in `dist/` is **not loaded by default** — it's only fetched when the user clicks "Remove Background." Vercel serves it as a static asset like any other.

### PWA install

After the first visit, modern browsers show an "Install" button in the address bar. The service worker (`dist/sw.js`) precaches the app shell + small assets and uses a runtime cache for CDN-hosted AI models so they survive offline.

## Common issues

- **"Build failed — Cannot find module"**: A file imports something that doesn't exist yet. Check the build log for the missing path and either create the file or comment out the import.
- **"Output Directory `dist` not found"**: `npm run build` didn't finish. Run it locally and read the error.
- **Blank page after deploy, console says 404 on `/src/main.js`**: You opened `index.html` directly instead of going through `npm run dev` or the deployed URL. Vite needs to serve the file for module resolution to work; the production build will inline a hashed bundle URL automatically.
- **Assets 404 in production but work locally**: Make sure all paths in `index.html` start with `/` (e.g. `/src/styles.css`) not `./`. Vite handles the rewrite during build only for absolute paths.

## What you'll get

Production builds are fast (under a second for a project this size), the CDN is global, and the free tier is generous enough that this'll never cost you anything. Preview URLs are great for showing FRC teammates ("hey, try this version") without affecting the main site.
