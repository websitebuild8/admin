# Delivery platform launch checklist

Updated 19 October 2026. The current seller-delivery website is the only active
application. See [architecture](phase-one-delivery.md), [setup](supabase-setup.md),
[Netlify deployment](netlify-deployment.md), [retirement](legacy-retirement.md)
and the dated [verification record](verification.md).

## Setup

Use Node 22 and the private values listed in `apps/admin/.env.example`. Run
`npm ci`, `npm run db:deploy`, `npm run delivery:storage`,
`npm run delivery:logo-storage` and `npm run delivery:cron` from `apps/admin`.
Configure Clerk production identity/domain before launch. Keep database/Storage
secrets server-only and preserve the public database CA. Migrations and schedules
are separate from the Netlify build. Optional embedded Google Maps and background
push setup is documented in [rider setup](rider-web-setup.md).

Run `npm test`, `npm run lint`, `npm run build` and
`npm run delivery:integration` sequentially. The integration suite uses disposable
fixtures; `delivery:verify` instead invokes real due invoicing. No deployment,
legal approval or device notification is established by passing automated checks.

## First operating setup

1. Sign in with an explicitly allowlisted admin ID; open `/delivery/settings`.
2. Enter the actual registered business identity, contact details and receiving
   bank beneficiary. They intentionally start blank, not as fictional values.
3. Confirm route fees and partner cutoffs. Fees freeze at package registration;
   later edits affect future packages only.
4. Submit the public business form at `/join`; inspect its logo, contact and
   pickup details under `/delivery/applications`, approve it, and explicitly
   send its setup invitation. The owner sets a password through Clerk and opens
   `/partner`. Test rejected and suspended accounts too. Driver registration
   remains separate at `/driver/join`. See [partner onboarding](partner-onboarding.md)
   for the private logo bucket, invitation configuration and verification boundaries.
5. Use clearly identified test parcels with permission from the account owners.
   Register/import, assign, open collection list, tick a package, then explicitly
   confirm physical receipt. Ensure unselected packages remain registered.
6. Complete a delivery after physical receipt by the recipient. Check driver
   attribution, UTC+5 timestamps, partner notification and admin list.
7. At cutoff, verify one invoice containing delivered packages only. Check an
   older unpaid invoice remains outstanding after the next cycle. Use the job
   history and Settings scheduler health; a manual run is not a scheduled run.
8. Submit a test receipt only for a real, explicitly authorized test transfer.
   Confirm pending evidence leaves debt unchanged. Verify the bank record before
   admin confirmation. Test partial/rejected evidence and duplicate requests.
9. Verify the full delivery-fee payment, send its paid invoice from admin, and
   check partner payment history. Recipient goods payments are not collected.
   This software records verified payments; it does not initiate bank transfers.
10. On a phone, check driver collection/delivery cards, checkbox targets, dialogs,
    navigation and connection errors. Check desktop admin tables and pagination.

## Required business and release decisions

- [ ] Registered legal name/number/address, support contact and receiving account.
- [ ] Approved partner service agreement, driver operating agreement, privacy
      notice and recipient-data handling. Publish only reviewed seller-delivery policies; the retired food-ordering
      drafts are removed.
- [ ] Confirm GST/tax applicability, tax-inclusive/exclusive rate presentation,
      invoice requirements and any statutory retention with a Maldives adviser.
      Current invoices record delivery charges; they do not calculate GST or claim
      to be tax invoices. No fictional tax registration is displayed.
- [ ] Define prohibited/restricted goods, package limits, boat handoff responsibility,
      damage/loss claims, failed deliveries/returns, fee disputes and support response.
      This initial workflow supports registered → picked up → delivered and cancellation
      before pickup. It does not invent a delivery-failure or refund ledger.
- [ ] Agree delivery-fee bank verification, invoice handling and overdue debt collection.
- [ ] Choose database backup/restore arrangements for the actual Supabase plan;
      perform a restore drill. Choose recovery targets, alerts and incident owners.
- [ ] Decide retention for recipient addresses/phones, receipts, audit and financial
      evidence. Unsubmitted receipt uploads currently remain private; there is no
      automatic retention/deletion job for them. Review them operationally until an
      approved retention policy is implemented. Super-admin permanent deletion
      is explicitly enabled by the owner; review its full financial impact and
      reason before confirming. See [deletion controls](super-admin-deletion.md).
- [ ] Confirm available hosting/database/Storage quotas and domain costs. Free
      plans are not a capacity guarantee; monitor errors, storage and scheduler runs.
- [x] Complete actual Clerk admin sign-in and admin browser acceptance checks.
- [ ] Register separate partner and driver accounts, approve them and complete
      their signed-in browser walkthroughs. No public test accounts were silently added.
- [ ] Complete hosted Netlify runtime and deployment acceptance checks.

## Operational boundaries

Notifications are a private in-app inbox, refreshed while the page is visible.
Rider background push uses browser permission, configured VAPID keys and the
retry outbox. Email, SMS, WhatsApp and Facebook/Instagram order ingestion are not
integrated. Riders use saved addresses with Google Maps directions. This phase
does not add live rider tracking. Recipient goods payments are not collected.
Delivery-fee bank verification remains a manual, auditable admin action.

Invoices are immutable: corrections need an agreed credit-note/adjustment workflow
before being supported in software. Do not edit issued SQL records to compensate
for mistakes. Unpaid balances are derived from invoice totals less confirmed
allocations. Pending delivery charges, pending receipts never count as
settled invoices. Maintain a support process for exceptions before commercial use.
