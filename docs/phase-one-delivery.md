# Phase 1: iGO Delivery operating specification

Approved scope, 16 October 2026. The restaurant/mobile product remains available
for Phase 2; Phase 1 is a real, separately scoped seller delivery service.

## Architecture

Keep Next.js App Router, TypeScript, Tailwind, shadcn, Clerk, Prisma and Supabase
PostgreSQL. Clerk identifies a person; database approval grants partner or driver
access. Explicit ADMIN_CLERK_USER_IDS remains the only administrator allowlist.
No Clerk organization, sign-up metadata, checkbox or client request grants a role.
Supabase database and private receipt Storage are accessed by the backend only.
New delivery records never reuse restaurant purchases or their payment gates.

Public site: `/`. Operating portal: `/delivery`. Existing Phase 2 administration
moves to `/legacy`; its mobile APIs remain at their existing URLs.

## Confirmed business decisions

- Currency MVR; all stored money is integer laari. Display/report dates use
  Indian/Maldives (UTC+5), independently of the hosting machine's timezone.
- Delivery charges: Boat 25, Malé 25, Hulhumalé Phase 1 35, Phase 2 45 MVR per
  registered parcel. Two parcels are two fees; customer count is not guessed.
- Cash on delivery is supported. The parcel value is independent of the delivery
  charge. Delivery-fee invoices remain payable separately; COD payouts never
  automatically deduct delivery debt.
- Default daily invoice cutoff is 18:00 Maldives Time; admin may change it per
  partner. Existing unpaid invoices remain outstanding across all later cycles.
- This is manual seller order entry/import, not a Facebook/Instagram API integration.
- Notifications are an authenticated in-app inbox. External email/SMS/WhatsApp or
  background push is not silently substituted or represented as implemented.

## Data model

- DeliveryAccount: unique Clerk identity, approved role and application review.
- DeliveryPartner: page URL, contact/pickup, cutoff and durable next billing time.
- DeliveryParcel: UUID plus unique public ID, partner-scoped external reference,
  recipient, route, frozen delivery fee/COD amount, assigned driver and milestones.
- DeliveryImport: partner + file hash prevents repeated files; partner + external
  parcel reference prevents duplicates across files and manual registrations.
- DeliveryInvoice/Cycle/Line: one cycle per partner/local day, no customer-facing
  invoice for empty cycles, and globally unique invoice line per delivered parcel.
- DeliveryPayment/Allocation/Receipt: private evidence, independent review state,
  admin-confirmed amounts and an auditable allocation to one invoice. Partial
  confirmation never credits the unverified remainder. Reused bank references
  and reused proof are rejected. Pending or rejected proof never reduces debt.
- DeliveryCashHandover/CodRemittance: explicit admin records for whole parcels'
  collected cash, first driver-to-company, then company-to-partner. Partial batches
  of parcels are allowed; a parcel's COD is not silently split or netted against fees.
- DeliveryCommand, DeliveryActivity, DeliveryNotification: idempotent commands,
  append-only financial/operational history and recipient-scoped messages.

## Mandatory invariants

Registration creates REGISTERED only. Assignment is independent from pickup.
Collection-list checkboxes are browser selection state only. Confirm Pickup is
the sole driver command that records physical receipt. Only the assigned approved
driver can complete a picked-up parcel. COD deliveries require explicit
confirmation that the exact expected parcel amount was received. Server time
and driver identity are recorded; clients cannot backdate milestones.

Only DELIVERED, uninvoiced parcels enter a billing cycle. PostgreSQL serializes
cycles per partner; unique constraints prevent repeated cycles and invoice lines.
Missed schedules catch up from durable nextInvoiceAt. Fees are frozen at parcel
registration; later rate changes cannot alter existing packages or invoices.
Unpicked parcels remain estimates, never invoice debt. Confirmed allocations
alone reduce debt; receipt submission, rejection, COD and payout do not.

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
