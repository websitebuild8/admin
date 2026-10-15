# Phase 1 deployment and launch checklist

Updated 16 October 2026. See [the operating specification](phase-one-delivery.md).
This is the seller-delivery product. The preserved restaurant/mobile product is
Phase 2 and has different payment rules; its older launch guides do not override
this document.

## What has actually been verified

- Five additive delivery migrations applied to the configured Supabase database.
  Existing restaurant/mobile tables were preserved. All 17 new delivery tables
  have RLS enabled and public API roles have no access.
- 34 integration checks passed against the real PostgreSQL server in an isolated,
  randomly named QA schema. The schema and all fixtures were removed afterwards.
  They cover explicit pickup, concurrent operations, delivered-only billing,
  empty cycles, unpaid carryover, payment verification/reconciliation, tenant
  isolation, import replay, pagination and immutable history.
- 54 automated tests passed, including the retained Phase 2 tests and nine new
  delivery validation/import tests. Production dependency audit: zero known
  advisories at verification time. Development tools still have a transitive
  braces advisory with no patch; do not run generators/lint on untrusted patterns.
- Private `igo-delivery-receipts` bucket created. A temporary upload was denied
  anonymous access, readable through a signed URL, then removed.
- Native PostgreSQL cron job `igo-delivery-invoices` installed, active, every
  five minutes. Scheduled executions at 00:50 and 00:55 Maldives Time were
  recorded as succeeded. Each partner still receives one daily cycle at their
  own cutoff, default 18:00 Maldives Time. Monitor execution history after launch.
- Final production build and lint passed. Public landing page checked at desktop
  (1440 px) and phone (390 px) widths without horizontal overflow. Clerk's live
  sign-in form loaded; unauthenticated delivery-data requests returned HTTP 401.
- Signed-in administrator browser checks passed with the actual Clerk session:
  dashboard, package-registration form, partner/driver management, invoice history,
  private settings and live scheduler status. Mobile navigation opened and closed
  correctly; the admin dashboard fit a 390 px phone viewport without horizontal
  overflow. Desktop sidebar fit without scrolling at both 1440 × 900 and 1280 × 720 viewports.
- The authenticated Excel-template download matched the shipped template byte for
  byte. Browser console inspection found no application errors during these checks.
  The expected development-instance warning remains until production Clerk setup.
- Readable delivery-zone labels and their saved enum values were verified after
  the final rebuild. All paginated lists now use a unique ordering tie-breaker.
- No public deployment, live bank transfer, approved legal policy, or partner/driver
  signed-in browser walkthrough is established merely by these checks.

## Environment

Put values in ignored `apps/admin/.env.local` for development and in the hosting
provider's private environment settings for production. Never paste credentials
in a public repository, screenshot, chat, Flutter build or browser code.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser key for the correct Clerk instance |
| `CLERK_SECRET_KEY` | Server Clerk key from that same instance |
| `ADMIN_CLERK_USER_IDS` | Comma-separated explicit administrator user IDs |
| `DATABASE_URL` | Supabase PostgreSQL transaction-pooler URL for runtime |
| `DIRECT_URL` | Direct/session-pooler URL, only needed for migration/setup tools |
| `SUPABASE_URL` | HTTPS project URL |
| `SUPABASE_SECRET_KEY` | Server-only Storage secret; legacy service-role key is also supported |
| `IGO_DEMO_MODE` | `false` for deployed use |

Keep the existing verified public database CA at
`apps/admin/certs/supabase-root.crt`. Connection helpers validate TLS; do not turn
certificate validation off. Existing optional Phase 2 settings remain separate.
No Google Maps, BML, Facebook or Instagram API key is required for Phase 1.

Clerk handles identity only. Enable the sign-up methods intended for partner/driver
applications. Becoming a Clerk user never grants administrator access. Database
approval is required before a partner or driver can operate. Use MFA for admin
accounts, review the allowlist, and test a non-admin login. Configure the final
production domain and redirects in Clerk. Check `/join` and `/delivery/sign-in`
after deploying; changing keys requires a rebuild.

## Commands

Run these from `apps/admin` with Node 22 available. Dependency installation and
the Next build should run sequentially on this laptop; the Next build uses one
worker. Do not build Flutter or Android for this phase.

```sh
npm ci
npm run db:deploy
npm test
npm run lint
npm run build
npm run delivery:verify
```

For a fresh Supabase project, after enabling Supabase Cron/pg_cron:

```sh
npm run delivery:storage
npm run delivery:cron
npm run delivery:verify
```

The Storage check uploads/removes one temporary probe. Invoice verification calls
the real due-cycle processor, so it can issue genuinely due invoices. The
integration command below creates and drops ONLY a random QA schema, calls the
real application services there and never uses public partner fixtures:

```sh
npm run delivery:integration
```

## Netlify

