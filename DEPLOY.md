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
accounts, or share links.

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

### Accounts and hosted AI credits (Clerk + Neon)

Sign-in is Clerk and the credit counts live in a Neon Postgres database. Add
both from the Vercel project's **Storage / Marketplace** tab; each one adds its
own environment variables, so there is nothing to copy by hand:

| Added by | Name | Used for |
|------|-------|-------|
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | The browser's sign-in (the build reads this name; `VITE_CLERK_PUBLISHABLE_KEY` also works) |
| Clerk | `CLERK_SECRET_KEY` | The server checks session tokens with it |
| Neon | `DATABASE_URL` | Plans and monthly credit counts |

Redeploy after adding them. The server creates its two tables and one function
in the database the first time it is used. Once both are present, hosted AI
needs a signed-in account and spends credits (20 a month by default; see
`docs/BACKEND.md`). Without them, hosted AI works for everyone as before.

### AI cloud features

Hosted AI uses `OPENAI_API_KEY` server-side for alt text, captions,
screenshot-to-HTML, auto-enhance, image generation, and image edits. Local/dev
users can still paste their own OpenAI or Anthropic key in the **AI Tools → API
Keys** panel; those keys live in their own browser `localStorage` and calls go
straight from their browser to the provider.

See `docs/BACKEND.md` for the route list and what the backend adds.

### Bundle size & lazy loading

v5 dependencies (OpenAI/Anthropic SDKs, Tesseract.js, @imgly/background-removal) are split into separate chunks via Vite's `manualChunks` and dynamically `import()`-ed only when the related feature is first used. Initial JS payload stays roughly the same as v4 (~30KB gzipped main bundle + small chunks).

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
