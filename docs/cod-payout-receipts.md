> Historical reference only. This feature was retired on 17 October 2026. Its API, portal screens, package fields and mutation commands have been removed. Stored financial records and receipts remain private and read-only. See origin-pricing-and-rider-jobs.md for current operations.

# COD payout receipts

In **Cash on delivery**, a completed partner payout appears as **Remitted to partner** for admin and **Received** for that partner. This status reflects the outgoing payout verified and recorded by admin; it does not introduce a separate partner acknowledgement step.

Admin records the payout using the existing workflow: select eligible delivered COD packages whose cash has been handed over to iGO, choose **Record partner payout**, enter the unique bank payout reference and confirm verification. Saving records the transfer and automatically issues one payout receipt, opens its preview for admin and adds a private partner notification.

The **bill icon** beside a paid-out package opens that payout's receipt for admin or its partner. Packages included in one payout share the same receipt. It contains the receipt number, partner and iGO business details, bank payout reference, payout and receipt timestamps in Maldives Time, total MVR amount, and a package-level breakdown of COD collections. Delivery-fee invoice balances remain separate.

The document is an iGO-generated receipt of the recorded payout. It uses the bank reference entered by admin. This feature does not connect to a bank or attach an original bank-issued transfer slip.

On-screen package lists contain ten items per page. **Print / save PDF** opens an authenticated document page. Use its print button to print or choose the browser's Save as PDF destination. Printing includes every package, even when the screen shows a later page. There is no public receipt URL or public PDF file.

## Persistence and security

- `20261016070000_cod_payout_receipts` adds a private, RLS-protected `DeliveryCodReceipt` table and an index on parcel payout links.
- A deferred database trigger builds the receipt from the completed payout ledger in the same transaction. Amounts and package lines are never accepted from the browser. A failure rolls back the payout and its receipt together.
- The receipt's ID is its unique payout ID. Existing command idempotency and financial constraints prevent duplicate transfers, receipts and package settlement.
- Issued documents are append-only. The stored snapshot freezes partner/issuer details and package lines, so later profile edits do not rewrite the receipt.
- Existing recorded payouts receive receipts during migration. Their original payout timestamp is preserved; receipt issuance uses the migration time and captures the business profile details available then. No new money movement is created.
- Admin can read all payout receipts. Approved partners can read only receipts belonging to their business. Riders, suspended users and other businesses are denied, including the full print route.
- Receipt issuance and payouts have audit records. Internal Clerk administrator IDs are retained in the audit trail rather than exposed to partners in the document.

No new storage service, bank API or environment variable is needed. Business legal-name/registration/support fields use the existing admin settings; keep those accurate before issuing business documents.

## Deployment and verification

Apply the migration with `npm run db:deploy` before deploying the application code. `npm run delivery:verify-payouts` performs a read-only check that recorded payouts have matching receipt headers, package totals and private database permissions.

`npm run delivery:integration` creates and removes a disposable database schema. Receipt checks cover atomic issuance, both authorized roles, foreign-tenant and rider rejection, frozen profiles, append-only records, concurrent retries, exact totals and ten-item pagination with all-package printing data. Unit tests cover role-specific labels and malformed receipt snapshots. Browser component checks use fictional fixtures, separately from authentication/database checks.

The user commits and pushes through VS Code; no automatic Git push or deployment is part of this change.
