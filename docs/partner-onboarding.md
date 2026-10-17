# Partner applications and private workspaces

All landing-page partnership buttons open `/join`. This is a public business
application, including when the browser already has an administrator session.
It does not create a Clerk account or grant any operating role.

The form collects the page/business name and type, Facebook/Instagram/website
link (optional), owner/manager name, contact number, email, pickup island and address,
estimated daily delivery count, contact acknowledgement and an optional business logo.
The future login name is the approved email address.

Page links may omit `https://`. The form adds it when leaving the field, and the
shared server validator repeats normalization before saving. Existing `http://`
links are upgraded to HTTPS. Facebook page/share links and the explicit
`fb.com`, `fb.me` and `on.fb.me` short domains are accepted; query strings are
preserved. Short links are stored as supplied with HTTPS, without fetching or
claiming to verify their destination. Other hosts still fail Facebook/Instagram
validation, and credentials or non-web URL schemes are rejected.

## Approval and setup

1. Admin opens `/delivery/applications` and reviews the complete application.
   Logo, contact, pickup details and expected delivery volume are visible here.
2. Admin records an approval or rejection and a review note. Incomplete uploads
   never enter this review list. Approval alone does not create a login account.
3. Admin explicitly selects **Send setup invitation** for an approved application.
   Clerk sends the setup email. An API acknowledgement means the provider
   accepted the request; it does not prove the recipient received the email.
4. The owner follows the invitation to `/partner/activate`, verifies their
   identity through Clerk and sets their own password. Invitations expire after
   seven days. The owner can then use `/partner/sign-in`.
5. On first authenticated access, the server matches Clerk's verified primary
   email to an approved application with a confirmed invitation request. A
   transaction creates exactly one partner/account and retains the logo link.

Passwords are handled by Clerk. iGO does not generate, store or email plaintext
passwords. Partners use their account menu → Manage account → Security to change
their own password. Existing Clerk users keep their existing identity. An email
already bound to a delivery partner or driver is rejected by invitation preflight
instead of being silently reassigned to another business. An admin-only account
can activate an approved partner application without losing its admin access.
An existing partner or rider can also receive an independent admin grant and
[switch workspaces](admin-access-and-workspaces.md).

## Partner privacy

Approved partners use `/partner`, not the admin workspace. Links inside their
dashboard stay under `/partner`. Old `/delivery` links redirect a partner to
their own workspace. An account with both kinds of access must select its Partner
workspace to use the business-scoped dashboard; admin access never bypasses
partner approval.

Only the partner's own package counts, recipient/delivery details, package
history, invoices and delivery-fee transfers are returned. Partner
selectors, business/driver lists, applications, system audit logs and scheduler
health are admin-only. Bank beneficiary details and published delivery rates
remain visible so the partner can understand and pay their own invoices.

The approved business name and any uploaded logo appear in its sidebar and page header,
including mobile layouts. Other partners cannot fetch the logo by changing an
application ID. Business logos are private Supabase objects, served through an
authenticated, role-scoped endpoint. Images are decoded, stripped of metadata,
resized to a 512 × 512 contain canvas and saved as WebP. SVG, animation, oversized
and excessive-pixel inputs are rejected.

## Configuration and deployment

