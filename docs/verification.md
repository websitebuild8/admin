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

## Google address search and mobile redesign — 5 October 2026

Flutter analysis and all 22 sequential tests pass. Address tests cover automatic
coordinate selection, unchanged Places sessions within a search/resolve sequence,
new sessions after selection, stale responses, island changes, out-of-zone results,
manual coordinates and required location confirmation. Three role previews fit
390 × 844. Customer home and restaurant-card PNGs were rendered with real fonts,
icons and the sample café photo, then visually inspected. The capture harness was
removed; preview artifacts are in docs/previews.

All 31 backend tests, TypeScript, ESLint and the final Next.js production build
pass. Provider tests verify Maldives/island restrictions, minimum field masks,
sanitized errors and no provider-key leakage. Lease tests reject altered users,
coordinates or expiry and reject expired proof. Supabase migration five was
applied; Google-content cleanup is scheduled hourly and ran successfully. A
transactional verification confirmed coordinate-copy deletion across saved
addresses, restaurant endpoints, orders and quotes; preservation of user/manual
records; private/RLS counter access; and the conditional PostgreSQL usage cap.
All verification fixture writes were rolled back.

Codemagic YAML and every script's shell syntax were validated. Both workflows
retain the corrected absolute APK artifact path. Connected builds accept the
restricted Android Maps key and an optional stable private debug keystore; they
print the certificate fingerprint without exposing the private key. No new native
APK or iOS binary was built locally.

Google Maps/Places keys are not configured yet; no real provider request was made.
The local backend signing secret was generated without printing or committing it.
Device validation of Google map rendering, Android/iOS key restrictions and Liquid
Glass remains pending. Legal texts retain placeholders, BML collection is disabled,
and no public deployment or legal sign-off is claimed.

## Three-role mobile redesign — 7 October 2026

Redesigned discovery/search, restaurant menus, kitchen orders, customer order
progress, map-led rider work, authentication branding, welcome and splash screens.
The reference/decision notes are in mobile-design.md. Ten actual Flutter render
captures with loaded fonts/icons and sample photography are in docs/previews;
mobile-redesign.html provides a filterable review gallery. The temporary capture
harness was removed. The illustrative preview map is original, identified as an
illustration, and never represented as real Google navigation or rider GPS.

All 26 sequential mobile tests pass, including adding an item, exact price
validation, changing stock, deleting with confirmation, narrow role layouts,
role restrictions, disabled payment submission, address safety and an open
customer status page receiving updated milestones. All 32 backend tests pass.
TypeScript, ESLint and the production Next.js build passed using one build worker.
Native launch XML/storyboard files parse. Final Flutter analysis found no issues.

Supabase migration six, 20261007000000_menu_categories, was applied successfully.
A rollback transaction exercised the actual menu service create/edit/stock/delete
functions and category filtering. Another approved restaurant received 404 for
foreign item mutations; customer and pending accounts received 403. Sold-out
items disappeared from the customer catalog, and old order line snapshots remained
unchanged after editing/deletion. Every verification fixture was rolled back.
The test database client emitted a pg serial-query deprecation warning inside the
transaction; the checks completed successfully.

Real Google credentials/provider rendering, Android/iOS cold-start and SDK key
restrictions, iOS compilation/Liquid Glass and native Clerk sessions still need
CI/device checks. No local APK was compiled, no iOS binary was produced, and BML
collection remains disabled. Item photography/upload and modifiers are unfinished.
No Git commit or push was made for this redesign, per the user's manual-push preference.

## Shared demo bank and integrated orders — 7 October 2026

Added isolated, persistent demo sessions managed by allowlisted Clerk admins.
Phones join with an expiring private key and a fictional customer/restaurant/rider
role. The admin's existing pages switch to this session and label its payments as
simulated. Live BML checkout and real account approval rules remain unchanged.

Migration seven, `20261007010000_shared_demo_gateway`, was applied to the configured
Supabase project. The table has RLS and no public/anon/authenticated grants. The
actual database verification exercised simultaneous checkout and approval retries,
one rider acceptance, every delivery milestone, all role views, owner isolation,
key rotation/expiry and rejection of demo keys by real mobile authentication.
It found one order, one completed delivery and unchanged real table counts. All
verification sessions were deleted. No real users, orders or payment attempts were
created, and no bank was contacted.

All 39 backend tests and 31 sequential Flutter tests passed. Coverage includes
server-owned totals, approval-only submission, decline/cancel without an order,
idempotent replay, expired quotes, menu changes before approval, scoped actions,
ten-item pagination, no card inputs and failed-session UI. The existing real
checkout test still proves submission disabled after a valid quote. Flutter
analysis found no issues; ESLint, TypeScript and the production Next.js build
passed, using one build worker.

The demo walkthrough is `docs/demo-purchases.md`. To test on separate phones,
deploy/reach the backend and rebuild the APK through Codemagic; no APK or iOS
binary was built locally. Native-device bank-screen interactions, native Clerk
sessions and Google SDK rendering remain device checks. Browser UI review of a
signed-in shared admin session was not performed. No Git commit, push or public
deployment was performed, following the user's manual-push preference.
