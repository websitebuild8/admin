# Date filters across delivery workspaces

Admin, Partner and Rider workspaces share **All time**, **Daily**, **Monthly**
and **Yearly** filters. All time is the default. Choose a period, change the
date/month/year if needed, then press **Apply**. Calendar windows begin at
midnight Maldives Time (UTC+5) and exclude the next window's first instant.
Leap days and year changes use calendar arithmetic rather than fixed months.

The selected period appears in the URL on main pages, so refresh, browser
Back/Forward and copied links retain it. Status filters compose with dates.
Changing either resets pagination, search and checkbox selection; lists stay
limited to ten items per page. Dashboard package cards carry their period to
the matching list. The total-balance card always opens all outstanding invoices.

| Data | Date used |
| --- | --- |
| All/registered/pending/cancelled packages, available jobs, collections | Package registration |
| Picked-up packages and rider on-board deliveries | Pickup confirmation |
| Completed deliveries and packages awaiting billing | Delivery confirmation |
| Invoices | Issue date, including manually issued invoices |
| Transfers | Submission date; displayed amounts still reflect current verification |
| Earned income | Actual verification date of allocated delivery-fee payments |
| Partner/rider directories | Account registration |
| Partner applications | Application submission |
| Administrator history | Most recent admin-access grant |
| Notifications and activity | Creation/event date |
| Invoice timeline | Each immutable event's occurrence date |

Overview pending counts use registration date, and completed counts use delivery
date. Earnings follow the same selected period. Operational CSV exports identify
the reporting period and explicitly label total outstanding debt as all time.
Rider summary counts and their linked collection, on-board and completed lists
use the same period. Existing `period=TODAY` history links remain supported.

## Financial safeguards

The total outstanding balance includes all unpaid invoices, including older
ones outside the selected period. Date-filtered invoice lists provide a link to
all outstanding invoices. A filter does not recalculate or rewrite an issued
invoice, verified payment, receipt, paid copy or original audit record. Opening
an invoice still displays its complete package lines and amounts.

The admin's partner-history dialog filters both deliveries and invoice history.
Its **Ready to invoice** total and **Create invoice** action cover all delivered,
uninvoiced packages across all dates. Its labels state this explicitly. Display
filters cannot silently narrow that existing financial operation. The partner's
full outstanding balance also remains visible there.

All filters execute on the server with the existing role and tenant constraints.
No partner or rider can supply a different partner ID to escape their own scope.
Invalid, impossible and future periods are rejected. Configuration screens show
current settings and rates rather than implying historical versions exist.

## Verification and release

Unit coverage includes UTC+5 boundaries, leap days, URL/status composition,
legacy links and invalid/future periods. The isolated database suite is:

```bash
cd /home/ahusan/Desktop/igo/apps/admin
npm run delivery:integration -- --reporting-periods
# Includes card links and compatibility with older requests (10 checks):
npm run delivery:integration -- --dashboard-and-periods
```

It checks actual Prisma queries, scoped financial totals, pagination, invoice
documents, milestone dates, nested timelines and authorization. It uses a
disposable schema which is removed afterward. Browser previews use fictional
data and replacements for Clerk and Next navigation; they do not establish
hosted authentication or a deployment.

No database migration, environment variable or new external service is required.
Commit/push manually in VS Code and redeploy Netlify to publish the changes.
