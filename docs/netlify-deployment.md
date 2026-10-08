# Deploy the iGO admin and mobile backend to Netlify

This guide deploys the existing Next.js application, including its backend APIs.
Supabase keeps the database and food photos, Clerk keeps identity, and Codemagic
keeps building the single Flutter app. Use this deployment for the current demo
and testing phase; business details/policies and real BML payments are unfinished.

## 1. Commit and push through VS Code

Commit the current application changes and the root `netlify.toml`, then push the
branch you want Netlify to build. The user manages commits/pushes manually.
Include the Prisma migration folders, package lock, source files and public
`apps/admin/certs/supabase-root.crt`. Do not commit `.env.local`, private keys,
database passwords, mobile signing keys or generated Prisma/build folders.

The root Netlify configuration selects the admin app; there is no root
`package.json`. It does not run migrations, create accounts or activate schedules.
`npm run build` already runs Prisma generation through its `prebuild` script.

## 2. Import the GitHub repository

At https://app.netlify.com/ choose the Free plan, then **Add new project → Import
an existing project → GitHub**. Authorize the repository and select
`websitebuild8/admin`. Select the branch you pushed, normally `main`.

Check these settings, even if Netlify auto-detects them:

| Field | Value |
| --- | --- |
| Framework | Next.js |
| Base directory | `apps/admin` |
| Package directory | Leave empty; the base already selects the package |
| Build command | `npm run build` |
| Publish directory | `.next`, relative to the base |
| Functions directory | Leave the default; the Next.js adapter generates functions |
| Node version | `22`, supplied by `netlify.toml` |

The root configuration overrides matching UI build settings. Netlify automatically
uses its maintained Next.js adapter; no manual adapter installation/version pin
is required. Do not choose manual drag-and-drop upload or add an SPA rewrite to
`index.html`: this app requires its server APIs and authentication.

## 3. Add private settings before building

Use **Environment variables** on the import screen, or later **Project
configuration → Environment variables**. Copy the values privately from your
ignored `apps/admin/.env.local`. Paste dashboard values without the wrapping
quotes used in dotenv files. Do not send these values in chat.

For the current demo, keep the existing Clerk development instance and Supabase
development project. Clerk development keys work with a Netlify preview domain;
the publishable/secret pair and approved admin IDs must belong to the same Clerk
instance. A real launch uses Clerk production configuration and a matching domain.

| Variable | Value/purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Existing Clerk public key |
| `CLERK_SECRET_KEY` | Matching private Clerk secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `ADMIN_CLERK_USER_IDS` | Existing allowlisted Clerk user IDs, comma separated |
| `DATABASE_URL` | Existing Supabase transaction pooler URL, port 6543 |
| `SUPABASE_URL` | Same project's HTTPS API URL |
| `SUPABASE_SECRET_KEY` | Existing private Storage server key |
| `IGO_DEMO_MODE` | `false` — retain admin authentication and enable shared demos |
| `IGO_POLICIES_APPROVED` | `false` — the policies remain drafts |
| `IGO_POLICY_VERSION` | `draft-2026-10-08` |
| `CRON_SECRET` | A new random private token, at least 32 characters |

Keep default **All scopes** so backend values are available to Functions as well
as Builds. For contextual values, use the **Production** deploy context for the
stable main site; this context is a hosting label and can use our development
services for this demo. Preview deployments should use separate development
settings if enabled. Do not give untrusted preview builds real production secrets.

Only the Clerk publishable key uses `NEXT_PUBLIC_`; database, Storage and scheduler
secrets must stay private. Supabase Auth is not replacing Clerk. Generate
`CRON_SECRET` privately with a password manager or `openssl rand -hex 32` and keep
the same value for the later Supabase schedule. Do not print it in build commands.

`DIRECT_URL` is not needed for the normal Netlify build; builds only generate
Prisma. The existing eight migrations are already applied to our current database.
For a different database, apply migrations deliberately using its direct/session
pooler settings and the existing `db:deploy` instructions before testing it.

Optional Google address search settings, if already configured: copy
`GOOGLE_PLACES_API_KEY`, `IGO_MAP_PROOF_SECRET`, and `IGO_MAP_DAILY_LIMIT` to this
backend. Native Android/iOS Maps SDK keys stay in their respective mobile builds.
The existing Supabase Google-content retention job must remain enabled for Places
search. Google credentials are not required for fictional shared demo checkout.

## 4. Deploy and check authentication

Click **Deploy project**. After the build succeeds, publish the project if Netlify
shows a private draft/publish step, and copy its stable HTTPS address such as
`https://YOUR_SITE.netlify.app`. Use that address instead of an individual
deploy-preview URL. Choose the final site name before configuring phones/jobs.

1. Open it in a private browser window. Admin pages must require Clerk sign-in.
2. Sign in using an ID listed in `ADMIN_CLERK_USER_IDS`; check Orders and Restaurants.
   A normal customer/non-admin must not gain admin access by signing in.
3. Create a **Shared demo** session from the admin top bar.
4. Join from the mobile app, try a fictional order, and verify customer/restaurant/
   rider status changes. See `docs/demo-purchases.md`.
5. Upload, replace and remove a fictional menu photo; check it on the customer side.

Clerk browser sign-in, deployed PostgreSQL certificate packaging, native photo
selection and actual Netlify function behavior still require these hosted checks.
A local Next.js build or Storage test alone does not prove this deployment works.
Netlify's Free plan has a shared monthly credit allowance; monitor Usage & billing.

