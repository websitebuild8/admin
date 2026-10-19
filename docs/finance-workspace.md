# Admin Finance workspace

Open **Finance** in the Admin navigation, or **Finance & exports** from Overview,
Reports or Partner pages. A partner's **Finance** button opens the same workspace
filtered to that business. Old Admin Invoices and Bank transfers URLs redirect to
the matching Finance tab. Partner navigation and access remain unchanged.

## Invoice and transfer review

- **Invoices**: search by invoice/business, filter unpaid, partially paid, awaiting
  verification, paid or all outstanding invoices. Open invoice, Transfers and History
  go directly to the matching invoice dialog tab. Existing print/save, send invoice,
  send paid invoice, package breakdown and complete history remain available.
- **Bank transfers**: filter pending, confirmed, partial or rejected submissions.
  Each row links to its invoice, private receipt and history; pending rows expose
  Verify transfer. Verification still requires checking the bank and an explicit
  confirmation. The dialog identifies the invoice and business being reviewed.
- **Completed deliveries**: delivered packages only, with rider/time, saved fee,
  invoice and billing/payment status. Awaiting billing and Invoiced filters separate
  delivered work that has not yet entered an invoice.

The date selector uses invoice issue date, transfer submission date or delivery
completion date according to the tab. Verified payments use bank review date.
Outstanding and pending-review shortcut cards always include all dates for the
selected partner; pressing either resets the period to All time. Search affects
the table, not the partner/date summary cards. Every table page contains at most ten
records. On phones, key status/actions stay visible; invoice dialogs hold the full
financial detail. Light, Dark and System appearance are supported.

## Download reports

**Deliveries CSV** exports the complete set of completed deliveries for the selected
partner and delivery-completion period, across every page. It includes package and
business references, customer/address, pickup, origin/destination, rider/attribution,
timestamps, saved fee, invoiced fee and linked invoice status.

**Finance Excel** contains:

1. Summary: selected delivery fees and uninvoiced fees, plus related invoice totals,
   verified payments, outstanding and pending evidence.
2. Deliveries: one row per completed package in the chosen scope.
3. Invoices: one row per related invoice, including full totals and send/paid dates.
4. Transfers: one row per bank submission associated with those invoices, including
   status, submitted/verified amounts, review details and receipt reference.

Exports use partner and date scope; table search/status/page do not limit the report.
Related invoices/transfers are included in full even if they also concern packages
outside the selected delivery period. Summary labels state this distinction. Payments
settle invoices; the report does not invent a paid amount for individual packages.
Pending/rejected submissions do not reduce outstanding. Fees use integer laari in
the database and numeric MVR cells in Excel. Dates display Maldives Time (UTC+5).
CSV protects formula-like text and quotes delimiters/newlines; XLSX stores user
text as literal strings. Leading-zero references remain strings in XLSX.

Downloads are created on request from a repeatable-read database snapshot, require
live administrator authorization, and use private/no-store responses. They do not
include storage paths or reusable signed receipt links. Exports are limited to
10,000 delivered packages and 20,000 related transfers per request; larger reports
fail explicitly and ask for a narrower period/partner. Five download requests per
administrator per minute are allowed. No third-party reporting service is required.

## Release and checks

No migration or new environment variable is needed. The existing Clerk/Supabase
configuration, bank receipt storage and invoice scheduler remain in use. Commit/
push and redeploy Netlify manually.

Run from `apps/admin`:

```sh
npm test
npm run delivery:integration -- --finance
npm run lint
npm run build
```

The integration target uses a disposable schema and fictional deliveries/receipts;
it does not alter operational financial records or send real payments. Browser
component fixtures do not replace a production sign-in and private-storage check.
