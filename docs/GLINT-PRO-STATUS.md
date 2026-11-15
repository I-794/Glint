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
  "glint-db", which added `DATABASE_URL` for Production and Preview. Clerk is
  connected too (see below).

## Sign-in and metering: on and checked on the live site

- Clerk is connected as "glint-signin" with a production instance on the
  site's domain (`clerk.` and `accounts.` subdomains plus three mail records,
  added to the domain's DNS). `CLERK_SECRET_KEY` and
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set for Production and Preview.
- Checked against the real Clerk and Neon: the editor shows Sign in, a new
  account gets 20 credits (the schema installed itself), a Design Agent step
  takes the chip to 19, and a signed-out hosted AI call answers `sign_in`.
- A browser with its own API key saved never spends credits (by design), so
  test metering in a private window.
- Clerk's deployment check on Vercel is required: a production deploy waits
  until Clerk's DNS and certificates are ready.
- Small leftover: the sign-in box says "glint-signin"; rename the application
  to Glint in Clerk's settings.

## Next

- Checkout and webhook with a merchant of record (Lemon Squeezy was the pick),
  as new ops in `api/account.js`.
- Vercel Pro plan before charging anyone (Hobby is non-commercial).
- The account panel is built (click the credits chip, or Cmd-K "Account"):
  plan, credits left, costs, waitlist link, manage account, sign out. Add the
  Upgrade and Manage billing buttons to it when checkout exists.
- Share link perks for Pro, then real prices on the pricing page.
- Watch whether 20 free credits is enough: the Design Agent spends one per
  step. Tune with `AI_FREE_CREDITS`.

## Decisions made

- The studio stays free; Pro covers the parts that cost money to run.
- Starting numbers: about $8 a month, 20 free and 500 Pro credits.
- Glint Pro will be its own numbered release (v42 Junction shipped separately).
