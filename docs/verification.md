# Admin verification

## Shared reporting periods — 19 October 2026

Added All time, Daily, Monthly and Yearly selection across current Admin,
Partner and Rider data views, including overview/report totals, packages,
collections, on-board work, completed history, available jobs, invoices,
transfers, account directories, applications, admin grants, notifications and
activity. Nested partner and invoice timelines also accept periods. Main-page
URLs preserve period/status combinations; changed filters reset pagination and
selection, and lists remain capped at ten. Dates use Maldives Time (UTC+5).

113 unit tests and the combined ten-check dashboard/reporting-period database
suite pass after the final compatibility fix.
The database suite uses actual Prisma queries in a disposable schema and
verifies calendar boundaries, milestone-specific package dates, status/date
composition, ten-row pagination, income verification dates, tenant isolation,
unchanged invoice documents, payment values, all-time outstanding debt and
full manual-invoice eligibility. It also checks nested timeline events,
application submission dates, account/admin directories, notification
workspaces, audit dates and rejection of impossible/future periods. The initial
timeline fixture expected one event despite both issuance and submission being
valid in the same window; it was corrected to assert those two immutable
events and exclude the next day's review. The successful rerun removed its
disposable schema. No operational live records were changed.

The wider regression run passed all 103 pre-existing workflow checks before
reaching an older dashboard helper that supplied `period=` or an unknown
period. Empty periods now retain their old All time meaning; unknown periods
are intentionally rejected rather than silently returning an unfiltered list.
The helper assertion was updated, unit coverage verifies empty-period
compatibility, and the final combined ten-check suite passes in a fresh schema.
That final schema was removed. A complete 113-check invocation was not rerun;
the pre-existing workflow coverage and combined feature suite were verified in
separate runs. Changed-source ESLint and whitespace checks pass.
The final single-worker production build, including TypeScript, also passes.

Actual components were checked with fictional transports and substitutes for
Clerk/Next navigation: daily/month/year selection and Apply, combined invoice
status/date URLs, the all-outstanding-debt shortcut, Partner card navigation
retaining its month, Rider history retaining its year, and mobile width 390px
without horizontal page overflow. The native month/day pickers were exercised
with keyboard controls. These checks do not establish a hosted Clerk session,
hosted navigation behavior or deployment.

No database migration or environment setting is needed. The changes still
require the user's manual VS Code commit/push and Netlify redeployment. See
[date-period filter operation](date-period-filters.md) for date semantics and
financial safeguards.

## Dashboard card navigation — 19 October 2026

Admin and Partner summary cards now open their own workspace's filtered lists:
balance due → outstanding invoices (including partially paid and pending-review
balances), pending deliveries → registered or picked-up packages, delivered →
all delivered packages, and awaiting billing → delivered packages without an
invoice line. Filter choices are reflected in URLs and remain available on the
destination page. Changing the URL filter resets search, page and selection.
Rider cards open Collections, On board, and today's delivered history. Today is
the half-open midnight-to-midnight window in Maldives Time; All deliveries
remains available. Card navigation never confirms pickup or payment.

109 unit tests pass, including midnight, leap-day and year-boundary checks. The
five focused `--dashboard-navigation` database checks pass in an isolated schema
which was removed afterward. They cover server-side status combinations,
ten-row pagination, search composition, invoice column comparison, partial and
pending-receipt balances, partner/rider isolation, midnight boundaries and exact
reconciliation between overview totals and destination lists. A transient
connection timeout occurred before the successful database rerun. No live
operational records were changed. The single-worker production build (including
TypeScript), changed-source ESLint and whitespace checks pass.

The actual portal components were checked with fictional data and authentication
and Next navigation substitutes. All four Admin and Partner card destinations
and all three Rider destinations opened correctly. Mobile width 390px has no
horizontal page overflow; keyboard Enter activates the cards. The existing
earnings-period controls remain independent. This preview does not establish a
real hosted Clerk session or hosted Next.js transition behavior.

No schema migration or new environment variable is required. The user still
needs to commit/push from VS Code and redeploy Netlify. No commit, push or hosted
deployment was performed.

