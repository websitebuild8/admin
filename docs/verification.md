# Admin verification

Checked 3 October 2026 against the local demo.

- Eight domain tests pass: schema contract, payment guard, sequential fulfilment, required rider, double assignment prevention, partner verification, refund reservation limits, and attributable immutable updates.
- ESLint passes. Production compilation and TypeScript checks pass with one build worker.
- Browser checks: order progression, available rider assignment, blocked approval before verification, simulated restaurant approval, invalid email rejection, and demo reset.
- Desktop and narrow layouts inspected. No browser console errors observed during these checks.
- The live admin state endpoint returns HTTP 403 while demo mode is active.

These checks do not validate external Clerk sessions, Neon connectivity, applied migrations, BML transactions, real document verification, mobile role access, or legal compliance. Those require the corresponding credentials, integrations, and launch review. See the architecture and launch checklist.

## Ten-item pagination

Type checking, lint, and the production build pass after adding shared display pagination to orders, restaurants, riders, customers, payments, refund reviews, support, and activity. Browser checks confirmed 10 then 3 rows for 13 orders/payment records, a disabled final-page Next button, search/filter reset from page two, empty-result controls, and pagination summaries on every remaining list. Desktop and narrow layouts were checked. CSV exports retain the full filtered result set. Server-side query pagination remains a separate scaling task.
