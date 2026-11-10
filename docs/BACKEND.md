# SnapShotPro Backend

SnapShotPro uses Vercel serverless functions in `api/`. There is no separate
server process to host: when the site is deployed, the API routes deploy beside
the Vite frontend.

## What It Adds

- Server-side AI keys: visitors can use hosted AI features without pasting their
  own OpenAI key into the browser.
- AI text tools: alt text, captions, SEO descriptions, and screenshot-to-HTML can
  run through `/api/ai-vision`.
- Smart enhancement: auto-enhance can call `/api/ai-enhance` for brightness,
  contrast, and saturation suggestions.
- Generative image tools: background generation, background replacement, canvas
  extension, and magic eraser use the existing image endpoints.
- Graceful fallback: if the backend is not configured, the editor still works
  with the existing bring-your-own-key flow or local analysis.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/ai-vision` | Vision prompt against the current image. Returns `{ text }`. |
| `POST /api/ai-enhance` | Suggests CSS filter values. Returns `{ filters }`. |
| `POST /api/image-generate` | Generates a PNG. Returns `{ b64 }`. |
| `POST /api/image-edit` | Inpaints/outpaints a PNG. Returns `{ b64 }`. |
| `GET /api/account?op=me` | Accounts. With a Supabase login token: `{ plan, used, limit, resets }` for this month's hosted AI credits. `{ enabled: false }` when metering is not set up. |
| `GET /api/share-status` | v41 share links. Returns `{ enabled }`. |
| `POST /api/share-create` | Reserves a share id; returns the owner key and the planned file paths. |
| `POST /api/share-upload` | The Blob client's upload handshake: a presigned PUT for one planned file. |
| `POST /api/share-commit` | Checks the manifest and uploads, then publishes `manifest.json`. |
| `GET /api/share-manifest?id=` | The published manifest plus the folder URL its images live in. |
| `POST /api/share-delete` | Deletes a share. Needs the owner key. |
| `GET /s/<id>` | Serves the share viewer with link-preview tags (rewritten to `/api/share?op=page`). |
| `GET /api/share-sweep` | Daily cron. Removes uploads that were never published. |
| `POST /api/waitlist` | Glint Pro waitlist. Stores `{ email, at, source }` encrypted under `waitlist/` in the share Blob store. Always answers `{ ok: true }` for a valid email. |
| `GET /api/waitlist-export` | The waitlist for the site owner, as JSON or `?format=csv`. Needs `Authorization: Bearer <CRON_SECRET>`. |

All share routes run in one function, `api/share.js`: `vercel.json` rewrites
`/api/share-<op>` to `/api/share?op=<op>`, and the route code lives in
`api/_share-<op>.js`. The Hobby plan allows 12 functions per deployment, and
every file in `api/` without a leading underscore counts as one.

## Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes for hosted AI | Server-side OpenAI key used by `/api/*` AI routes. |
| `OPENAI_VISION_MODEL` | No | Overrides the default vision model for `/api/ai-vision`. |
| `OPENAI_ENHANCE_MODEL` | No | Overrides the model for `/api/ai-enhance`. |
| `BLOB_STORE_ID` or `BLOB_READ_WRITE_TOKEN` | Yes for share links | Added by Vercel when a Blob store is connected to the project. Newer stores add `BLOB_STORE_ID` (the SDK signs in with the deployment's OIDC token); older ones add `BLOB_READ_WRITE_TOKEN`. Either works. |
| `SHARE_SIGNING_SECRET` | Yes for share links | 32+ random bytes (base64). Signs the owner key that lets someone delete their link. Changing it orphans every existing key. |
| `SHARE_REPORT_EMAIL` | No | Shows a "Report this link" mailto on shared pages. |
| `CRON_SECRET` | Yes for the sweep and the waitlist export | A long random string you add yourself; Vercel then sends it with cron requests. Authorizes the daily `/api/share-sweep` run and `/api/waitlist-export`. Without it both answer 401. |
| `SHARE_STORE` | Tests only | `memory` swaps Blob for an in-process store. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for AI credits | The Supabase service role key (server only, never `VITE_`). Setting it turns metering on: hosted AI then needs a signed-in account and spends credits. |
| `SUPABASE_URL` | No | The Supabase project URL for the server. Falls back to `VITE_SUPABASE_URL`. |
| `AI_FREE_CREDITS` / `AI_PRO_CREDITS` | No | Monthly hosted AI credits per account. Default 20 and 500. |

## Accounts and hosted AI credits

Run `supabase/glint-pro.sql` once in the Supabase SQL Editor, then set
`SUPABASE_SERVICE_ROLE_KEY` on the deployment. From then on the six hosted AI
routes (`ai-text`, `ai-vision`, `ai-enhance`, `ai-agent`, `image-generate`,
`image-edit`) check the caller's Supabase login token and spend credits through
the `glint_use_credits` Postgres function: 1 per text, vision, enhance or agent
call, 5 per image. A call that fails gets its credits back. Without a token the
route answers `401 { code: 'sign_in' }`, over the limit `402 { code:
'no_credits' }`, and the editor falls back to the visitor's own API key. To
give an account Pro by hand, insert a row into `public.subscriptions` with its
`user_id`. Remove the env var to turn metering off again.

Share links (v41) are stored in Vercel Blob under `shares/<id>/`: the rendered
images, a `poster.webp` for link previews, and a `manifest.json` that names its
images by file name only. Shared files are cached for an hour, so a deleted
link can take up to an hour to disappear from the CDN.

Supabase is still used separately for accounts, cloud projects, templates,
the community gallery, and live collaboration.
