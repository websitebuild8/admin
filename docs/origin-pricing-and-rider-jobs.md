# Operating locations, delivery pricing and rider jobs

Updated 17 October 2026. Phase 1 handles delivery fees only. iGO does not collect
recipient payments for goods. The existing restaurant/mobile product stays parked.

## Rates in MVR

| Partner operates from | Malé | Hulhumalé Phase 1 | Hulhumalé Phase 2 | Boat |
| --------------------- | ---: | ----------------: | ----------------: | ---: |
| Malé                  |   25 |                35 |                45 |   25 |
| Hulhumalé Phase 1     |   35 |                25 |                30 |   35 |
| Hulhumalé Phase 2     |   45 |                30 |                25 |   45 |

The public application requires an operating location. Only admin can change an
activated partner’s location in **Partner pages → Operating location**, with an
explanation recorded in audit history. The partner receives a notification.
Old generic “Hulhumalé” records need admin phase selection; migration does not
invent a phase. Packages registered previously keep their historical fee and
an unknown historic origin stays unknown.

**Settings & rates** manages route prices and destinations, ten rows per page.
Add a destination with a unique uppercase code, then add a rate for each origin
that can serve it. An origin without a rate cannot register that destination.
Inactive destinations block new packages. Custom destinations are supported by
manual registration, bulk import, package history and rider directions. Existing
packages keep the destination label saved at registration.

Registration runs in one serializable transaction. The server reads the approved
partner’s current location and active route, saves integer-laari fee plus origin
and destination, and never trusts client-supplied prices. Database guards verify
the registered quote and prevent route/fee rewrites. Later location, label and
rate edits affect future packages only. Registration, assignment and pickup
never create invoice debt. Only delivered, uninvoiced packages are billable.

## Rider jobs

**Find jobs** lists registered, unassigned packages for approved riders. Lists are
paginated at ten. Before a claim, the API omits recipient identity and phone;
it provides the business pickup address and delivery address/area for job choice.
**Take delivery** atomically sets the rider and records an audit event plus
partner/rider notifications. Concurrent claims allow one winner. The rider must
still confirm physical pickup from their collection list and confirm delivery
separately. Suspended riders cannot claim or operate jobs. Admin assignment is
retained. Google Maps buttons use saved addresses; no live rider tracking is added.

## Sign-in and application

The home Sign in action uses the yellow button. Partner sign-in asks for an email
through Clerk, routes unknown identifiers to `/join?notice=registration-required`,
and leaves password, MFA and recovery with Clerk. Already-authenticated people
without a partner registration also go to the form. A friendly notice explains
registration, admin review, invitation and account setup. A pending application
does not grant access. Clerk’s configured identifier/abuse protections remain in
force; this app adds no public database email-lookup endpoint.

## Retiring recipient cash collection

Migration `20261017000000_origin_pricing_retire_cod` copies old package cash links
and amounts to `DeliveryRetiredCodParcel`. Original cash transfer and immutable
receipt tables remain private, read-only archives. Active ORM models, operational
columns, commands, routes, UI and import fields are removed. Do not drop the
archive tables in a future generated migration or rewrite applied migrations.
Delivery-fee bank receipt uploads, verification, partial payments, paid invoices,
invoice history and earnings are retained.

Deploy this migration before serving the new application. Redeploy the website
after the user commits/pushes. Existing open tabs should be refreshed so they
load the new six-column template and no longer submit retired fields.

## Release steps

Both `20261017000000_origin_pricing_retire_cod` and
`20261017010000_admin_access_optional_partner_assets` are deliberately
**pending on the live database**. The published
version still reads the removed columns. The second migration adds independent
admin grants, workspace-scoped notifications and optional application assets.
The repository's Netlify build only
builds the app; it does not run database migrations automatically.

1. Commit and push all changes together using VS Code, as requested. Prepare the
   new Netlify deploy and confirm its build succeeds before switching traffic.
2. Use a short maintenance/release window. With the new deploy ready, run the
   following from the repository root using the configured private server env:

   ```bash
   cd apps/admin
   npm run db:deploy
   ```

3. Publish the prepared new deploy immediately after the migration succeeds.
   Avoid serving the old code against the new schema, or the new code against
   the old schema. A code-only rollback cannot reverse this schema change.
4. Check partner and rider sign-in on the actual hosted domain, the rate matrix,
   a partner's own package list and invoice history. Under Partner pages, set the
   phase for any older partner marked “Location needs review”.
5. Refresh open tabs and download the new six-column Excel template. Check the
   invoice scheduler health. Its existing delivered-only billing is retained.

No live database update, commit, push or public deployment was performed during
this implementation. Historical financial records were not edited by QA.

## Verification

- 90 unit tests pass, including the shipped Excel template, required operating
  locations and rejection of removed cash fields/commands.
- 77 delivery integration checks pass in an isolated disposable Supabase schema:
  all twelve routes, frozen quotes, custom/inactive destinations, ten-row pages,
  conflicting rider claims, suspension, explicit pickup, tenant isolation,
  invoice cycles, manual invoices, verified payments, paid copies and earnings.
- Two retirement-migration checks preserve actual historical fixture receipts,
  parcel links and saved fees and verify private read-only archives.
- Two historical paid-invoice migration checks preserve settlement times,
  references, debt and notification counts. All temporary schemas were removed.
- ESLint and the one-worker production build with TypeScript pass.
- Actual client components were checked with fictional API/Clerk transport at
  320/390/1440px: rider claim → collection → explicit pickup dialog; registration
  quotes; required application location choices; unknown-identifier redirect and
  recognized-account continuation; admin route and destination form submission;
  ten-row rate pagination and the partner operating-location modal.
- No real authenticated Clerk sign-in or hosted Netlify release was verified in
  this task. The standalone UI harness substitutes a simple transition wrapper
  for Next's React transition runtime; it is not an animation acceptance test.
