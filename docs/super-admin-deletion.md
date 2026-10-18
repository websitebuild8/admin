# Super-admin deletion

Only configured super admins (`ADMIN_CLERK_USER_IDS` and
`SUPER_ADMIN_CLERK_USER_IDS`) see the red outlined trash buttons in Packages,
Partner pages, Riders and Invoices. A normal administrator grant does not give
deletion access. Both preview and execution independently authorize the session
on the server; a client flag cannot grant access.

Each deletion requires a current impact preview, the exact record name/reference
and a reason. Nothing is removed just by opening the dialog. Financial deletion
is enabled explicitly by the project owner, including linked payment records.
Removing payment records does not reverse any actual bank transfer.

| Selected record | Removed or changed |
| --- | --- |
| Partner | Delivery-role account, partner profile/application, packages, imports, billing cycles, invoices, payment submissions/allocations, paid invoice copies/history, receipts, logo and related notifications |
| Rider | Delivery-role account, device subscriptions, queued alerts and related notices. Registered work is unassigned. Completed work keeps its immutable pickup/delivery identities and timestamps, with the removed account reference detached. Physically picked-up work must first be completed or explicitly deleted. |
| Package without an invoice | Package, notices and an empty import batch |
| Invoice or already-invoiced package | **The entire invoice and all its packages**, all payment states, allocations, paid copies, sends, timeline, receipts and notices. Removing the packages prevents automatic invoicing from recreating debt for the same deliveries. The partner remains. |

Rates, destinations, business settings, independent admin grants and Clerk
identities are preserved. Deleting a delivery role does not delete a shared sign-in or its admin access.
Active admins automatically receive both operational roles. Deleting one of
their profiles recreates an empty role on their next sign-in; deleted package
and financial data do not return. The confirmation shows this exception.

The operation is permanent. Existing activity logs plus an immutable deletion
audit remain: actor, time, reason, IDs, counts and aggregate financial effect.
Deleted profiles, receipts and paid documents are not copied into that audit.
This is an operational purge, not a full legal identity-erasure workflow.

## Cached data and concurrency

- Deletes run atomically in serializable transactions. Repeat clicks with the
  same request key return the same outcome. A changed preview must be reviewed
  again. Database foreign keys still apply.
- Financial/delete guards remain enabled. A private permit authorizes only
  enumerated record IDs within its originating transaction. Activity, admin
  grants and deletion audits cannot be deleted through that permit.
- Linked `DeliveryCommand` cached responses and reference lists are erased.
  Their keys remain as invalid tombstones, so retrying an old registration,
  payment or assignment cannot resurrect deleted data. Legacy responses without
  reference metadata are conservatively invalidated at the next deletion.
  Unrelated responses with explicit reference metadata remain valid.
- Empty imports, linked notices and queued push messages are removed. The API
  already sends `private, no-store`; affected Next layouts are revalidated.
  Lists, choices, counts, balances and earnings reload from the database. Open
  tabs on the same origin receive a refresh signal; other devices refresh on
  their normal poll. Previously downloaded files or delivered device alerts
  cannot be recalled.

## Private Storage files

Database deletion queues exact private file paths in a durable outbox in the
same transaction. After commit the server calls the Supabase Storage deletion
API. Failed removals stay queued. Unfinished uploads wait at least a minute
before cleanup to avoid racing an upload already in progress.

The super admin can inspect the pending count and select **Retry file cleanup**
in Settings & rates. The existing authenticated `/api/push/dispatch` scheduler
also retries cleanup when it runs. If that scheduler is not configured, use the
manual retry; this feature does not silently install a new schedule. Storage
server credentials are required. The UI reports queued files rather than
claiming their removal succeeded.

## Release

Applied to the configured Supabase database on 18 October 2026. Before/after
fingerprints confirm the 28 existing delivery tables are unchanged. No live
deletion was executed. The updated site still needs a manual commit/push and
Netlify deployment.

Migration `20261018000000_super_admin_deletion` adds only columns, private tables
and scoped guards. It deletes no operational records. Apply it **before**
deploying the updated site, because all new commands record cache references:

```bash
cd /home/ahusan/Desktop/igo/apps/admin
npm run db:deploy
```

Commit/push manually in VS Code as requested. Deploy the updated site, sign in as
the super admin and inspect a preview before using deletion. Previewing is read
only. Private file cleanup uses the existing Supabase server Storage settings.

## Editing currency labels yourself

In `apps/admin/src/lib/delivery/domain.ts`, add `currencyDisplay: "code"` to the
`Intl.NumberFormat` options in `money`. It changes the common `Rf` display to
`MVR`, including the public price cards. Keep `value / 100`: amounts are stored
as integer laari. Commit/push and redeploy to publish that display change.
