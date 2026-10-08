# Supabase connection setup

Supabase PostgreSQL replaces Neon. Clerk remains responsible for identity; the
Next.js backend uses Prisma and the existing pg driver. No Supabase SDK, Auth
replacement or public database key is needed. Menu photos now use the Storage API
with a private backend secret key; see [food photo setup](menu-images-setup.md).

## Create the development database

1. Create a fresh project named `igo-development` at https://supabase.com/dashboard.
   Save its database password privately. Choose a region close to the eventual
   application server; keep production and development separate.
2. In API settings, disable the Data API before applying migrations. This app
   accesses Postgres through its own authenticated server APIs.
3. Open Connect. Copy the Transaction pooler connection string to `DATABASE_URL`
   in `apps/admin/.env.local` (port 6543).
4. Copy the Session pooler string to `DIRECT_URL` (port 5432). This supports IPv4
   development environments. The direct endpoint can instead be used where IPv6
   is available. Never use the transaction pooler for migrations.
5. Replace the password placeholder with the database password, URL-encoding
   special characters in the password. Copy the host and username exactly from
   the dashboard. Include `sslmode=require`; never disable TLS verification in code.
6. Leave `IGO_DEMO_MODE=true` until migration and Clerk settings are ready.

```dotenv
# Illustrative only: copy your actual dashboard URLs, do not use these values.
DATABASE_URL="postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:6543/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require"
```

The dashboard's default database owner can bootstrap development. Both connections
must target the same project/database. Production should use a dedicated server
database role with only the privileges required for operations; migration credentials
remain separate. The runtime role must support this server-only access model
(table ownership or BYPASSRLS); end-user authorization is enforced in our backend.
Do not hand this role or its password to a browser or mobile application.

## Apply migrations and activate

From `apps/admin`, run these sequentially:

```bash
npm run db:generate
npm run db:deploy
npm run db:status
```

Three migrations create the tables, add fulfilment fields, and enable row-level
security with no client policies on business tables. They revoke access from
Supabase's `anon` and `authenticated` roles. Existing migration history is preserved.
Do not use `db push` or reset a populated project. No demo rows are imported.

Configure Clerk keys and `ADMIN_CLERK_USER_IDS`, set `IGO_DEMO_MODE=false`, then
rebuild/restart. Verify administrator access, non-admin denial, database reads and
writes, and that customer/restaurant responses never contain rider coordinates.
Before production, verify RLS and concurrent rider acceptance against the database.

For Vercel, add the corresponding production environment variables and use a
separate production database. Local `.env.local` is ignored by Git and not deployed.
Keep the Data API disabled; enabling it later requires a deliberate policy review.
For the current Netlify demo deployment, follow [Netlify setup](netlify-deployment.md)
for app directories, private dashboard settings and Supabase-hosted schedules.

## Later features

Menu-photo Storage is connected separately using a public food-photo bucket and
server-authorized writes. Private verification-document storage is still a separate
feature and must use its own private bucket and access policies. Realtime needs authenticated
private channels and separate admin GPS versus participant status payloads.
If clients use these services directly, configure Supabase's Clerk third-party
integration and authorization policies first. The present app retains API polling.

## References

- https://supabase.com/docs/guides/database/prisma
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/third-party/overview

## Verified connection and certificate

The downloaded public Supabase Root 2021 CA is stored in
`apps/admin/certs/supabase-root.crt` (expires 26 April 2031). It contains no private
key or credentials. `src/lib/database-url.ts` adds the appropriate certificate
parameters for pg runtime connections and Prisma migration connections, preserving
certificate verification. Next.js tracing includes the certificate for deployment.
Run commands from `apps/admin`; deployment root must also be `apps/admin`.
If Supabase rotates its CA, download and verify the replacement from its dashboard.
Do not disable certificate verification to resolve trust errors.

On 3 October 2026 all three migrations were applied successfully. Both the session
and transaction pooler connections authenticated using the certificate. Prisma
read/create/update/delete checks passed in a rolled-back transaction. All ten
business tables have RLS enabled and no SELECT/INSERT/UPDATE/DELETE grants for
`anon` or `authenticated`. Demo mode remains enabled until the Clerk sign-in
activation step. Deployment certificate packaging and browser sign-in still need
end-to-end verification. Data API dashboard settings were not inspected.
