# Phase 1: iGO Delivery operating specification

Updated scope, 19 October 2026. The repository and application database serve
the seller-delivery web platform only.

## Architecture

Keep Next.js App Router, TypeScript, Tailwind, shadcn, Clerk, Prisma and Supabase
PostgreSQL. Clerk identifies a person; database approval grants partner or driver
access. Existing ADMIN_CLERK_USER_IDS identify protected super admins. They can
manage private database-backed administrator grants without replacing an approved
partner/rider role. See [admin access and workspaces](admin-access-and-workspaces.md).
No Clerk organization, sign-up metadata, checkbox or client request grants a role.
Supabase database and private receipt Storage are accessed by the backend only.
All operational records belong to this delivery platform.

Public site: `/`. Admin: `/delivery`. Partners: `/partner`. Riders: `/rider`.
The retired restaurant/mobile code and tables are removed; applied migration
history is retained. See [retirement](legacy-retirement.md).

## Confirmed business decisions

- Currency MVR; all stored money is integer laari. Display/report dates use
  Indian/Maldives (UTC+5), independently of the hosting machine's timezone.
- Each partner chooses Malé, Hulhumalé Phase 1 or Phase 2 when applying. Admin can
  change this location later with a reason. Route prices are defined in
  [origin pricing](origin-pricing-and-rider-jobs.md), not one destination-only rate.
- Recipient goods-value collection is not offered. Package registration and
  imports contain no cash amount. The unused retired cash archives are removed
  with the old platform; current delivery-fee invoice/payment records remain.
- Default daily invoice cutoff is 18:00 Maldives Time; admin may change it per
  partner. Existing unpaid invoices remain outstanding across all later cycles.
- Admin's total earned card counts all-time verified delivery-fee payments received,
  excluding unverified transfers and unpaid fees. Salaries are outside this total.
- This is manual seller order entry/import, not a Facebook/Instagram API integration.
- Notifications are an authenticated in-app inbox. External email/SMS/WhatsApp or
  background rider push uses the existing subscription/outbox workflow. Email/SMS/WhatsApp delivery is not implied.

## Data model

- DeliveryRequestBucket: durable hashed-identity submission limits, with hourly
  expired-counter cleanup; no Google Places usage is stored.
- DeliveryAccount: one profile per Clerk identity and operational role, with a
  retained primary profile. Only active admins automatically receive both
  Partner and Rider profiles; ordinary identities have one active role.
  See [automatic admin workspaces](admin-workspaces.md).
- DeliveryPartner: page URL, contact/pickup, cutoff and durable next billing time.
- DeliveryParcel: UUID plus unique public ID, partner-scoped external reference,
  recipient, route, frozen origin, destination label and delivery fee, assigned driver and milestones.
- DeliveryImport: partner + file hash prevents repeated files; partner + external
  parcel reference prevents duplicates across files and manual registrations.
- DeliveryInvoice/Cycle/Line: one cycle per partner/local day, no customer-facing
  invoice for empty cycles, and globally unique invoice line per delivered parcel.
  Admin may also issue all completed, uninvoiced deliveries manually from a
  partner's history without advancing their daily cutoff. InvoiceDispatch records
  the one-time partner dashboard notification. See [manual invoices](partner-history-invoices.md).
- DeliveryPayment/Allocation/Receipt: private evidence, independent review state,
  admin-confirmed amounts and an auditable allocation to one invoice. Partial
  confirmation never credits the unverified remainder. Reused bank references
  and reused proof are rejected. Pending or rejected proof never reduces debt.
- DeliveryDestination/Rate: admin-controlled destinations and origin/destination
  prices. Missing or inactive routes block registration; they have no fallback fee.
- DeliveryCommand, DeliveryActivity, DeliveryNotification: idempotent commands,
  append-only financial/operational history and recipient-scoped messages.

## Mandatory invariants

Registration creates REGISTERED only. Assignment is independent from pickup.
Collection-list checkboxes are browser selection state only. Confirm Pickup is
the sole driver command that records physical receipt. Only the assigned approved
driver can complete a picked-up parcel. Approved riders can claim registered,
unassigned packages from Available jobs; a claim never records pickup. Server time
and driver identity are recorded; clients cannot backdate milestones.

Only DELIVERED, uninvoiced parcels enter a billing cycle. PostgreSQL serializes
cycles per partner; unique constraints prevent repeated cycles and invoice lines.
Missed schedules catch up from durable nextInvoiceAt. Fees are frozen at parcel
registration; later rate changes cannot alter existing packages or invoices.
Unpicked parcels remain estimates, never invoice debt. Confirmed allocations
alone reduce debt; receipt submission and rejection do not.

Critical mutations run inside serializable, retried transactions and store an
actor-scoped idempotency key + payload hash + response atomically. Cross-partner
reads and writes derive their scope from the authenticated account. API mutations
also check Origin, bound input/file sizes and validate server-side with Zod.
Public Supabase database roles have no table or invoice-function permissions.

## Verification and release

Unit tests cover validation, money, UTC+5 cutoff boundaries and import safety.
Database integration checks must verify actual SQL constraints, concurrent
pickup/invoice/payment races, tenant isolation and reconciliation using disposable
fixtures. Storage needs an actual private-bucket upload/access/delete probe.
Browser checks cover partner/admin/driver pages and mobile driver layouts.
Migration, cron installation, job execution, Clerk sign-in, Storage and deployment
are reported individually as verified or pending, never inferred from code alone.

Production business identity, bank beneficiary information, approved policies,
Clerk production configuration, hosting and recovery/backup arrangements remain
release inputs. This specification and launch checklist must retain those gates.
