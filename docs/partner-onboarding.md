# Partner applications and private workspaces

All landing-page partnership buttons open `/join`. This is a public business
application, including when the browser already has an administrator session.
It does not create a Clerk account or grant any operating role.

The form collects the page/business name and type, Facebook/Instagram/website
link, owner/manager name, contact number, email, pickup island and address,
estimated daily delivery count, contact acknowledgement and a business logo.
The future login name is the approved email address.

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
already bound to an admin, delivery partner or driver is rejected by invitation
preflight instead of being silently reassigned to another business.

## Partner privacy

Approved partners use `/partner`, not the admin workspace. Links inside their
dashboard stay under `/partner`. Old `/delivery` links redirect a partner to
their own workspace. Administrator sessions do not turn into partner sessions.

Only the partner's own package counts, recipient/delivery details, package
history, invoices, transfers and cash-on-delivery balances are returned. Partner
selectors, business/driver lists, applications, system audit logs and scheduler
health are admin-only. Bank beneficiary details and published delivery rates
remain visible so the partner can understand and pay their own invoices.

The approved business name and logo appear in its sidebar and page header,
including mobile layouts. Other partners cannot fetch the logo by changing an
application ID. Business logos are private Supabase objects, served through an
authenticated, role-scoped endpoint. Images are decoded, stripped of metadata,
resized to a 512 × 512 contain canvas and saved as WebP. SVG, animation, oversized
and excessive-pixel inputs are rejected.

## Configuration and deployment

- Apply the additive migration `20261016050000_partner_applications` with
  `npm run db:deploy`. Existing accounts and financial records are retained.
- Run `npm run delivery:logo-storage` once to create/verify the private
  `igo-partner-logos` bucket. It uploads and removes only its own temporary probe.
  Use the existing Supabase server secret; never put it in browser settings.
- Run `npm run delivery:auth-check` to inspect email/password support and verify
  the invitation credentials with read-only calls. This creates no users and
  sends no messages. Email/password must be enabled in the intended Clerk instance.
- Set `DELIVERY_PUBLIC_URL` to the final HTTPS website origin, for example
  `https://igodelivery.netlify.app`, in the hosting provider's server environment.
  If absent, invitation links use the current request origin; local URLs are only
  useful on the same computer. Configure production Clerk domains before launch.
- Rebuild/redeploy after pushing. A local build does not prove deployment.

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
