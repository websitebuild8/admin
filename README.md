# iGO Delivery

Phase 1 is the responsive seller delivery website for Facebook/Instagram businesses,
with approved partner, driver and admin workspaces. Next.js, Clerk, Prisma and
Supabase remain the shared stack. COD collection and partner payouts are separate
from daily delivery-fee invoices. Mobile/restaurant work is preserved for Phase 2.

- [Phase 1 architecture and business rules](docs/phase-one-delivery.md)
- [Phase 1 deployment, verified checks and launch gates](docs/phase-one-launch.md)
- [Rider website, Google Maps and background alert setup](docs/rider-web-setup.md)

The public website is `/`, admin uses `/delivery`, partners use `/partner`,
and riders use `/rider` (apply at `/rider/join`). Preserved
Phase 2 administration is `/legacy`. No deployment or legal approval is implied
by the presence of this code. Business/legal/bank details remain launch inputs.

## Preserved Phase 2 references

The following documents describe the earlier restaurant/mobile product. Its
card-only checkout rules do not apply to Phase 1 seller COD and bank invoices.

- [Admin setup and capabilities](apps/admin/README.md)
- [Shared demo purchases and simulated bank gateway](docs/demo-purchases.md)
- [Current architecture and implementation limits](docs/architecture.md)

- [Product and checkout specification](docs/product-and-checkout.md)
- [Draft customer terms and privacy notices](docs/legal-drafts.md)
- [Implementation and launch requirements](docs/launch-requirements.md)
- [Research sources and limits](docs/sources.md)

Agreed scope: one Flutter app with approved customer, restaurant, and rider modes; an admin-only Next.js web dashboard; one shared backend. Customers pay by card through BML before an order is submitted. No bank-transfer checkout, cash on delivery, or wallet. No customer change-of-mind cancellation after verified payment and confirmation; support and valid remedies remain available.

All `{{PLACEHOLDERS}}` are intentional. Business registration is in progress. Do not publish these drafts until business identity, payment arrangements, tax treatment, privacy practices, and legal review are complete. Public policy/support/account-deletion pages are informational companions to the native app, not additional customer or restaurant web apps.

- [Mobile preview setup](apps/mobile/README.md)
- [Latest mobile design and navigation decisions](docs/mobile-design.md)

- [Google Maps search, credentials and retention](docs/google-maps-setup.md)