## Automatic admin, partner and rider workspaces — 18 October 2026

107 unit tests and the complete 103-check database integration suite pass. The
suite uses an isolated disposable schema and removes it afterward. Eight new
checks cover concurrent root initialization, immediate provisioning on staff
grants, ordinary-user denial (including direct SQL and forged flags), own-profile
configuration, tenant/inbox isolation, physical rider operations, role retention
on admin revocation, stale cached commands, assignment release, regrant and
unchanged existing account IDs. The earlier delivery, invoice, verified-payment,
earnings, pricing and permanent-deletion checks also pass. Partner activation's
protected transaction now allows enough time for remote database round trips;
the full rerun confirms ordinary partner activation still works.

Applied `20261018010000_admin_multiple_operational_roles` to the configured
Supabase database. Before/after fingerprints match for all 30 existing delivery
tables, excluding only the new primary-role metadata and intentional workspace
classification of existing notifications. Indexes, role guards and private
client permissions were verified. The migration did not create operational
profiles, change Clerk users, send emails, or delete live data. Existing admins
receive missing profiles on their first request to the updated site; new grants
provision them in the same transaction.

Actual role-switcher and workspace-details components were checked with
fictional responses at 390px: Admin, Partner and Rider switch without signup,
and the phone layout has no horizontal overflow. This fixture replaces Next
navigation and authentication; it does not establish hosted Clerk session
verification. The identity-directory transport in the database suite is also a
test double. No live admin grant or role profile was created during QA.

Source changes require the user's manual commit/push and Netlify deployment.
The final single-worker production build (including TypeScript), ESLint for
changed source files, and whitespace checks pass.
See [automatic admin workspaces](admin-workspaces.md) for release and operation.

## Super-admin permanent deletion and cache cleanup — 18 October 2026

103 unit tests pass. The focused eight-check deletion integration suite passes
in a disposable schema, including configured-root authorization, forged flags,
stale previews, exact-name confirmation, direct SQL deletion denial, paid-ledger
removal, simultaneous retries, cache erasure/tombstones, earnings reconciliation,
private-file retry jobs, completed rider attribution, in-transit protection,
partner application removal, preserved admin grants and private table/function
permissions. The Storage transport is simulated; no real uploaded file was
deleted during QA. All disposable schemas were removed.

The wider regression run passed the existing delivery, payment, invoicing,
earnings, origin pricing, admin access and optional-application checks. Its last
deletion fixture used an invalid business type; that fixture was corrected to
`BUSINESS`, and the final focused deletion run passed all eight checks. The
single-worker production build (including TypeScript), ESLint and whitespace
checks pass.

Applied additive migration `20261018000000_super_admin_deletion` to the configured
Supabase database. Before/after fingerprints of 28 existing delivery tables
match (excluding only the newly added default cache metadata). New deletion and
file-outbox tables have RLS and remain empty. No live record or Storage object
was deleted. Actual read-only partner, invoice and package deletion previews
also pass against the configured database; no deletion was executed. Source
changes still require the user's manual commit/push and
Netlify redeployment.

The actual client confirmation component was checked with fictional responses
at mobile width 390px. It fits without horizontal overflow, requires both the
record name and a reason before enabling deletion, and preserves the row when
cancelled. The trash button has a transparent background, red border and red
icon. This fixture does not establish hosted Clerk session verification.

See [super-admin deletion](super-admin-deletion.md) for operation, linked-record
scope, file retry behavior and currency-label editing instructions.

## Deployed dashboard database repair — 17 October 2026

The updated Netlify dashboard displayed a generic data-loading error while both
17 October migrations were still pending. Applied
`20261017000000_origin_pricing_retire_cod` and
`20261017010000_admin_access_optional_partner_assets` successfully with Prisma
migrate deploy against the configured Supabase database.

Read-only checks of the actual server query functions now pass for overview,
notifications, packages, partners, applications, drivers, administrators, rates,
destinations, invoices and payments. Page lists remain capped at ten. New tables
have RLS enabled and deny public client roles direct access.