Use the existing repository and root `netlify.toml`. Base: `apps/admin`; build:
`npm run build`; publish: `.next`. **Enable the current Next.js runtime/adapter.**
Do not disable framework detection or publish `.next` as ordinary static files.
The build log must show the Next adapter and server functions; a successful file
upload with zero functions is insufficient for this application. Do not add a
SPA catch-all rewrite. See the [Netlify Next.js documentation](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

Set environment variables for Builds AND Functions. Use separate development
credentials/database for untrusted preview branches. The public CA and template
are included in Next output tracing. The native database invoice job does not
need a Netlify HTTP scheduler or a cron secret. Keep existing unrelated Supabase
jobs; do not configure duplicate invoice schedules elsewhere.

The user will commit and push manually from VS Code. A Git push or local build
is not proof of deployment. Verify the published HTTPS domain, actual API JSON,
Clerk redirects and private Storage reads on the hosted runtime.

## First operating setup

1. Sign in with an explicitly allowlisted admin ID; open `/delivery/settings`.
2. Enter the actual registered business identity, contact details and receiving
   bank beneficiary. They intentionally start blank, not as fictional values.
3. Confirm route fees and partner cutoffs. Fees freeze at package registration;
   later edits affect future packages only.
4. Apply with a separate partner account; inspect page/pickup/contact details and
   approve it. Apply and approve a separate driver. Registration alone grants no
   operating role. Check rejected and suspended accounts too.
5. Use clearly identified test parcels with permission from the account owners.
   Register/import, assign, open collection list, tick a package, then explicitly
   confirm physical receipt. Ensure unselected packages remain registered.
6. Complete a delivery with a COD acknowledgement where applicable. Check driver
   attribution, UTC+5 timestamps, partner notification and admin list.
7. At cutoff, verify one invoice containing delivered packages only. Check an
   older unpaid invoice remains outstanding after the next cycle. Use the job
   history and Settings scheduler health; a manual run is not a scheduled run.
8. Submit a test receipt only for a real, explicitly authorized test transfer.
   Confirm pending evidence leaves debt unchanged. Verify the bank record before
   admin confirmation. Test partial/rejected evidence and duplicate requests.
9. Record COD handover only when iGO receives cash. Record a partner payout only
   after an actual authorized payout. Neither action reduces delivery invoices.
   These are accounting records; this software does not initiate bank transfers.
10. On a phone, check driver collection/delivery cards, checkbox targets, dialogs,
    navigation and connection errors. Check desktop admin tables and pagination.

## Required business and release decisions

- [ ] Registered legal name/number/address, support contact and receiving account.
- [ ] Approved partner service agreement, driver operating agreement, privacy
  notice and recipient-data handling. Current mobile/food policy drafts are not
  Phase 1 seller-delivery agreements and must not be reused without review.
- [ ] Confirm GST/tax applicability, tax-inclusive/exclusive rate presentation,
  invoice requirements and any statutory retention with a Maldives adviser.
  Current invoices record delivery charges; they do not calculate GST or claim
  to be tax invoices. No fictional tax registration is displayed.
- [ ] Define prohibited/restricted goods, package limits, boat handoff responsibility,
  damage/loss claims, failed deliveries/returns, fee disputes and support response.
  This initial workflow supports registered → picked up → delivered and cancellation
  before pickup. It does not invent a delivery-failure or refund ledger.
- [ ] Agree COD cash controls, driver reconciliation, bank payout authorization,
  maximum cash exposure and separate delivery debt collection. No fee netting.
- [ ] Choose database backup/restore arrangements for the actual Supabase plan;
  perform a restore drill. Choose recovery targets, alerts and incident owners.
- [ ] Decide retention for recipient addresses/phones, receipts, audit and financial
  evidence. Unsubmitted receipt uploads currently remain private; there is no
  automatic retention/deletion job for them. Review them operationally until an
  approved retention policy is implemented. Do not delete financial history.
- [ ] Confirm available hosting/database/Storage quotas and domain costs. Free
  plans are not a capacity guarantee; monitor errors, storage and scheduler runs.
- [x] Complete actual Clerk admin sign-in and admin browser acceptance checks.
- [ ] Register separate partner and driver accounts, approve them and complete
  their signed-in browser walkthroughs. No public test accounts were silently added.
- [ ] Complete hosted Netlify runtime and deployment acceptance checks.

## Operational boundaries

Notifications are a private in-app inbox, refreshed while the page is visible.
Email, SMS, WhatsApp, background push and Facebook/Instagram order ingestion are
not integrated. Drivers use written destination/pickup instructions; this phase
does not silently add paid geocoding or live rider tracking. COD is the full
specified amount per parcel; partial parcel cash collection is not supported.
Bank verification and payouts are manual, auditable admin records.

Invoices are immutable: corrections need an agreed credit-note/adjustment workflow
before being supported in software. Do not edit issued SQL records to compensate
for mistakes. Unpaid balances are derived from invoice totals less confirmed
allocations. Pending delivery charges, pending receipts and COD never count as
settled invoices. Maintain a support process for exceptions before commercial use.
