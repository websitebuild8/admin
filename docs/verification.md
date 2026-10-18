# Delivery platform verification

## Appearance button alignment and logo placement — 19 October 2026

Moved the theme selector beside the logo on the homepage, partner application,
Admin/Partner sidebar and Rider header. On mobile, Admin/Partner use the logo row
inside their navigation drawer. The shared trigger now explicitly centers its
18-pixel icon inside a non-shrinking 44-pixel square, instead of inheriting the
select component's spacing. Small-screen brand/navigation groups remain separate.

The production build and lint pass. Browser checks on the actual local site at
320, 390, 768 and 1440 pixels confirm zero icon-center offset, the intended 8/12px
logo spacing, no header overlap and no horizontal page overflow on the homepage
and authenticated Rider workspace. The authenticated Admin sidebar and 320px
navigation drawer were checked too; selecting Light from the drawer works.
This is a presentation-only change; database tests were not rerun.

## Mark all read and clear — 19 October 2026

Added one shared clear-all action to Admin, Partner and Rider notification pages.
It deletes the current recipient/workspace inbox across all pages and dates,
including read messages and shared ACCOUNT notices. Server-selected scope,
rechecked privileges, serializable/idempotent commands, a fixed request boundary,
audit counts and cascaded push-job deletion protect the operation. Invoice dispatch
links are nullable with narrowly constrained database cleanup; sent history,
payment proof and invoice debt remain unchanged.

All 27 targeted notification/invoice-history checks and eight super-admin deletion
regression checks pass in disposable schemas, which were removed. All 68 unit
tests, lint and the final production build pass. Browser
checks use fictional in-memory messages in the real portal components: the single
button clears the list, unread count and pagination for all three workspaces;
Partner clearing also works by keyboard in dark mode. Narrow mobile layouts were
checked at 320 and 390 pixels. No operational inbox was cleared.

The one pending migration `20261019010000_clear_notifications` was applied to the
configured Supabase database successfully; no other migration was pending.
Source changes remain for the owner's manual commit/push and Netlify deployment.
See [notification behavior and release details](notification-clearing.md).

## Shared Light / Dark / System appearance — 19 October 2026

Added a shared, persistent appearance control to the homepage, Admin, Partner
and Rider headers, with a fallback for sign-in, onboarding and utility pages.
Charcoal surfaces, soft text, restrained yellow accents and semantic status
colors cover feature styles, shadcn controls, portalled dialogs, toasts and Clerk
UI. Native controls and mobile browser colors follow the selected appearance.
Theme preferences stay in the browser; role, billing and delivery logic are
unchanged. Existing light colors and print declarations are preserved.

Actual local production Admin, Partner and Rider screens, a package-details
dialog and the Clerk account menu were checked with the existing signed-in
session. Reload persistence, cross-tab synchronization and the browser's System
preference were verified. Registration and invoice styling were also checked
with fictional preview data and substituted route/navigation wrappers; no form
was submitted. Twelve shared text-color pairs pass the 4.5:1 target, with a
4.91:1 minimum. This is not a complete accessibility audit. Changed-source lint,
whitespace checks and the production build including TypeScript pass. No
database integration suite or actual print export was run for this visual change.

See [appearance operation and verification](dark-mode.md). Manual commit/push
and Netlify deployment remain with the owner; no deployment was performed here.

## Public delivery-rate card redesign — 19 October 2026

The rate section now gives all three origin cards the full content width, with
a separate headline and explanatory note. Frosted white cards use larger local
rate figures, smaller MVR labels, phase badges and aligned destination rows.
Existing database rates remain authoritative; no fee or billing rule changed.
There are no card icons, gradients, yellow rules or per-package captions.
The loading skeleton follows the new card structure.

Desktop uses three columns, tablet uses individual horizontal cards, and phone
uses stacked cards. The actual local production homepage was checked at 1440,
1024, 768, 390 and 320 pixels: no horizontal page/card/price-row overflow was
observed. Desktop and phone cards reset to pending outside the viewport and
return to shown on re-entry. The observer discovers cards inserted by streaming
without a timer or React updates on scroll. Reduced-motion settings retain the
existing readable, unanimated fallback. No browser console errors were recorded.