Before/after record fingerprints confirm existing packages, invoices, invoice
lines, receipts, payments, allocations, paid copies, sends and historical cash
records are unchanged. Retired parcel cash details match the private archive.
No operational invoice, payment, delivery, user or notification was created by
these checks, and the invoice scheduler was not manually invoked. No signed-in
hosted browser session was available; the user should refresh the page or select
Retry. No source-code redeployment is required for this database alignment.
No Git commit, push or hosted deployment was performed by the repair.

## Super admin, shared accounts and optional application assets — 17 October 2026

95 unit tests and the complete 83-check database integration suite pass. The
additional six checks cover super-admin-only grant/revoke/list access, protected
roots, forged client flags, concurrent/replayed grants, stale admin commands after
revocation, partner/admin and rider/admin identity preservation, workspace-scoped
notifications, role-specific replay keys, ten-row administrator history and
private database privileges. Facebook and Instagram applications without either
URL or logo submit, review, invite and activate in both Hulhumalé phases. Invitation
and identity-directory transports are test doubles; no real Clerk users or grants
were changed by QA. All disposable schemas were removed.

ESLint, whitespace checks and the final single-worker production build (including
TypeScript) pass after the UI retry controls were completed.

Actual client components were checked with fictional transports at 1280px and
320/390px phone widths: administrator grant/removal confirmation, ten-row history,
Admin ↔ Partner and Admin ↔ Rider selection, hidden management navigation for an
ordinary admin, optional-field submission with no file included, no-logo review
initials, and recovery from an intentionally failed administrator-list request.
The workspace selector and removal dialog fit narrow phones; the desktop sidebar
fits 720px height without scrolling. These checks replace Clerk and Next's
transition wrapper and do not establish real signed-in sessions or hosted motion.