- Follow the coordinated [release steps](origin-pricing-and-rider-jobs.md#release-steps)
  for the currently pending migrations, including optional-assets/admin access.
- Run `npm run delivery:logo-storage` once to create/verify the private
  `igo-partner-logos` bucket. It uploads and removes only its own temporary probe.
  Use the existing Supabase server secret; never put it in browser settings.
- Run `npm run delivery:auth-check` to inspect email/password support and verify
  the invitation credentials with read-only calls. This creates no users and
  sends no messages. Email/password must be enabled in the intended Clerk instance.
- Set `DELIVERY_PUBLIC_URL` to the final HTTPS website origin, for example
  `https://igodelivery.netlify.app`, in the hosting provider's server environment.
  It is also an exact trusted origin for delivery API submissions behind a proxy;
  Netlify's built-in server `URL` supplies its primary website origin as well.
  If absent, invitation links use the current request origin; local URLs are only
  useful on the same computer. Configure production Clerk domains before launch.
- Rebuild/redeploy after pushing. A local build does not prove deployment.

### “Business logo storage needs server configuration” on Netlify

This error occurs only when a logo is supplied. An application without a logo
does not need Storage configuration. It occurs before upload: the running server has a missing or
invalid `SUPABASE_URL` or server key. Local `.env.local` values are intentionally
ignored by Git and are not copied into a Netlify deployment.

In the Netlify project's **Project configuration → Environment variables**, set
`SUPABASE_URL` to the existing project's HTTPS API origin and
`SUPABASE_SECRET_KEY` to the existing private server key. A legacy
`SUPABASE_SERVICE_ROLE_KEY` is also supported. Use the values privately from
`apps/admin/.env.local`, without dotenv's surrounding quotes; a database URL or
publishable/anonymous key does not replace these settings. Include the
**Functions** scope (or **All scopes**) and the **Production** deploy context.
Create a new deploy after saving. Do not prefix a server key with `NEXT_PUBLIC_`
or commit it to the repository.

Run `npm run delivery:logo-storage` against the intended project to verify its
private `igo-partner-logos` bucket. Keep the existing application form open and
retry after the new deploy is ready: its request key resumes a reserved upload
without creating a duplicate application. Requests with a supplied logo check
Storage configuration before reserving an application. Public rate limits apply
to submissions with or without a logo.

Netlify reference: [Environment variables and functions](https://docs.netlify.com/build/functions/environment-variables/).

If both variables are listed but the error continues, check the **running
function's configuration**, not just the dashboard's list of names. After
deploying the diagnostics change, sign in with an approved admin account and open
`/api/delivery/storage-status` on that same website. The private, uncached report
identifies missing settings, surrounding quotes, dashboard/database URLs used in
place of the project API origin, and publishable/incorrectly formatted server
keys. It never returns the URL, keys, partial values or credential hashes.
Partners, drivers and applicants are denied access. The check does not read or
write the database or contact Supabase; `valid-format` does not verify bucket
permissions, credentials or upload connectivity.

The same sanitized report is written to server-side function logs under
`Partner logo storage configuration` when a logo upload fails configuration
preflight. Share only this report if assistance is needed. Netlify's **Contains
secret values** checkbox can remain checked; a scope summary that already
includes **Functions** does not require upgrading or unchecking the secret flag.
Re-enter the verified local value in the relevant Production context if the
report identifies a bad value, then deploy again. Do not disable private Storage
or put a server key in browser variables to work around this error.

The anonymous form uses same-origin validation, a bounded multipart body,
server-side validation, a honeypot and shared database-backed submission limits.
The initial limits are 20 requests/hour per trusted hosting IP and 100/day in
total. Custom proxy deployments must supply a trustworthy client-IP strategy;
otherwise they share one fallback bucket. Review these pilot limits and add a
bot challenge if public traffic warrants it. No CAPTCHA service is silently
substituted. Failed uploads retain private draft reservations; keep the form open
and retry the same request. Support must handle details changed after submission.

Review operations use idempotency keys and transaction locks. Invitation requests
use a lease and reconcile an existing pending provider invitation before creating
another after an interruption. Failed requests retain the application and can be
retried. Revoking/rejecting approval blocks activation even if an old invitation
email remains in an inbox. Once activated, suspend access from **Partner pages**.
Review, submission and account activation are audited. Application/brand retention
and privacy notices still need the business's approved launch policy.

## Verification boundaries

`npm test` checks field validation and verified-primary-email selection.
`npm run delivery:integration` checks the real database in a disposable QA schema,
including submission replay, approval gates, simultaneous invitation requests,
activation races, logo ownership and partner-only financial/operational views.
The invitation transport in those integration tests is explicitly a test double:
those tests never email real businesses. Logo-storage verification separately
checks actual private Supabase upload/read/anonymous denial and cleanup.

A real owner must still accept an actual invitation and exercise their signed-in
partner dashboard before launch. Do not infer that inbox delivery or that browser
walkthrough passed from the database tests or the read-only Clerk check.

### Verified in this workspace on 16 October 2026

- Applied the additive migration to the configured Supabase project.
- Created/verified the private logo bucket. Its temporary probe was resized,
  uploaded, denied anonymously, read with server authorization, and removed.
- 59 automated tests and 45 isolated PostgreSQL integration checks passed.
  The QA schema and its fixtures were removed. Invitation transport was a test
  double; no real invitation emails or Clerk users were created.
- Clerk's live settings reported email enabled, password enabled and password
  required. Read-only invitation API access succeeded.
- Production build, TypeScript and lint checks passed.
- Public application rendered through the real home-page CTA while the browser
  was signed in as admin. Desktop and 390/320 px phone layouts fit without
  horizontal overflow. Instagram selection and local logo preview worked.
- The real signed-in administrator's `/delivery/applications` page loaded its
  database-backed empty list with ten-item pagination. Its navigation fit at
  both 1280 × 850 and 1280 × 720 without sidebar scrolling. An admin visiting
  `/partner` saw the separate-account notice instead of a partner dashboard.
- A real invited owner's email acceptance and signed-in partner browser
  walkthrough remain unverified. Set the final deployed website origin before
  inviting live businesses. The user will commit/push and deploy separately.

The application now requires Malé, Hulhumalé Phase 1 or Phase 2 as the operating
location. Admin can change this later under Partner pages, with a recorded reason.
See [current pricing and rider jobs](origin-pricing-and-rider-jobs.md).
