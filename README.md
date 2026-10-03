# iGO — agreed product and legal foundation

Status: admin application under development, updated 3 October 2026. The Next.js admin lives in `apps/admin`; the first role-based Flutter design preview lives in `apps/mobile`. Clerk is the identity provider and Supabase/PostgreSQL is the database. No live BML integration or deployed legal pages exist yet. These files do not certify legal compliance.

- [Admin setup and capabilities](apps/admin/README.md)
- [Current architecture and implementation limits](docs/architecture.md)

- [Product and checkout specification](docs/product-and-checkout.md)
- [Draft customer terms and privacy notices](docs/legal-drafts.md)
- [Implementation and launch requirements](docs/launch-requirements.md)
- [Research sources and limits](docs/sources.md)

Agreed scope: one Flutter app with approved customer, restaurant, and rider modes; an admin-only Next.js web dashboard; one shared backend. Customers pay by card through BML before an order is submitted. No bank-transfer checkout, cash on delivery, or wallet. No customer change-of-mind cancellation after verified payment and confirmation; support and valid remedies remain available.

All `{{PLACEHOLDERS}}` are intentional. Business registration is in progress. Do not publish these drafts until business identity, payment arrangements, tax treatment, privacy practices, and legal review are complete. Public policy/support/account-deletion pages are informational companions to the native app, not additional customer or restaurant web apps.

- [Mobile preview setup](apps/mobile/README.md)
- [Latest mobile design and navigation decisions](docs/mobile-design.md)
