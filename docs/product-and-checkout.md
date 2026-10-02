# Product and checkout specification

Version: draft-2026-09-29. This specifies required behavior; it is not implemented application code.

## App structure and registration

One Flutter application contains separate customer, restaurant, and rider modules. Only admin uses a Next.js / TypeScript / Tailwind / shadcn/ui dashboard. All interfaces use one backend and identity system.

Customer accounts can order after account verification. Restaurant and rider applications require admin approval. Application states: draft, submitted, needs_information, approved, rejected. Operational access states: active, suspended. Approved users can switch between their permitted modes. Customer access is independent of a pending partner application.

Restaurant staff use individual accounts and branch-scoped invitations. Owners and kitchen staff have different permissions. Rider offers disclose only necessary information; full delivery details require assignment. The backend checks current membership/assignment on each protected operation. Clients cannot write their approval or role. Clear cached role-specific data and subscriptions when switching modes or signing out.

## Payment policy

- Customer checkout supports card payment through the BML-approved integration only.
- Remove Wallet, bank transfer, cash, balance, top-up, and transfer receipt upload from checkout.
- Do not equate BML merchant settlement bank details with customer bank-transfer payment support.
- Use bank-supported hosted card entry; never send card numbers, CVVs, or bank authentication codes to iGO servers, analytics, crash reporting, or logs.
- Show only card brands and methods enabled by the merchant agreement. Confirm BML can restrict the chosen checkout to cards before launch; do not claim that every BML product is card-only.
- No saved-card feature initially. Never invent BML endpoints or notification signatures; implement against the bank-approved current specification.

## Checkout screen

Show restaurant and branch, item quantities and modifiers, address/entrance pin, estimated delivery range, subtotal, discount, delivery fee, any service fee, applicable tax breakdown, currency MVR, and final total before payment.

Payment row: **Card via BML**

Primary action: **Pay MVR {total} & place order**

Unchecked required acknowledgement:

> I agree to the Terms and Cancellation & Refund Policy. Once payment is verified and my order is confirmed, I cannot cancel for a change of mind. This does not affect remedies for order problems or rights provided by law.

Link both policies next to the acknowledgement. Link the Privacy Notice separately; do not bundle optional marketing consent into purchase acceptance. The server records policy versions, content hashes, checkout ID, user ID, acceptance time, and locale. Preserve the accepted versions. Minimize device/IP collection and disclose any evidence retained.

Before paying, customers may change or abandon an unpaid checkout. If a payment is already processing, resolve that attempt before starting another one.

## Server flow

1. Authenticate customer; validate branch opening hours, stock, delivery zone, address, and current prices. Produce a short-lived quote and reserve availability where supported.
2. Snapshot items, prices, address, taxes, fees, and policy versions in a pending checkout. This is not a submitted restaurant order.
3. Create a payment attempt linked to the checkout using an idempotent operation. Hold BML credentials only on the server.
4. Open the bank-approved card checkout. A browser return or app deep link can trigger a status refresh but cannot prove payment success.
5. Verify the provider result using BML's documented notification authentication and/or server status lookup. Check merchant, transaction reference, amount, currency, and successful payment state.
6. Atomically record verified payment, create/confirm exactly one order, and save a durable event for restaurant notification. Unique constraints on provider transaction and checkout-to-order linkage prevent duplicates.
7. Return the order reference. The restaurant sees the order only after this transition. Its operational acceptance is a separate event from paid order submission.
8. Retry notification via the outbox worker. Reconcile unresolved attempts with the bank. Never initiate another charge simply because a response was lost.

Payment states: created, pending, unknown, succeeded, failed. Refunds have separate requested, processing, succeeded, failed states and amounts; partial refunds do not overwrite original payment history.

Fulfilment states: awaiting_restaurant, accepted, preparing, ready, assigned/pickup milestones, out_for_delivery, delivered; operational rejection/failure/cancellation are separately recorded. Customer cancellation after confirmation is denied by the API as well as absent from the UI.

On paid-but-unavailable or expired checkouts, do not silently change the price or substitute items. Route to operations for prompt resolution and any applicable refund. If the entire order cannot be fulfilled by the service, the proposed business policy is to refund the full paid order total, including delivery/service fees. Bank processing and tax adjustments must follow the approved arrangement.

If submission fails after a successful charge, recover the order idempotently. Until resolved show **Payment received — confirming your order**, not a failed-payment screen inviting a second charge. Alert operations if recovery exceeds the configured threshold.

## Post-confirmation UI

Show status, receipt, tracking when available, and **Get help with this order**. Do not expose a change-of-mind cancellation or instant-refund button. Support categories include missing/incorrect item, not delivered, food safety, duplicate charge, and payment issue. A complaint is not automatically rejected because the customer accepted the cancellation policy.

Customer-facing states:

- Pending: **Verifying your payment. Please do not pay again.**
- Verified and submitted: **Order confirmed. Waiting for the restaurant to accept.**
- Failed: **Payment was not completed. Your order has not been submitted.** Use only when failure is established.
- Problem: **There is a problem with your order. Our support team is reviewing it.**
- Refund initiated: **Your refund is processing. Bank posting times vary.**

## Admin controls

Queues: paid orders awaiting acceptance, paid checkouts without orders, unknown payments, rejected orders, delivery failures, complaints, refunds, and settlement mismatches.

Refund permission is separate from general support access. Require reason, eligible amount, original payment reference, idempotency key, audit history, and bank confirmation. Prevent refunds exceeding the remaining refundable amount, including concurrent requests. Show pending refunds until actually confirmed. Do not route refunds to a customer's alternative bank account by default.

Keep the original ledger immutable; corrections create linked entries. Customer cancellation restrictions cannot remove legally required remedies or bank dispute rights.

## Tracking and deletion

Request customer location only for address selection, with a manual alternative. Explain rider tracking before requesting permission. Publish customer-visible rider position only during the relevant delivery; stop on completion, reassignment, or cancellation. Make online/active tracking visible, reject stale uploads, and handle role switching explicitly. A completed delivery must stop future publication even if a viewer retains an old connection.

Include account-deletion initiation in app settings and a functional public web request path. Authenticate requests, revoke sessions, delete or anonymize unnecessary data, and preserve only records with a documented retention basis. Do not treat permanent deactivation as deletion. An active dispute must not justify indefinite retention of unrelated profile/location data.
