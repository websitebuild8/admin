# Deploy iGO Delivery to Netlify

Use the existing Next.js application and root `netlify.toml`. The user commits
and pushes manually through VS Code. A local build or Git push is not proof of
a successful hosted deployment.

## Build settings

| Setting | Value |
| --- | --- |
| Framework/runtime | Next.js; enable Netlify's current Next.js adapter |
| Base directory | `apps/admin` |
| Package directory | Empty |
| Build command | `npm run build` |
| Publish directory | `.next` relative to base |
| Node | 22 |

Do not deploy `.next` as static files or add an `index.html` SPA rewrite. This
platform requires server rendering, API functions and Clerk sessions. Check that
the build log includes the Next.js adapter and server functions.

## Environment

Copy values privately from ignored local configuration. Keep server variables
available to Functions as well as Builds, with the correct deploy context.
Dashboard values should not include dotenv wrapping quotes.

Required: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`ADMIN_CLERK_USER_IDS`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
(or the supported `SUPABASE_SERVICE_ROLE_KEY`) and
`DELIVERY_PUBLIC_URL=https://igodelivery.netlify.app` (use your final domain).
Set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/delivery/sign-in`. Retain any explicitly
configured `SUPER_ADMIN_CLERK_USER_IDS`. Clerk's public/server keys and IDs must
belong to the same application. Use production Clerk configuration and an
approved domain before launch.

Optional rider settings: `GOOGLE_MAPS_EMBED_API_KEY`, `WEB_PUSH_PUBLIC_KEY`,
`WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `PUSH_CRON_SECRET`. See
[rider setup](rider-web-setup.md). Plain external Google Maps directions links
need no API key. The database migration tools require `DIRECT_URL`; ordinary
hosting builds only generate Prisma Client and do not need migration access.

Never expose database, Storage or push secrets with `NEXT_PUBLIC_`. Do not grant
untrusted preview deployments production database access. Supabase Auth does not
replace Clerk. Keep the supplied public database CA in the repository.

## Database and schedules

Run reviewed migrations against the correct database using `npm run db:deploy`
from `apps/admin`. Coordinate schema changes and the new deployment in a release
window. In particular, [legacy retirement](legacy-retirement.md) removes APIs and
tables that the old deployment still expects.

Supabase Cron runs `igo-delivery-invoices` every five minutes, calling
`public.igo_invoice_due()`. Partner cutoffs remain daily and independently
configured. `igo-delivery-request-prune` removes expired submission-rate counters
hourly. Install/repair these through `npm run delivery:cron`. Optional
`igo-rider-push` is installed separately after configuring HTTPS and push keys.
Do not install duplicate HTTP invoice schedules in Netlify or another host.

## Troubleshooting and acceptance

- A Netlify-branded 404 with a successful static-file upload often indicates
  framework detection/runtime was disabled. Confirm the settings above and
  inspect the deploy log for the Next.js adapter and generated functions.
- A submission error “Request origin is not allowed” requires the exact public
  HTTPS origin in `DELIVERY_PUBLIC_URL`; Netlify's server-supplied `URL` is also
  supported. No wildcard hostname allowance is used. Redeploy after changing it.
- A business-logo error requires a valid project API origin, a private server
  Storage key and the private `igo-partner-logos` bucket. Check variable scope
  and context; never paste key values into screenshots or chat.
- After deployment, check the landing page, all sign-in routes, application
  submission, authenticated data, private logos/receipts, invoice documents and
  mobile rider navigation. Signed-out data requests must return JSON denial.
- The retired restaurant/mobile endpoints and `/legacy` must no longer exist.
  Refresh old browser tabs after deployment; their cached JavaScript is obsolete.

No deployment or live acceptance is implied by this guide.


### Secret-scanning false positive for the push contact URL

The failed production deploy `022b412` (20 October 2026) reported only `WEB_PUSH_SUBJECT`, in `scripts/setup-rider-push.ts` and `src/lib/delivery-request-origin.test.ts`. Its configured value is the public site/contact URL, intentionally present in setup code and same-origin tests. This is not a Clerk secret-key leak; the environment-variable list in the resolved configuration is not a list of exposed secrets.

The root `netlify.toml` places `SECRETS_SCAN_OMIT_KEYS = "WEB_PUSH_SUBJECT"` under `[build.environment]`. This is a narrow, public-value exception. All other credentials and file paths remain scanned. Do not put secret credentials in `WEB_PUSH_SUBJECT`; it is exclusively an HTTPS contact origin or `mailto:` contact. Do not add `CLERK_SECRET_KEY`, database credentials, Supabase secret keys, `WEB_PUSH_PRIVATE_KEY` or `PUSH_CRON_SECRET` to the omit list.

Commit/push the configuration and redeploy. A successful Netlify redeploy has not been verified locally. If another variable is reported, inspect its specific findings before changing the exception. Source: [Netlify’s scanning configuration](https://docs.netlify.com/build/environment-variables/secrets-controller/#configure-secret-scanning).

The operator’s current configured private values were checked against tracked files and the local production output in plaintext, Base64 and URI-encoded forms without printing the values. No matches were found. `.env.local` is ignored and not tracked. This check covers the current checkout/build and current local values; it does not certify all historic commits or different values configured on Netlify.
