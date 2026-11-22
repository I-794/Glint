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

## Billing: built, waiting for its settings

Checkout is built on Stripe Checkout with Managed Payments (Stripe sells as
the merchant of record). Lemon Squeezy was the first pick; its own sign-up now
points to Managed Payments, so that is what was used. Nothing is on sale until
the deployment has the settings below; until then the panel keeps showing the
waitlist link.

To switch it on, in a Stripe **sandbox** first:

1. Stripe: turn on Managed Payments, create the product "Glint Pro" with the
   tax code "Software as a service (SaaS) - personal use" and a monthly price.
2. Vercel settings: `STRIPE_SECRET_KEY` (sandbox key, Sensitive),
   `STRIPE_PRICE_ID` (`price_...`), `PRO_PRICE_LABEL` (for example
   `$8 a month`). Redeploy.
3. Stripe: add a webhook destination (snapshot events) for
   `https://<site>/api/account?op=webhook` with `checkout.session.completed`
   and the `customer.subscription.*` events. No signing secret is needed.
4. Stripe: save the customer portal settings once, so Manage billing opens.
5. Test with card 4242 4242 4242 4242: upgrade, see Pro and 500 credits,
   cancel from Manage billing, see the plan end.

This has only run against a stand-in Stripe and a local Postgres so far. The
first sandbox run is the real test, including whether the pinned API version
accepts `managed_payments`.

## Built for v43 Keepsake (on `feat/v43-keepsake`)

- **Hosted "Your links" & view counts:** Signed-in links bind to the account (`user_shares`), aggregate views count on `/api/share-view` (`share_views`), Pro users see synced links across devices and can delete any owned link with their session.
- **Pro expiry perk:** Once Stripe billing is active, free/anonymous links cap at 30 days while Glint Pro keeps links indefinitely.
- **Cross-device cloud sync:** Pro accounts sync projects (up to 3.6 MB/project, 40 projects, 50 MB total, with tombstones and conflict protection) plus Looks, Brand Kits, and Templates in private Neon Postgres (`user_projects`, `user_libraries`).
- **Dynamic pricing page:** `/pricing/` reads `/api/account?op=me` and automatically switches the Pro card from the waitlist to the live price and Upgrade CTA (`/editor/#pro=upgrade`) as soon as `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set.

## Next

- Test billing in a Stripe sandbox on the preview deployment (`feat/v43-keepsake`) using the steps above.
- Go live: Vercel Pro plan first (Hobby is non-commercial), then add the live Stripe key, price id, and `PRO_PRICE_LABEL` in Vercel. Email the waitlist.
- Watch whether 20 free credits is enough: the Design Agent spends one per
  step. Tune with `AI_FREE_CREDITS`.

## Decisions made

- The studio stays free; Pro covers the parts that cost money to run.
- Starting numbers: about $8 a month, 20 free and 500 Pro credits.
- Payments: Stripe Managed Payments. A lapsed payment drops the account to
  Free at once (no grace period); it returns to Pro when the payment clears.
- Glint Pro ships as **v43 Keepsake** (v42 Junction shipped separately).