Changed-source ESLint, whitespace checks and the single-worker production build,
including TypeScript, pass. No database migration, credential change, automated
financial operation, Git commit/push or hosted deployment was performed. The
owner can commit/push through VS Code and let Netlify deploy the changes.

## Loading performance — 19 October 2026

Reduced repeated authorization, overview aggregates and recent-package relation
queries. Admin, Partner and Rider pages now supply authorized initial data
directly to their client components; matching payloads are not immediately
fetched again. Choices load on demand, optional panels/transports load lazily,
and public rate cards stream separately with a 60-second public-only cache.
Private financial and authorization data are not persistently cached.

Read-only profiling reduced the initial admin data path from 41 to 10 SQL
queries, and warm account lookup from 403 ms to 128–133 ms in the recorded
samples. These are database measurements from this machine, not a deployed
whole-page speed guarantee. Netlify remains in Ohio and Supabase in Seoul;
the user's free plan does not permit the proposed function-region change.
No upgrade, region change, schema migration or environment update is required.

All 68 retained unit tests, the complete 113-check workflow regression, six
focused performance correctness checks and the final ten-check dashboard/date
suite pass. The full regression started before the final recent-package join;
the final join was verified by the two focused suites. All disposable schemas
were removed; live operational records were not changed. Actual client
components with fictional transports show zero immediate repeat data requests
for matching Admin, Partner and Rider initial payloads, correct manual refresh
requests and on-demand choices. This does not establish hosted Clerk or hosted
navigation verification. ESLint, TypeScript and the final single-worker
production build pass. The source still needs the owner's manual commit/push
and Netlify deployment; no deployment was performed here.
The actual local production homepage also passed: main content rendered with
the rate skeleton first, followed by real database rates, using the normal Clerk
middleware. No authenticated hosted walkthrough was repeated.

See [loading performance](performance.md) for measurements, limitations,
official documentation sources and the hosted verification procedure.

## Retired platform removal — 19 October 2026

Removed the old restaurant dashboard, its admin/native/demo/dispatch/menu-photo
APIs, the retired Flutter project and build workflow, obsolete shared contracts,
old components/styles/assets, food checkout/demo/Places services and their tests.
Private logo/receipt transport now belongs to the current delivery platform.
Current request limits use the DeliveryRequestBucket model mapped to the shared
physical MapUsageBucket table, preserving compatibility with deployed forms.
Its retired Google counters are removed. Historical Prisma migrations remain
immutable so existing and new databases can reach the final current schema.

Netlify was checked after the user's manual push: current homepage/logo returned
200 and the removed old logo returned 404. The hosted landing and partner form
rendered the current content. Only then was the cleanup migration applied live.
It removed 21 obsolete tables and the old Google prune function/job and Storage
policies. The old empty food-image bucket was removed through the Storage API;
private partner-logo and delivery-receipt buckets remain. All 27 current tables
have RLS; none expose SELECT/INSERT/UPDATE/DELETE to anon/authenticated. Invoice
and expired-request cleanup schedules are active. Rider push had no installed
job beforehand and no background delivery activation is claimed.

The immediate private snapshot's fingerprints match every current business table
and delivery request counter exactly after migration. The only retired persisted
record was a fictional demo session; no current account, partner, package,
invoice, payment, history or audit record was changed by the cleanup. A verified
owner-only data snapshot is held outside Git under `/tmp`; it is not a full
database recovery backup or a completed restore drill.

Verification: all 68 retained unit tests pass; the complete 113-check workflow
regression passes; two final-mapping request-limit checks prove atomic concurrent
limiting and identity isolation; a separate full-history migration test proves
retired restaurant data removal, current delivered/invoiced parcel preservation,
RLS/role denial, request-counter preservation, replay and unchanged real cron
jobs. All disposable schemas were removed. The workflow regression began before
the final physical-table compatibility adjustment; that final adjustment was
covered by the dedicated migration and two request-limit checks. Lint,
TypeScript and the final single-worker production build pass. Its route manifest
contains no retired APIs or dashboard routes. No authenticated hosted walkthrough
was repeated. Local preview hit a Clerk development-host proxy connection error
and was stopped; hosted public rendering passed.

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
