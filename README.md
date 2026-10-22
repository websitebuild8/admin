# iGO Delivery

Responsive delivery management for online sellers in the Maldives. The current
web platform includes Admin, Partner and Rider workspaces backed by Next.js,
TypeScript, Tailwind, shadcn/ui, Clerk, Prisma and Supabase PostgreSQL/Storage.
Currency is MVR; dates and invoice cutoffs use Maldives Time (UTC+5).
Phones use the same responsive website, including browser notifications and
Google Maps directions. There is no native app build or separate mobile toolchain.
Tables show every permitted field as labeled rows on narrow screens; desktop
columns and invoice printing retain their table layout.

- Public website and applications: `/`, `/join`, `/rider/join`
- Administration: `/delivery`
- Partner workspace: `/partner`
- Rider workspace: `/rider`

Partners register or import packages. Riders claim/receive assignments, explicitly
confirm physical pickup, and complete deliveries. Only delivered packages are
invoiced. Only admin-verified delivery-fee transfers reduce debt. The platform
does not collect recipient goods payments or track live rider GPS.

## Development

Use Node 22, then run these from `apps/admin`:

```sh
npm ci
cp .env.example .env.local
# Configure private values before migrating or starting the platform.
npm run db:deploy
npm run dev
```

Never overwrite an existing `.env.local`. Keep credentials outside Git.
The current protected super-admin IDs remain in the server environment; only
super admins grant administrator access. Active admins can switch between all
three workspaces; ordinary users receive only their approved role.

## Guides

- [Architecture and operating rules](docs/phase-one-delivery.md)
- [Setup and launch checklist](docs/phase-one-launch.md)
- [Netlify deployment](docs/netlify-deployment.md)
- [Supabase setup](docs/supabase-setup.md)
- [Partner onboarding](docs/partner-onboarding.md)
- [Rider website, directions and background alerts](docs/rider-web-setup.md)
- [Pricing and rider self-assignment](docs/origin-pricing-and-rider-jobs.md)
- [Administrator controls](docs/admin-access-and-workspaces.md)
- [Date filters](docs/date-period-filters.md)
- [Legacy removal and database migration](docs/legacy-retirement.md)
- [Verification record](docs/verification.md)

The retired restaurant dashboard, native mobile project and their APIs are
removed. Applied Prisma migration history remains intact so existing and fresh
databases can reach the current schema safely. Business identity, policies,
production credentials and operational acceptance remain launch requirements.
