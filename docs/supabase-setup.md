# Supabase setup for the delivery platform

Clerk handles identity. The trusted Next.js backend uses Prisma/pg for PostgreSQL
and the private Supabase Storage API for partner logos and bank receipt images.
No public database key, Supabase Auth replacement or food-photo bucket is needed.

## Connections

1. Use separate development and production projects. Save passwords privately.
2. Disable the Data API for this server-only integration. Tables have RLS and no
   grants for `anon`/`authenticated`; no direct client policies are created.
3. From Supabase Connect, use the transaction pooler (port 6543) for `DATABASE_URL`.
4. Use the session pooler (5432), or direct endpoint where supported, for
   `DIRECT_URL` used by migrations/setup. Do not migrate through transaction pooling.
5. Replace password placeholders entirely, including their square brackets.
   URL-encode special password characters; preserve the exact dashboard host/user.
6. Keep TLS enabled. The supplied public CA at `apps/admin/certs/supabase-root.crt`
   verifies the database. Never disable certificate checks.

Put actual values in ignored `apps/admin/.env.local` or private hosting settings.
Injected environment variables take precedence over local dotenv files.

```sh
cd apps/admin
npm run db:deploy
npm run delivery:storage
npm run delivery:logo-storage
```

Storage requires `SUPABASE_URL` (the project's HTTPS API origin) and a private
`SUPABASE_SECRET_KEY`, or supported service-role JWT `SUPABASE_SERVICE_ROLE_KEY`.
Only the server receives this key. Modern secret keys use the `apikey` header;
JWT service-role keys also use Authorization. Logo and receipt buckets remain
private and are read through authorized backend routes/signed receipt access.

## Scheduling

Enable Supabase Cron (`pg_cron`), then run `npm run delivery:cron`. This installs
only named invoice and expired-request cleanup jobs; it preserves unrelated jobs.
Optional rider background push has a separate signed HTTP job and Vault setup:
see [rider setup](rider-web-setup.md).

`npm run delivery:verify` checks security and invokes the live due-invoice processor;
it may issue genuinely due invoices. `npm run delivery:integration` instead tests
only a disposable schema and removes it afterwards. A successful manual run does
not prove future scheduled executions. Monitor cron run history and failures.

## Schema maintenance

The final public application schema contains only current delivery tables plus
Prisma's migration ledger. The shared physical table `MapUsageBucket` now
contains delivery request-limit counters only; its Prisma model is
`DeliveryRequestBucket`. Keeping this table name preserves the deployed form
endpoints while the source changes are released. [Legacy retirement](legacy-retirement.md) removes old
restaurant/mobile/demo tables and unused food-image storage. Keep all applied
migration files: fresh databases replay them and then apply retirement; existing
databases apply only pending migrations. Never use `db push`, reset or handwritten
SQL deletion in place of reviewed production migrations.

Choose and test a database/file backup and recovery process appropriate to the
actual Supabase plan before accepting real operations.
