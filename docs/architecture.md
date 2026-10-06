# iGO application architecture

Updated 7 October 2026. One repository and shared backend: Next.js/shadcn admin,
one role-based Flutter mobile app, Clerk identity, Supabase PostgreSQL through
Prisma 7, and Zod server validation. `apps/admin` contains the backend/admin,
`apps/mobile` the native app, `packages/contracts` the API boundary notes, and
`docs` product/setup/legal decisions.

Mobile native clients send a verified Clerk bearer token to versioned Next.js APIs.
A server-owned admin ID allowlist separately protects every admin page/API. Public
mobile registration cannot grant admin access. Database roles and current partner
approval determine the mobile experience; restaurant/rider applicants remain
pending until trusted approval. Clients cannot set approval or select an arbitrary
operational role. Sessions use secure device storage.

Customer addresses and reviewed restaurant pickup entrances share the backend.
Google Places search resolves an explicitly selected building automatically, and
Google native maps display the entrance. Unit and access instructions are user
provided. Customers view fixed saved entrances for their own orders on the
status map. Only assigned riders receive navigation job details and may open external
Google Maps directions. No iGO device-GPS permission or rider location broadcasts
are implemented. Dispatch uses service areas and availability, while ETA is a
labeled distance-based fallback, not traffic-aware Google routing.

Authenticated address-search requests use a server-only Places key, minimal fields,
short-lived search sessions, durable account/global request limits and Google
coordinate expiry. Supabase Cron removes expired provider coordinates. Details
and credential restrictions are in [Google Maps setup](google-maps-setup.md).
Admin/mobile roles continue to share the existing workflow and audit records.

Catalog/menu/order responses are server-paginated at ten entries; catalog search
and cuisine/category/stock filters apply before pagination. Restaurant menu
mutations enforce owner scope and preserve past order snapshots. Admin lists have ten-row display
pagination but still read complete operational state. Scoped admin queries,
outbox/push delivery, operational monitoring and concurrency/load exercises remain
scaling work. Direct public-client access to business tables is revoked with RLS.

Checkout quotes snapshot server-priced line items and entrance details, using
integer laari. BML card collection is disabled until merchant setup and authenticated
payment verification are ready; no unpaid order is submitted. Callback idempotency,
reconciliation, money-moving refunds, payouts, tax receipts, document uploads,
account-deletion execution and validated coverage polygons remain launch work.

Policies retain the agreed business placeholders and production registration is
gated pending published approved policies. Provider/backup retention and native
Clerk/Google/Liquid Glass behavior require deployment/device checks. No public
deployment or legal compliance sign-off is claimed. See [verification](verification.md)
and [launch requirements](launch-requirements.md).

## Isolated integrated demo

The connected admin can create private, expiring DemoSession workspaces. Fictional
mobile roles use separate `/api/demo/mobile/*` endpoints. Mock bank approval creates
an order only inside the session JSON, and the existing workflow handles kitchen,
dispatch and delivery actions inside that same sandbox. No operational tables or
real payment attempts are written. Admin pages switch explicitly to one session;
Exit demo returns to real operations. See [demo purchases](demo-purchases.md).
