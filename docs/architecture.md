# iGO application architecture

Updated 3 October 2026. Supersedes earlier Supabase recommendations.

- Admin: Next.js App Router, TypeScript, Tailwind CSS, official shadcn/ui components.
- Identity: Clerk. An authenticated account is not automatically an administrator or an approved restaurant/rider.
- Storage: Neon PostgreSQL, Prisma 7 with the PostgreSQL driver adapter.
- Validation: Zod on both form and server boundaries; React Hook Form for forms.
- Mobile, later: one Flutter application with customer, restaurant, and rider modes, approved by the backend.
- Brand: white surfaces, yellow actions, black typography, translucent panels with restrained blur.

## Repository

`apps/admin` is the working admin application. `apps/mobile` reserves the future Flutter project. `packages/contracts` records the future shared API-contract boundary. `docs` retains product and legal decisions. This is one repository; a heavyweight workspace orchestrator is intentionally not required for one Node app and a future Dart app.

## Current implementation

The app has a local demo provider and a server database provider. Demo changes persist in this browser only. All demo rows are fictional. Live mode reads normalized Prisma tables and makes validated changes in a serializable transaction with an audit record. Conflicting transactions return a retryable error instead of silently overwriting another action.

Clerk proxy protection is supplemented by server-side checks in both the workspace layout and every admin API. A server-owned allowlist of Clerk user IDs bootstraps administration. Move to database-managed staff permission assignments when finance/support roles are introduced. No client-editable role metadata grants access.

Neon holds business state. Mobile must later call authenticated versioned APIs; it must never receive database credentials or Clerk server secrets. Restaurant/rider approval must be connected to identity memberships before mobile access is enabled; the initial partner tables are operational records, not a complete membership system.

## Deliberate boundaries

- BML capture, webhook verification, reconciliation and money-moving refunds are not implemented. Refund review records are requests only.
- No real GPS, live dispatch feed, merchant payouts or document-upload service is connected yet.
- Customer views summarize order history by customer ID; they are not a full identity-management interface.
- Admin lists display at most 10 records per page, but currently load complete operational datasets. Add server-side pagination/date-scoped queries before significant production volume.
- The first order schema stores a display summary. Before mobile checkout, add immutable line items, quotes, payment attempts, tax/fee snapshots, branch memberships and the checkout idempotency/outbox model described in the product specification.
- Service settings are persisted for future checkout integration; this admin project does not yet enforce delivery zones in a customer checkout.
- Clerk/Neon require user-supplied credentials, migrations and verification; demo success does not validate those external services.

No public deployment or legal compliance sign-off has been performed.