Read-only Prisma status confirms two pending live migrations: origin pricing/COD
retirement and `20261017010000_admin_access_optional_partner_assets`. Neither was
applied. No commit, push or hosted deployment was performed. Follow the coordinated
[release steps](origin-pricing-and-rider-jobs.md#release-steps) and
[admin access guide](admin-access-and-workspaces.md) before publishing this code.

## Operating locations, rider jobs and recipient-payment retirement — 17 October 2026

The updated implementation passes 90 unit tests, 77 disposable-schema delivery
workflow checks, two historical financial-retirement checks and two historical
paid-invoice migration checks. The full route matrix, custom destinations,
immutable quotes, competing rider claims, explicit physical pickup, private
partner data, delivered-only invoices and verified payment history are exercised.
Temporary test schemas are removed. No operational live records were changed.

Actual client components with fictional transports were checked at 320, 390 and
1440 pixels. The checks cover the sign-in redirect/continuation, application
location choices, route-aware package quote, rider claim/physical pickup separation,
admin location changes, rate/destination form submissions and ten-row pagination.
The fixture replaces Clerk and the Next transition wrapper; it does not establish
live authentication or hosted animation acceptance. ESLint and the final
one-worker production build include TypeScript verification.

Migration `20261017000000_origin_pricing_retire_cod` is prepared and tested, but
**not applied to the live Supabase database**. The later admin-access/optional-assets
migration is also pending. They must be released together with the updated site:
the old published code reads the retired columns. No commit, push or deployment
was performed. See [release steps](origin-pricing-and-rider-jobs.md#release-steps).
All sections below describe earlier work and may include subsequently retired
features; they are historical verification, not the current operating scope.


## Paid invoice history and iGO earnings — 17 October 2026

91 unit tests, the complete 80-check disposable-schema delivery integration suite,
ESLint and the one-worker production build (including TypeScript) pass. A separate
eight-check settlement run also verifies the admin earnings total stays unchanged
for pending evidence, increases only by partially confirmed amounts and includes
the remaining balance only after full confirmation. Two historical migration
checks pass with payments created before the new migration.

Migration `20261016090000_paid_invoice_history` was applied to the configured
Supabase database. Read-only verification reconciled both existing paid copies,
the invoice history and the received-fee earnings total against verified
allocations. All three new tables have RLS enabled and deny public client reads.
No operational payment or notification was created by verification. The migration
backfilled paid documents and history for existing records, without changing debt.

Two interrupted verification processes were stopped after the connection outage;
their abandoned temporary schemas were removed. Fresh checks completed with
connection/query limits. A final read-only check found no remaining QA schemas.

Actual client components with fictional API transport exercise pending status,
opening payment verification from an invoice, full confirmation, paid-copy
availability, sending once, disabled sent controls, complete ten-row history,
partner read-only controls and the admin-only earnings card. Dialogs, print views
and overview were checked at 320/390/1440px. Paid printing includes all twelve
fixture package lines and twelve verified payments while each screen table shows
at most ten. The earnings card displays verified fees, independently of partner
COD or outstanding debt. No signed-in Clerk browser session or bank API was used
for these component checks.

The rebuilt local preview is running. Anonymous paid-invoice print requests
redirect to the correct portal sign-in, and invoice history/payment APIs return
401. No commit, push or public deployment was performed; the user publishes
through VS Code.

## Partner delivery history and manual invoicing — 16 October 2026

87 unit tests pass. The final one-worker production build, its TypeScript check,
ESLint and whitespace checks pass. The existing 61 delivery integration checks
passed during the extended run; after correcting a new test's notification
baseline, all 11 new invoice checks passed in a separate disposable-schema run
(`npm run delivery:integration -- --partner-invoices`). All disposable schemas
used for these checks were removed. No operational invoice, payment or notification
was created by QA.

The new checks exercise ten-row partner history, whole-history eligible totals,
stale preview rejection, admin-only creation/sending, partner-scoped invoice and
print data, same-key replay, concurrent different-key issuance, one notification
per send, immutable/private send records, later daily billing, partial payment
verification and a concurrent automatic/manual invoice race. Migration
`20261016080000_partner_manual_invoices` was applied successfully to the configured
Supabase database.

Actual client components were exercised with fictional API fixtures: history
icon, search focus, pagination, create → review → send, disabled sent button,
return to history and invoice history. Dialogs fit 320/390/1440px widths. Screen
documents show ten packages and print media includes all twelve fixture lines.
These are component checks, not a signed-in Clerk browser workflow.

The final running local website was checked anonymously at 320/390/1440px:
partner sign-in and rider signup are visible and within the viewport, the navbar
partner signup button is removed, and both home-page partner signup CTAs remain.
Private invoice print routes redirect to their own portal sign-in; history,
invoice detail and filtered invoice APIs return 401 without authentication.

No Git commit, push or deployment was performed. Changes are ready for the user
to commit and push through VS Code. This section describes the new Phase 1 work;
older verification entries below retain their original scope and dates.

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

## Softer splash and native Google Maps demo — 7 October 2026

Replaced the full yellow splash with pearl/ivory, static pale-yellow reflections
and a frosted frame around the unchanged logo. Android light/dark startup
backgrounds and system bars, including Android 12+, use the same pearl color;
iOS launch background matches. A 390 × 844 Flutter capture with loaded Roboto
fonts and production shadow effects was visually inspected and saved as
`docs/previews/soft-glass-splash.png`. The temporary capture harness was removed
and the review gallery points to this new image.

Added **iGO Android APK - Google Maps demo** to Codemagic, retaining the keyless
preview and connected account workflows. It imports `igo_mobile`, requires the
restricted Android Maps key, accepts an optional HTTPS backend URL, and embeds
only public settings. Clerk/bank credentials are not needed for this demo build.
All three workflows retain the verified absolute APK download path. The existing
optional stable debug certificate and fingerprint output are included.

Saved-endpoint maps now fit single/same-point/cross-island jobs, limit camera
browsing to the two-island region and offer a fit control. The rider panel reserves
padding for attribution and controls. Invalid/out-of-area endpoints are not plotted.
No rider marker, GPS collection or in-app navigation route was added. Default Google
landmark labels remain; authenticated automatic address search is still the separate
backend Places flow, while shared demo orders retain fictional fixed entrances.

Final Flutter analysis found no issues; all **39 mobile tests** passed sequentially.
New coverage checks cross-island/same-point/invalid endpoint fitting, area overviews,
rider map padding, splash navigation/timer disposal and enlarged accessibility text.
All workflow shell/Python scripts parse; simulated CI settings tests reject missing
keys and insecure URLs and confirm public-only configuration. Native launch XML and
storyboard files parse, and removed Android GPS permissions were checked.

No Google Maps/Places key is configured in local settings, no provider request was
made, and native tile authorization/rendering remains unverified. No APK or iOS
binary was built locally; cold-start, key restrictions and platform composition
require the Codemagic build and device check described in `google-maps-setup.md`.
No backend schema or service changed. No Git commit or push was made; the user will
commit and push these changes manually.


## Supabase menu food photos — 8 October 2026

Approved restaurants can choose gallery images, crop/pinch/pan, rotate, replace and
remove one cover photo per item. Changes apply only after saving. Customer and
restaurant menu cards share consistently fitted thumbnails; failed loads have a
placeholder. Failed uploads do not submit the menu edit, save retries reuse a
staged image, and cancelling discards only newly staged, unattached files. Stable
new-item draft IDs prevent duplicate item creation on retry. The standalone design
preview keeps its photo changes local; admin-created shared demos use their own
Storage ownership and shared customer menus. Shared demo catalog responses now
include the restaurant's open/closed status required by the customer cart UI.

Migration eight, `20261007020000_menu_images`, was applied successfully to the current
Supabase development project. MenuImage has RLS/no anon/authenticated grants. The
public igo-menu-images bucket accepts only WebP with a 2 MiB object limit;
restrictive policies deny direct client operations on both bucket and objects.
All writes pass through approved Clerk restaurant or isolated demo-session APIs.
The private backend supports new sb_secret_ keys and legacy service-role JWTs.
Mobile bundles contain neither. The two public derivatives are square WebP at up
to 1024/256 pixels, with EXIF/GPS stripped; oversized, small, vector, malformed and
unsupported files are rejected. Processing/quota/pending-upload limits are bounded.

All **45 backend tests** and **45 sequential Flutter tests** passed. Photo tests
cover geometry/rotation, validation, binary uploads, staged save retries, cancelled
edits, delayed removal, upload failure, role isolation and shared demo menus.
`photos:verify` passed against the real Supabase database using rolled-back fixtures
and mocked Storage HTTP. It exercised actual shared demo route handlers, restaurant
upload/customer read/remove, approval checks, cross-owner and real/demo isolation,
atomic photo replacements, item removal, quotas, stale/orphan collection and bucket
security. No real Storage objects, accounts or menu changes were retained.

Flutter analysis found no issues; backend ESLint and TypeScript passed. The Next.js
production build passed with one build worker. One sandbox build could not parse
TypeScript configuration; the unsandboxed build succeeded. Gallery picker native
behavior, iOS photo permission and actual Storage authorization remain device/key
checks. No APK or iOS binary was built locally, and no Google/BML call was made.

Three 390 × 844 Flutter captures with loaded fonts/images and production shadow
settings were visually inspected: menu-photo-editor.png, menu-photo-crop.png and
menu-photo-tile.png. The final captures use the IgoApp theme. Temporary rendering
scripts were removed; the gallery includes the updated photo controls.

SUPABASE_URL and the new SUPABASE_SECRET_KEY are now configured in the ignored
backend environment. `photos:verify-storage` passed against real Supabase Storage
through the actual shared-demo backend handlers: three generated uploads, public
1024/480-pixel square covers and 256-pixel thumbnails, WebP output, EXIF removal,
customer menu visibility, replacement/removal and menu deletion. Storage metadata
confirmed that old files were removed. Its isolated 30-minute demo session, all
photo records and all test objects were cleaned up; real accounts/orders/menus
were not changed. The repeatable verification script logs no keys or project
URLs. TypeScript and the script's ESLint check passed.

Deployed cron authorization and native gallery selection are still pending.
CRON_SECRET is not configured locally; configure and verify the deployed cleanup
schedule when deploying the backend. No deployed/native integration is claimed
by the direct-handler test. docs/menu-images-setup.md gives the exact key steps,
public-content scope, cleanup schedule and checks. Legal drafts now describe public
menu photos and image rights; the default draft policy version is draft-2026-10-08.
Business placeholders and publication gates remain. No Git commit, push or public
deployment was performed; the user will commit and push through VS Code.

## Phase 1 rider website — 16 October 2026

Implemented `/rider/join`, `/rider/sign-in` and a separate responsive `/rider`
workspace using the existing Clerk identities and approved DeliveryAccount role.
The home navigation links to rider registration. Admin approval, assignment,
explicit physical pickup, COD-confirmed delivery, own delivery history, cash and
notifications use the persistent delivery backend. Collections are grouped by
partner within each page and all lists are capped at ten packages.

The additive `20261016060000_rider_push` migration was applied to the configured
Supabase database. All 20 delivery tables have RLS enabled; public API roles have
no table privileges. Push subscriptions are bound to approved riders, and a
durable transactional queue uses leased claims, bounded sends, backoff and
expired-subscription cleanup. Lock-screen payloads omit customer information.

All **82 unit tests** and **56 isolated database integration checks** passed.
The latter create and remove a disposable schema and use test push senders, not
real browser-provider endpoints. Checks cover approvals, cross-rider access,
ten-item pagination, assignment replay, concurrent push claims, transient errors,
expired subscriptions, abandoned leases, explicit pickup, COD confirmation,
Clerk identity attribution, repeated delivery completion and suspended accounts.
ESLint, TypeScript and the production build passed. The production dependency
audit reported no vulnerabilities.

Anonymous browser checks passed at 320, 390 and 1440 pixels: visible home rider
link, navigation to Clerk registration, public rider privacy notice, rider
workspace redirect to rider sign-in, API rejection, unsigned scheduler rejection,
service-worker delivery and manifest availability. Registration was visually
inspected at 390 pixels. These were public/anonymous checks; an authenticated
rider browser session and real-device background notification display have not
been verified.

VAPID and a dedicated scheduler secret were generated into the ignored local
environment without printing key values. Supabase pg_net was enabled. The
scheduler's actual SQL, Vault access and matching database/server HMAC signatures
were verified in a rolled-back transaction; no HTTP request was sent and no retry
job was installed. The existing invoice schedule remains separate.

The Google Maps Embed integration uses saved pickup/destination addresses and
loads on demand. Keyless Google Maps directions links are implemented; boat
deliveries use a place map. A restricted web Embed key, real-address map checks,
production push environment variables, deployment and installation of the retry
schedule remain external setup steps. There is no live GPS tracking. See
`docs/rider-web-setup.md` for credentials, setup and device checks. No Git commit,
push or public deployment was performed.

## COD payout receipts — 16 October 2026

Partners see **Received** for payouts that admin sees as **Remitted to partner**.
Both have a bill button in the COD table. The receipt modal shows the immutable
payout reference, timestamps, issuer/partner profile, amount and included package
lines, with ten rows per page. The authenticated print view includes every line
and supports browser printing / Save as PDF. Admin receives the receipt preview
after saving a payout, and the partner receives a private in-app notice.

The additive `20261016070000_cod_payout_receipts` migration was applied. A deferred
database trigger issues one frozen receipt per payout at commit; existing payouts
were backfilled without changing their amounts or invoice balances. A real,
read-only verification confirmed that the configured database's existing payout
has a reconciled receipt and that receipt tables/functions deny public API roles.

All **85 unit tests** and **61 disposable-schema database checks** passed. New
checks cover partner-specific wording, reconciliation, atomic issuance, frozen
profile details, immutable documents, cross-tenant/role rejection, concurrent
retries and full print data versus ten-row screen pages. Lint, TypeScript and the
single-worker production build passed.

The actual receipt component was rendered with fictional fixture data and checked
at 320, 390 and 1440 pixels. The partner's Received label, ten screen rows, twelve
print rows, hidden print controls and mobile layout were verified. These component
checks do not claim a signed-in admin/partner browser session was tested.
Anonymous checks also confirmed that private receipt pages redirect to their
respective admin/partner sign-in and the receipt API returns 401 without data.

Receipts are generated from iGO's recorded payouts; no bank API or bank-issued
proof upload was added. Setup and scope are in `docs/cod-payout-receipts.md`.
No Git commit, push or deployment was performed.
