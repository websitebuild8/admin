# Implementation and launch requirements

Launch verification remains pending. The initial admin app implements some controls described below; see `architecture.md` and `../apps/admin/README.md` for current coverage. Writing a policy does not implement it. This file separates researched requirements from proposed operational safeguards and unresolved professional determinations.

## Verified sources and launch decisions

| Area | Basis | Required work |
|---|---|---|
| Consumer protection | Official Ombudsman identifies Act 12/2020 and complaint process | Legal review of actual Act/regulations; preserve mandatory remedies and accessible complaints |
| BML payments | Public merchant terms discuss checkout disclosures and restrictions on collecting for third parties | Obtain the current signed terms and written approval for the restaurant marketplace/settlement model |
| Tax records | MIRA publishes tax-invoice requirements | Accountant confirms registration, supplier identities, rates, receipt types, commissions, and credit-note treatment |
| Food establishments | MFDA government registration service references Food Safety Act 6/2024 | Verify participating establishments and expiry dates; obtain advice on iGO's own delivery obligations |
| Account deletion | Apple and Google store policies | In-app deletion initiation, public Google request URL, verified deletion workflow and documented retention exceptions |
| Location/privacy | Platform location and privacy rules | Accurate contextual disclosure, permission flow, provider inventory, store privacy declarations |

Do not assume unverified local e-commerce registration, privacy, employment, vehicle insurance, or sector rules do not exist. Confirm applicable current requirements before launch. No definitive interpretation of untranslated legislation has been made in this package.

## Business information and approvals

- Replace all business/contact/effective-date placeholders; provide real monitored support channels.
- Determine merchant of record, seller of food, delivery supplier, invoice issuer, and money flow. Align terms, bank approval, tax accounting, and restaurant contracts.
- Confirm BML supports the intended card-only checkout, callback/status verification, refunds, and settlement arrangement. Hosted checkout reduces exposure but does not remove merchant security/PCI obligations; confirm scope with BML.
- Confirm commercial registration/licences, delivery operations, applicable consumer/privacy rules, and any required Dhivehi disclosures with a Maldives-qualified adviser. Arrange accurate translations where needed.
- Have an accountant approve GST applicability, rates/effective dates, invoice and credit-note templates, and retention periods. Do not charge GST just because a checkout has a tax field.

## Restaurant and rider agreements

Prepare separate signed agreements after the legal/business model is settled. They are not replaced by customer terms.

Restaurant agreement decisions: branch ownership/authority, registration and food-safety evidence, menu accuracy and allergen information, opening hours, preparation/acceptance expectations, commission and taxes, settlement schedule, responsibility for order failures, refund allocation, dispute procedure, customer-data restrictions, suspension/termination, and licence to use menu photographs/branding.

Rider agreement decisions: employment/contractor status based on actual working conditions, pay and deductions, work authorization where applicable, licence/vehicle/insurance evidence, food handling, safety and accidents, location collection, customer privacy, delivery proof, disputes, suspension/termination, and equipment responsibilities. Do not assume an 'independent contractor' label determines legal classification.

## Software work

- Serve public /terms, /privacy, /cancellation-refunds, /support and /account-deletion pages without admin login. No customer/restaurant web ordering app is required.
- Capture versioned terms acceptance before payment; keep marketing choices separate and optional.
- Make quoted totals immutable for the payment attempt; use integer minor units and server-calculated amounts.
- Enforce verified payment before order submission, webhook authenticity/status checks, idempotency, order recovery, and durable notifications.
- Block customer change-of-mind cancellation after confirmation at the server; retain support cases and admin exception refunds.
- Store refund evidence and immutable financial adjustments; reconcile against the provider, including partial refunds and failures.
- Produce an order receipt and the appropriate supplier tax documents. Where a MIRA tax invoice applies, support supplier identity/TIN, invoice number/date, item details/quantities, net values and tax, plus recipient details as required. Do not imply that one iGO receipt substitutes for every supplier's tax invoice.
- Validate restaurant/rider approval and current branch/assignment access on protected actions. Restrict documents and payout changes; require admin MFA.
- Limit location access by assignment and work state; stop future broadcasts on completion or reassignment; implement retention purge and stale-update handling.
- Implement complaint creation, case references, response targets and escalation, including food-safety incidents and regulator requests. Do not invent statutory response deadlines.
- Implement genuine account deletion, session/device-token revocation, scoped data deletion/anonymization, lawful retention exceptions, and backup expiry. Support access/correction requests.
- Reconcile privacy text against actual SDK telemetry, logs, maps, hosting regions and retention. Avoid card data, document images, and precise coordinates in general logs.
- Add incident response, least privilege, secrets management, backups, restore exercises, audit records, dependency maintenance, and alerting.
- Publish store privacy/data-safety declarations covering every role in the combined app. Provide review accounts for each role without real customer data.

## Required acceptance checks once code exists

1. Failed, abandoned and forged-success payments never submit an order.
2. Duplicate callbacks and repeated checkout taps produce one paid order, not duplicate charges/orders.
3. Unknown payment results do not offer an immediate second charge; reconciliation recovers late success.
4. Successful payment plus a backend crash recovers exactly one order or enters an actionable refund-resolution queue.
5. A changed quote requires new customer acceptance; no silent extra charge or substitution.
6. Customer cancellation is denied after confirmation; legitimate complaint submission remains available.
7. Restaurant rejection of a paid order enters the operational remedy process with no automatic forfeiture.
8. Concurrent refunds cannot exceed the unrefunded paid amount; pending bank refunds are not displayed as completed.
9. Unapproved or suspended partners cannot operate, including using old client screens/tokens against sensitive endpoints.
10. Restaurant A cannot read Restaurant B's orders; customers and unassigned riders cannot access other deliveries.
11. Customer/restaurant modes never start rider background tracking; delivery completion/reassignment ends publication to old viewers.
12. Terms acceptance is unselected by default; accepted versions are recoverable; support/privacy links work before login/payment.
13. Account deletion can be initiated in-app and from the public URL, with verification, explained exceptions, and no unrelated indefinite retention.
14. Receipts reconcile to captured payments; full and partial refunds create matching accounting/tax adjustments.
15. Backups restore successfully and operations can resolve an unaccepted order, payment mismatch, and failed notification.

## Publication gate

No placeholder or draft notice may appear in a production legal policy. A future deployment check should reject unresolved {{PLACEHOLDERS}}, missing policy versions, missing public links, or unconfigured support contacts. Legal/bank/accountant sign-off is an external launch dependency, not something these files claim to have obtained.
