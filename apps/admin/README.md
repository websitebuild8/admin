# iGO Admin

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Clerk, Neon PostgreSQL and Prisma 7. Zod validates form inputs and API commands. One repository also reserves the future role-based Flutter application.

## Local preview

Use Node 22.18+ (or a compatible supported Node version).

```bash
cd apps/admin
npm ci
cp .env.example .env.local
npm run db:generate
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. `IGO_DEMO_MODE=true` intentionally exposes fictional sample data without sign-in. Demo changes are stored only in this browser; Settings can reset them. The live database APIs refuse access while demo mode is enabled. Use a dedicated demo origin if sharing it; do not enter real personal information.

## Connect Clerk and Neon

1. Create/configure your Clerk application. Set its publishable and secret keys in `.env.local`. Never use `NEXT_PUBLIC_` for a secret key or database URL.
2. Create the administrator in Clerk; put the exact Clerk user ID in `ADMIN_CLERK_USER_IDS`. Comma-separated IDs are supported. No other signed-in user gets admin access. Enable MFA in your Clerk sign-in policy before real operations.
3. Create a Neon development branch/database. Put its pooled URL in `DATABASE_URL` and its direct URL in `DIRECT_URL`; keep the provided TLS parameters. No local Postgres server is necessary.
4. Prisma CLI loads `.env`, not Next.js `.env.local`. Supply `DIRECT_URL` in your shell or a private `.env` when running migrations. Do not paste credentials into chat or commit them.
5. Run `npm run db:deploy` to apply the included initial migration to your development branch. Use `npm run db:migrate -- --name change_name` for future schema changes in development; never run development migrations against production. Review migrations before deploying to a production database.
6. Set `IGO_DEMO_MODE=false`, restart, and verify sign-in, non-admin denial, data reads and writes. Live mode begins with an empty database; demo data is never automatically copied into it.

The schema supports the initial admin records. Ingestion/onboarding APIs and a full checkout schema are the next backend phase. See `../../docs/architecture.md` for boundaries. The current complete-state queries need pagination before operating at scale.

## Current screens

- Data lists show at most 10 records per page, with previous/next controls and result counts. Search/filter changes reset to page one; CSV exports include all matching orders. This is display pagination; live API queries still load the complete dataset.
- Overview with metrics computed from records, daily activity, attention queues, and CSV export.
- Orders with search/filtering, details, constrained state progression and rider assignment.
- Restaurant/rider application reviews with verification acknowledgement and audit records.
- Customer summaries grouped by customer ID.
- Card-payment records and validated refund-review requests. No bank refund is issued.
- Support resolution queue, activity history and service settings.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Run checks sequentially to keep resource use moderate. The Next.js build is configured to use one build worker. Avoid concurrent dev servers and builds on a constrained machine.

## Security and unfinished integrations

Clerk middleware/proxy handles sessions. Both protected layouts and server endpoints check the server-owned admin allowlist. API writes validate same-origin requests and use Zod; commands run in serializable transactions with audit entries. Pending review amounts are included in refund limits. The backend never accepts a client claim of payment success.

Clerk and Neon credentials are not included. Until configured, only demo mode can be exercised. BML callbacks/charging/refunding, verified document uploads, real notifications, GPS, granular finance/support permissions, production observability and account-deletion execution remain future work. The sample document-verification checkbox does not inspect any actual documents. Do not deploy for real operations until these requirements and the launch checklist are addressed.

No application password, Clerk secret, bank secret or connection string belongs in Git. Legal drafts contain deliberate placeholders and are not published policies.
