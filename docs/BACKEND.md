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
| `GET /api/share-status` | v41 share links. Returns `{ enabled }`. |
| `POST /api/share-create` | Reserves a share id; returns the owner key and one Blob upload token per file. |
| `POST /api/share-commit` | Checks the manifest and uploads, then publishes `manifest.json`. |
| `GET /api/share-manifest?id=` | The published manifest plus the folder URL its images live in. |
| `POST /api/share-delete` | Deletes a share. Needs the owner key. |
| `GET /api/share-page?id=` | Serves `/s/<id>` (via the `vercel.json` rewrite) with link-preview tags. |
| `GET /api/share-sweep` | Daily cron. Removes uploads that were never published. |

## Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes for hosted AI | Server-side OpenAI key used by `/api/*` AI routes. |
| `OPENAI_VISION_MODEL` | No | Overrides the default vision model for `/api/ai-vision`. |
| `OPENAI_ENHANCE_MODEL` | No | Overrides the model for `/api/ai-enhance`. |
| `BLOB_READ_WRITE_TOKEN` | Yes for share links | Added by Vercel when a Blob store is connected to the project. |
| `SHARE_SIGNING_SECRET` | Yes for share links | 32+ random bytes (base64). Signs the owner key that lets someone delete their link. Changing it orphans every existing key. |
| `SHARE_REPORT_EMAIL` | No | Shows a "Report this link" mailto on shared pages. |
| `CRON_SECRET` | Set by Vercel | Authorizes the daily `/api/share-sweep` run. |
| `SHARE_STORE` | Tests only | `memory` swaps Blob for an in-process store. |

Share links (v41) are stored in Vercel Blob under `shares/<id>/`: the rendered
images, a `poster.webp` for link previews, and a `manifest.json` that names its
images by file name only. Shared files are cached for an hour, so a deleted
link can take up to an hour to disappear from the CDN.

Supabase is still used separately for accounts, cloud projects, templates,
the community gallery, and live collaboration.