Keep the policy approval flag false. Production-mode real account registration
remains gated until policies are finalized. Use the shared fictional demo to test
the integrated apps now; setting global `IGO_DEMO_MODE=true` is not required.
Real BML payment collection remains disabled.

## 5. Connect Codemagic and phones

In Codemagic's existing `igo_mobile` variable group, set
`IGO_API_BASE_URL=https://YOUR_SITE.netlify.app` with no `/api` suffix. Keep its
`CLERK_PUBLISHABLE_KEY` from the same Clerk instance. Use the existing connected
APK workflow, or the Google Maps demo workflow when checking maps, then install
the new artifact. No database, Storage, Clerk secret or cron secret goes in Flutter.

For **Try shared demo**, the existing design-preview APK can accept the HTTPS
address and demo join key on the join screen without rebuilding for that address.
For real connected sign-in, rebuild after changing public configuration. Native
requests do not need browser CORS origins; a hosted Flutter web test may need its
exact origin added to `MOBILE_ALLOWED_ORIGINS` in Netlify and a redeploy.

## 6. Set schedules in Supabase after the site works

Netlify does not execute `apps/admin/vercel.json`. Our rider dispatch needs a
minute schedule; old/replaced food-photo cleanup runs daily. Supabase Cron can
call the existing protected HTTP endpoints, without adding Netlify functions.
These dispatch ticks operate on real operational records, not fictional shared
demo sessions; shared demos retain their existing admin/manual dispatch controls.

1. In Supabase, enable **Cron / pg_cron** and **Database → Extensions → pg_net**
   if not already enabled. Keep the existing `igo-google-content-prune` job.
2. In **Vault**, create/update `igo_backend_url` with the stable HTTPS site address
   (no trailing slash), and `igo_cron_secret` with the same token as Netlify's
   `CRON_SECRET`. Enter the actual secret only in the private dashboard.
3. Verify readiness in the SQL editor without displaying decrypted values:

```sql
select
  exists(select 1 from vault.decrypted_secrets
    where name='igo_backend_url'
      and decrypted_secret ~ '^https://[^/[:space:]]+$') as url_ready,
  exists(select 1 from vault.decrypted_secrets
    where name='igo_cron_secret' and length(decrypted_secret)>=32) as secret_ready;
```

Both must be true. Then **Cron → Jobs → Create job**, choose the **SQL snippet**
type, and create the two jobs below. Store only references to Vault in job SQL.
Do not paste a literal authorization secret into a job definition.

Job `igo-dispatch-tick`, schedule `* * * * *`:

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets
          where name='igo_backend_url') || '/api/dispatch/tick',
  headers := jsonb_build_object('Authorization', 'Bearer ' ||
    (select decrypted_secret from vault.decrypted_secrets where name='igo_cron_secret')),
  timeout_milliseconds := 55000
);
```

Job `igo-menu-images-cleanup`, schedule `0 0 * * *` (05:00 Maldives time):

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets
          where name='igo_backend_url') || '/api/maintenance/menu-images',
  headers := jsonb_build_object('Authorization', 'Bearer ' ||
    (select decrypted_secret from vault.decrypted_secrets where name='igo_cron_secret')),
  timeout_milliseconds := 55000
);
```

Run each snippet once to check it after configuration. It returns a queued HTTP
request ID; that is not proof the endpoint succeeded. After the request finishes,
look up that ID without printing request headers or credentials:

```sql
select id, status_code, timed_out
from net._http_response
where id = REPLACE_WITH_RETURNED_REQUEST_ID;
```

Expect HTTP 200 and `timed_out=false`. Check Cron History and Netlify function logs
too: Cron SQL can succeed while an HTTP request returns an error. HTTP 403 usually
means a mismatched/missing token or global demo mode is enabled. An HTML/redirect
response means the project isn't published/reachable or the URL is wrong. Update
Vault and mobile settings if the stable domain changes. Disable duplicate
schedules on another host before enabling these. No schedules have been installed
or activated by adding this guide.

## Troubleshooting

- **Missing package.json:** set Base to `apps/admin`, not the repository root.
- **Missing DATABASE_URL, /setup, or photo uploads unavailable:** add the listed
  dashboard variables and redeploy; ignored `.env.local` is not uploaded with Git.
- **Administrator access required:** use the approved Clerk user ID from the same
  instance; do not remove the allowlist to work around it.
- **Database certificate/file error:** confirm the public CA was pushed and the
  function bundle includes `certs/supabase-root.crt`. Do not disable TLS validation.
- **Build succeeds but API returns 500:** inspect the function log privately;
  distinguish missing runtime settings, certificate packaging and adapter issues.
- **404 for API routes:** verify the automatic Next.js adapter ran; remove manual
  SPA rewrites or static-only settings if someone added them.
- **Preview API URL stops working:** use the stable published site address.
- **Free credit limit:** review Netlify Usage & billing; deployment, processing,
  requests and bandwidth consume the same allowance.

## Official references

- [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Monorepo build directories](https://docs.netlify.com/build/configure-builds/monorepos/)
- [Function included files](https://docs.netlify.com/build/configure-builds/file-based-configuration/)
- [Environment settings](https://docs.netlify.com/build/environment-variables/overview/)
- [Netlify pricing](https://www.netlify.com/pricing/)
- [Clerk development and staging](https://clerk.com/docs/guides/development/managing-environments)
- [Supabase Cron jobs](https://supabase.com/docs/guides/cron/quickstart)
- [pg_net HTTP calls](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
