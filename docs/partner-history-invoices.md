# Partner history and manual delivery invoices

In **Partner pages**, the history icon beside each business opens its delivery history. Search by package ID, seller reference or recipient; filter registered, picked-up, completed, cancelled or completed/uninvoiced deliveries. Lists show ten records per page. The summary covers the whole business, independently of the current search or page.

**Create invoice** issues one invoice for all of that partner's completed, uninvoiced deliveries through the server's current timestamp. The preview shows the eligible package count and total. Registered, picked-up, cancelled and already-invoiced packages are excluded. Pending delivery fees are estimates, not outstanding debt. COD collections and partner payouts remain separate.

Creation records the issued debt and immediately makes the invoice visible in the partner's **Invoices**. The admin can review the package lines and total, then click **Send invoice**. Sending adds one private notification to the partner's dashboard and records the sender/time. It does not email the partner. Repeated or concurrent sends do not duplicate the notification. Daily invoices retain their existing automatic notification flow.

The history's **Invoices** tab shows this business's previous invoices, totals, confirmed payments, outstanding balances and manual send status. **View invoice** opens the details; closing those details returns to the business history. Both admin and the invoiced partner can use **Print / save invoice** to open an authenticated document and print or save it as PDF. Screen lists show ten packages; printing includes all packages on that invoice.

The invoice document shows delivery fees, confirmed payments, remaining balance, package references and delivery timestamps in Maldives Time. It uses the existing business/bank settings. Complete the real business identity and beneficiary details before commercial use. It does not calculate GST or claim to be a tax invoice. Its payment balance reflects the ledger when the document is opened; refresh to include subsequent confirmations.

## Data and security

Migration `20261016080000_partner_manual_invoices` allows invoices from either an automatic billing cycle or a manual cutoff, enforced by a database check. A manual invoice never creates a fake daily cycle or advances the partner's next automatic cutoff. Deliveries completed later that day remain eligible for daily invoicing.

Manual issuance shares the invoice scheduler's transaction lock, locks eligible parcels, checks the preview count/total again and uses the existing serializable transaction/idempotency mechanism. Invoice numbers share the same database sequence. The unique invoice-line parcel constraint and SQL eligibility/reconciliation guards remain active. A stale preview is rejected before any charge is recorded; refresh and review the updated total.

`DeliveryInvoiceDispatch` stores one immutable invoice-to-notification record. It has RLS enabled, no public client grants, and a database guard requiring the recipient to be the invoiced partner. Only authenticated administrators can inspect another business's history, create invoices or send them. Partner invoice lists, detail and print pages enforce their own business ID on the server; riders cannot access invoices.

## Deployment and checks

Apply the migration with `npm run db:deploy` before deploying the new code. No new environment variables, storage service or email service are required. Commit and push manually through VS Code.

`npm run delivery:integration` includes these checks in the full disposable-schema suite. To verify only the new invoice workflow, use `npm run delivery:integration -- --partner-invoices`. This still creates the real migration schema and test accounts, then removes the schema; it does not issue invoices or notifications in operational tables. Checks cover full eligible totals, paging, tenant isolation, stale previews, idempotent/concurrent creation and sending, immutable records, private grants, later daily billing, partial payment confirmation and automatic/manual races.

Client component browser tests use fictional data and mocked transport, separately from real database checks. They verify the history icon, search focus, paging, create/review/send controls, sent status, return to history, responsive dialogs and all-package printing. They do not verify a signed-in Clerk browser session.
