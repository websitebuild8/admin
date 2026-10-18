# Retired platform removal

The seller-delivery web platform is the only application retained in this
repository. Admin (`/delivery`), Partner (`/partner`), Rider (`/rider`), their
applications, invoice documents, private uploads and public landing page remain.

## Removed source

- Restaurant-era `/legacy` screens, admin/mobile/demo APIs, dispatch and food-photo maintenance endpoints.
- Native Flutter project, mobile contracts, Codemagic workflow, old food-order demo/payment code and unused dependencies.
- Old dashboard styles, components, sample data, image assets and obsolete product/setup documentation.
- The navigation entry for the retired administration area and its demo-mode authentication bypass.

The old `/sign-in` bookmark redirects to `/delivery/sign-in`. Private logo and
receipt transport now lives in `src/lib/delivery/storage-client.ts`. Current
Google Maps directions and optional embeds remain; Places search and food-order
tracking do not.

## Database migration

`20261019000000_remove_legacy_platform` drops an explicit list of 21 retired
tables, including old food orders, restaurant/rider profiles, demo sessions,
checkout/payment attempts and unused retired cash archives. It uses a transaction
without cascading deletion into unexpected dependencies. It does not delete
current delivery accounts, partners, parcels, invoices, verified payments,
invoice documents, commands, notifications or audit history.

One table remains in active use for form spam protection. Its Prisma model is
`DeliveryRequestBucket`; its physical name stays `MapUsageBucket` to keep the
published form endpoints compatible during deployment. Only `delivery:` request
counters survive. It has RLS and no public API-role grants. The new
`igo-delivery-request-prune` job replaces obsolete Google-content pruning;
existing invoice and rider-push jobs are preserved.

The empty retired `igo-menu-images` bucket is removed separately through the
Storage API. Current private `igo-partner-logos` and `igo-delivery-receipts`
buckets are preserved. The retirement tool refuses to remove a nonempty old
bucket without an explicit file-backup process. Shared Clerk users are retained.

## Verified release — 19 October 2026

The updated Netlify site was observed before the live migration: homepage and
current brand asset returned 200, the removed logo returned 404, and the hosted
partner application rendered its current fields. The cleanup migration was then
applied successfully to the configured Supabase database. All 21 retired tables
are absent. Current business-table and delivery request-counter fingerprints
match the immediate pre-migration snapshot exactly.

The empty food-image bucket was removed and its absence verified. The two
current buckets remain private. All 27 current application tables (26 business
tables plus the request-limit table) have RLS and no public API-role grants.
Invoice and delivery request-cleanup jobs are active; the retired map job is
absent. The rider-push job was not installed before this cleanup and was not
silently enabled by it. No operational invoice, payment, package or account was
created, edited or deleted during these checks.

68 current-platform unit tests, the 113-check workflow regression, two focused
request-limit checks, the isolated full-migration retirement check, source lint,
TypeScript and the production build pass. The final compatibility mapping was
verified separately by the migration and request-limit checks. All test schemas
were removed. No authenticated hosted browser walkthrough was repeated; the
hosted public landing/application pages were checked. A local preview attempt
hit a Clerk development-host proxy connection error and was stopped; hosted
public checks succeeded. This is not a new claim of full launch acceptance.

## Release sequence

1. Run the unit tests, production build, complete integration suite and the
   isolated full-history migration check below. See `verification.md` for actual
   results and distinguish them from pending steps.
2. Save a private data snapshot with `retire-legacy-data.ts backup`. Its directory
   is outside Git, with owner-only permissions. It includes retired rows and
   fingerprints of current table contents. It is not a complete, tested disaster
   recovery backup; arrange that separately for production.
3. Commit/push manually in VS Code and publish the updated Netlify site. Verify
   it is the new version before proceeding: old deployed deletion buttons still
   query retired archive tables. The local build does not deploy the site.
4. Apply `npm run db:deploy` to the correct database. Verify the current-table
   fingerprints against the private snapshot; review any concurrent legitimate
   changes before claiming byte-for-byte preservation.
5. Remove the empty old bucket with `retire-legacy-data.ts storage`. Verify the
   two current private buckets remain, and check live role-scoped operations.

Run from `apps/admin` with configured private environment values:

```sh
node --import tsx scripts/verify-legacy-retirement.ts
npm run delivery:integration -- --request-limits
node --import tsx scripts/retire-legacy-data.ts backup
# Publish the updated application before applying the retirement migration.
npm run db:deploy
node --import tsx scripts/retire-legacy-data.ts verify /PRIVATE/BACKUP/DIRECTORY
node --import tsx scripts/retire-legacy-data.ts storage
```

The migration test creates/removes a disposable schema, seeds retired restaurant
data and a current delivered/invoiced parcel, and checks preservation, permissions,
counter migration and replay. It deliberately excludes historical migrations'
global Storage/cron installation from QA execution and confirms live scheduler
jobs are unchanged. No operational live packages are created by this check.

Keep applied Prisma migrations and `_prisma_migrations`: they are immutable
database history needed to upgrade existing databases and rebuild fresh ones.
Their historical table names are not active application code. The final schema
contains current delivery data only, plus this ledger and provider system schemas.

Unused deployment values can be removed after publishing: `IGO_DEMO_MODE`, old
`IGO_POLICY_*`/`IGO_POLICIES_APPROVED`, `IGO_MAP_*`, `GOOGLE_PLACES_API_KEY`,
`CRON_SECRET` and native/mobile-only build variables. Keep all current Clerk,
database, Storage, `DELIVERY_PUBLIC_URL`, `GOOGLE_MAPS_EMBED_API_KEY` and
`WEB_PUSH_*`/`PUSH_CRON_SECRET` settings. Do not delete shared credentials or
current scheduler Vault values based only on an old label.
