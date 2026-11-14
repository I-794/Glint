# Glint Pro: where things stand

A running note so the work can be picked up in any session. Architecture is in
`CLAUDE.md` ("Glint Pro groundwork") and `docs/BACKEND.md`; this file is only
the status and the next steps.

## Done and live on main

- Pricing page has a "Glint Pro, coming soon" card with an email waitlist
  (PR #32). Read the list with the `CRON_SECRET` bearer on
  `/api/waitlist-export?format=csv`.
- Usage analytics on the site and in the editor (PR #32).
- Accounts and hosted AI credits, on Clerk (sign-in) and Neon (database).
  Supabase, cloud sync, the community gallery and live collaboration are
  removed (PR #34).
- Deployment settings: `CRON_SECRET` is set. Neon is connected as the store
  "glint-db", which added `DATABASE_URL` for Production and Preview.

## In progress: turning sign-in and metering on

1. Neon: connected. Done.
2. Clerk: add it from the Vercel Marketplace to the glint project. It should
   add `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
3. Redeploy, then check: the editor header shows "Sign in"; signing in shows
   Clerk's account button and an "AI credits" chip; a hosted AI call while
   signed out asks to sign in; `/api/account?op=me` answers with the plan.
   This will be the first run against the real Clerk and Neon (so far they
   were only tested with stand-ins and a local Postgres).
4. Clerk starts in development mode. Going to a production instance needs a
   DNS record on the site's domain.

Until step 3, hosted AI still works for everyone without an account.

## Next, after sign-in works

- Checkout and webhook with a merchant of record (Lemon Squeezy was the pick),
  as new ops in `api/account.js`.
- Vercel Pro plan before charging anyone (Hobby is non-commercial).
- An account panel in the editor (plan, credits, upgrade, manage billing).
- Share link perks for Pro, then real prices on the pricing page.
- Watch whether 20 free credits is enough: the Design Agent spends one per
  step. Tune with `AI_FREE_CREDITS`.

## Decisions made

- The studio stays free; Pro covers the parts that cost money to run.
- Starting numbers: about $8 a month, 20 free and 500 Pro credits.
- Glint Pro will be its own numbered release (v42 Junction shipped separately).
