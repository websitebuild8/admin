# Admin verification

Checked 3 October 2026 against the local demo.

- Eight domain tests pass: schema contract, payment guard, sequential fulfilment, required rider, double assignment prevention, partner verification, refund reservation limits, and attributable immutable updates.
- ESLint passes. Production compilation and TypeScript checks pass with one build worker.
- Browser checks: order progression, available rider assignment, blocked approval before verification, simulated restaurant approval, invalid email rejection, and demo reset.
- Desktop and narrow layouts inspected. No browser console errors observed during these checks.
- The live admin state endpoint returns HTTP 403 while demo mode is active.

These checks do not validate external Clerk sessions, Neon connectivity, applied migrations, BML transactions, real document verification, mobile role access, or legal compliance. Those require the corresponding credentials, integrations, and launch review. See the architecture and launch checklist.

## Ten-item pagination

Type checking, lint, and the production build pass after adding shared display pagination to orders, restaurants, riders, customers, payments, refund reviews, support, and activity. Browser checks confirmed 10 then 3 rows for 13 orders/payment records, a disabled final-page Next button, search/filter reset from page two, empty-result controls, and pagination summaries on every remaining list. Desktop and narrow layouts were checked. CSV exports retain the full filtered result set. Server-side query pagination remains a separate scaling task.

## Separate preparation, delivery and dispatch workflows

17 domain/security tests pass, including paid confirmation, nearby eligibility, expired/competing offers, pickup prerequisites, milestone ordering, duplicate completion, revoked roles and coordinate-free customer/restaurant projections. TypeScript, lint and production build pass. Browser exercised confirmation → offer acceptance → restaurant arrival → food readiness → shared pickup → customer arrival → completion. Recipient inbox events were visible in Dispatch. Mobile and scheduler endpoints returned 403 without authorized access in demo mode. Sidebar fit verified at 600px and 768px heights.

Live Google Maps, Clerk participant sessions, Neon migrations/concurrent transactions, deployed cron, device GPS and push delivery remain unverified; no credentials were provided or migration applied. See live-tracking.md for activation steps.

## Supabase provider setup

Replaced current Neon setup instructions/UI with Supabase PostgreSQL, retaining Clerk and Prisma. Added a server-only table access migration (RLS enabled; public client grants revoked), shared local environment configuration, and an explicit migration connection requirement. Prisma client generation, TypeScript, lint and diff whitespace checks passed. Missing migration credentials fail with a setup message before connecting. Supabase credentials remain empty: migration SQL, connection pooling, RLS behavior and live CRUD are not yet database-tested. Storage and Realtime remain separate future integrations.

## Supabase live database verification — 3 October 2026

Configured the downloaded Supabase root CA for verified TLS in Prisma CLI and pg
runtime connections. Applied all three migrations to an initially empty public
schema. Verified 10 business tables with RLS enabled and direct client-role table
grants revoked. Prisma transaction-pool reads and create/update/delete succeeded;
verification writes were rolled back and no test records remain. TypeScript, lint,
and diff whitespace checks passed. Demo mode remains enabled; Clerk sign-in,
production deployment, Data API dashboard setting, and concurrent rider acceptance
remain unverified. No credentials were printed or committed.

## Clerk activation — 3 October 2026

Clerk Backend API verified the allowlisted administrator exists and is neither
locked nor banned. Local demo mode disabled, production build passed, and server
started at http://localhost:3000. Browser displayed Clerk email/password and Google
sign-in. Signed-out root, admin state API, and mobile operations API redirected
to sign-in (307) without exposing records. Real administrator sign-in and a signed-in
non-admin denial test still require browser sessions and are not yet verified.
Clerk development keys are in use; this is local integration testing, not a
production deployment. Bind the local preview to localhost: binding 127.0.0.1
caused internal localhost rewrite requests to hang in this configuration.

## Administrator-only registration restriction — 3 October 2026

Clerk Organizations were enabled with mandatory organization selection. Disabled
Organizations through the Backend API and verified `enabled=false`. Added only the
existing allowlisted administrator's primary email to Clerk's identifier allowlist
without notifications, then enabled the allowlist (`allowlist=true`, HTTP 200).
Existing unrelated users and organizations were not deleted. Organization roles
never grant iGO admin permissions; requireAdmin checks ADMIN_CLERK_USER_IDS.
SignIn now disables combined sign-up and OAuth-to-sign-up transfer. Production build
and TypeScript passed. A separate non-admin browser session remains untested.

To add another administrator: create the user in Clerk, add their email to Clerk's
allowlist, add their exact user ID to ADMIN_CLERK_USER_IDS, and restart/redeploy.
These instance-wide restrictions must be revisited for future public mobile
registration, while preserving the server-owned admin ID check.

## Flutter mobile preview and entrance addresses — 3–4 October 2026

Flutter analysis and 12 sequential unit/widget checks pass. Checks cover integer
cart totals, destination-only Maps URLs, finite coordinates, allowed-island
validation, immutable address serialization, required pin confirmation, clearing
the pin on island changes or subsequent map movement, manual-coordinate validation
and returned address details, checkout address reuse, locked default registration, disabled payments,
and all three role previews at 390 × 844. Widget tests replace the map platform
view with a local fixture; real tile rendering requires a separate browser/device
check. The web build passed; browser checks displayed Malé roads and landmark
labels, confirmed an entrance, entered a building/unit/instructions, and returned
the saved building label to customer home and the full address/pin to checkout.
On the final web build, dragging the map cleared confirmation; confirming again
used the updated camera coordinates. Switching to Hulhumalé cleared the Malé pin,
loaded the second island map, and confirmed its entrance coordinates. Preview
screenshots are in `docs/previews`.
The tile provider logged a missing office sprite warning and Flutter logged an
emoji font fallback warning; neither prevented address interaction. No account
addresses, location fixes, orders or payments were written to the backend. Android
explicitly removes transitive fine/coarse location permissions.

The preview uses Flutter glass effects, not Apple's native Liquid Glass. Native
Android/iOS builds, mobile Clerk sessions, production coverage validation, BML,
shared role status updates, push and secure account persistence remain unverified.
