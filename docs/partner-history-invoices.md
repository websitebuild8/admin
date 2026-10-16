# Partner history and manual delivery invoices

From the **admin dashboard**, select **Partner deliveries & invoices**, or open **Partner pages** in the admin sidebar. The **Deliveries & invoices** button beside each business opens its delivery history. Search by package ID, seller reference or recipient; filter registered, picked-up, completed, cancelled or completed/uninvoiced deliveries. Lists show ten records per page. The summary covers the whole business, independently of the current search or page. Invoice creation and sending are admin actions; partners can view and pay only their own invoices.

**Create invoice** issues one invoice for all of that partner's completed, uninvoiced deliveries through the server's current timestamp. The preview shows the eligible package count and total. Registered, picked-up, cancelled and already-invoiced packages are excluded. Pending delivery fees are estimates, not outstanding debt. COD collections and partner payouts remain separate.

Creation records the issued debt and immediately makes the invoice visible in the partner's **Invoices**. The admin can review the package lines and total, then click **Send invoice**. Sending adds one private notification to the partner's dashboard and records the sender/time. It does not email the partner. Repeated or concurrent sends do not duplicate the notification. Daily invoices retain their existing automatic notification flow.

## Payment status and paid invoices

Both dashboards show **Unpaid**, **Awaiting verification**, **Partially paid** or **Paid**. Pending transfers do not reduce the outstanding balance. Rejected transfers remain in history. Partial verification credits only the amount admin actually confirmed. A fully settled invoice stays Paid even if another duplicate submission is still pending review.

Open an invoice's **Payments** tab to view every transfer and private proof, ten per page. Admin can choose **Verify payment** there or in Bank transfers, compare the evidence against bank records, and confirm or reject it. After saving, the invoice reopens with its updated status. No bank API is connected and a receipt upload is never automatic payment confirmation.

Full verified settlement automatically creates one immutable **paid invoice** for the original invoice number. It records the issue and settlement times, package details, verified bank references and exact confirmed amounts. Admin can choose **Send paid invoice** to add a private dashboard notification; the send time is tracked separately from payment status. Sending cannot mark an unpaid invoice as paid or credit it again. Both roles can open **View paid invoice / PDF** and print all package and payment lines, while on-screen tables stay at ten per page.

The **Full history** tab contains the invoice issue, manual sends, every payment submission, rejection or verification, full settlement and paid-invoice send. Its append-only events are paginated on the server. The open invoice refreshes with the workspace's existing 30-second foreground refresh. Closing and reopening it also loads the latest records.

The admin overview's **Total earned by iGO** card is all-time verified delivery-fee payments received. Unpaid charges, unverified submissions and recipient COD belonging to partners are excluded. It is a received-fee total; rider salaries and other expenses are not deducted.

The history's **Invoices** tab shows this business's previous invoices, totals, confirmed payments, outstanding balances and manual send status. **View invoice** opens the details; closing those details returns to the business history. Both admin and the invoiced partner can use **Print / save invoice** to open an authenticated document and print or save it as PDF. Screen lists show ten packages; printing includes all packages on that invoice.

The invoice document shows delivery fees, confirmed payments, remaining balance, package references and delivery timestamps in Maldives Time. It uses the existing business/bank settings. Complete the real business identity and beneficiary details before commercial use. It does not calculate GST or claim to be a tax invoice. Its payment balance reflects the ledger when the document is opened; refresh to include subsequent confirmations.

## Data and security

Migration `20261016080000_partner_manual_invoices` allows invoices from either an automatic billing cycle or a manual cutoff, enforced by a database check. A manual invoice never creates a fake daily cycle or advances the partner's next automatic cutoff. Deliveries completed later that day remain eligible for daily invoicing.

Manual issuance shares the invoice scheduler's transaction lock, locks eligible parcels, checks the preview count/total again and uses the existing serializable transaction/idempotency mechanism. Invoice numbers share the same database sequence. The unique invoice-line parcel constraint and SQL eligibility/reconciliation guards remain active. A stale preview is rejected before any charge is recorded; refresh and review the updated total.

`DeliveryInvoiceDispatch` stores one immutable invoice-to-notification record. It has RLS enabled, no public client grants, and a database guard requiring the recipient to be the invoiced partner. Only authenticated administrators can inspect another business's history, create invoices or send them. Partner invoice lists, detail and print pages enforce their own business ID on the server; riders cannot access invoices.

`20261016090000_paid_invoice_history` runs atomically and adds private `DeliveryPaidInvoice`, `DeliveryPaidInvoiceDispatch` and `DeliveryInvoiceEvent` tables. Deferred database issuance reconciles the paid copy against frozen package lines and confirmed allocations. Database triggers capture the timeline for automatic invoicing and manual payment actions. Snapshot, send and history rows are append-only; notification recipients must match the invoiced business.

Existing settled invoices receive paid copies during migration, preserving their original payment times and references and using the business profile available at migration time. The migration records this issuance in history and the audit log. It creates no payment or debt change and sends no partner notification. Admin may send the copy afterwards. An issued paid copy preserves its details after later profile edits. Current balance views remain based on the live verified-payment ledger.

## Deployment and checks

Apply the migration with `npm run db:deploy` before deploying the new code. No new environment variables, storage service or email service are required. Commit and push manually through VS Code.

`npm run delivery:integration` includes these checks in the full disposable-schema suite. To verify only the new invoice workflow, use `npm run delivery:integration -- --partner-invoices`. This still creates the real migration schema and test accounts, then removes the schema; it does not issue invoices or notifications in operational tables. Checks cover full eligible totals, paging, tenant isolation, stale previews, idempotent/concurrent creation and sending, immutable records, private grants, later daily billing, partial payment confirmation and automatic/manual races.

Use `npm run delivery:integration -- --paid-invoices` for settlement, paid-copy sending, historical access and immutability checks, or `npm run delivery:integration -- --paid-migration` to create invoices and verified payments before applying the new migration in isolation. Connection and statement timeouts keep interrupted verification runs from waiting indefinitely.

Client component browser tests use fictional data and mocked transport, separately from real database checks. They verify the history icon, search focus, paging, create/review/send controls, sent status, return to history, responsive dialogs and all-package printing. They do not verify a signed-in Clerk browser session.
