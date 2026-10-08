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
