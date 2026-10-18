# iGO Delivery web platform

Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Clerk, Prisma 7 and
Supabase PostgreSQL/private Storage. This package serves the public website and
the current Admin, Partner and Rider portals; it has no restaurant/mobile API.

Read [the root guide](../../README.md), [deployment](../../docs/netlify-deployment.md)
and [launch checklist](../../docs/phase-one-launch.md).

## Local development

Use Node 22. Run commands sequentially to limit CPU use. The production build
uses one worker. Configure ignored `.env.local` from `.env.example`; never replace
an existing file or commit its values.

```sh
npm ci
npm run db:deploy
npm run dev
```

Clerk identifies the user; server-owned approval, admin grants and tenant scope
control access. No demo switch bypasses authentication. `/sign-in` redirects to
the current `/delivery/sign-in` route.

## Verification

```sh
npm test
npm run lint
npm run build
npm run delivery:integration
```

The build includes TypeScript checking and generates Prisma Client. Integration
checks create/remove a disposable database schema. They do not change operational
records or send real rider notifications. `npm run delivery:verify` is different:
it checks the configured operational database and invokes due billing cycles.

## Operational setup

```sh
npm run delivery:storage
npm run delivery:logo-storage
npm run delivery:cron
```

These configure private receipt/logo buckets and named database schedules. See
[Supabase setup](../../docs/supabase-setup.md) and [rider setup](../../docs/rider-web-setup.md)
for required permissions, credentials and separate background-push configuration.
Netlify does not run migrations or install schedules during a build.

The source folder retains the package name `admin` to preserve hosting settings;
it contains all three current workspaces. Applied migration files are immutable
history, not active legacy features. Do not delete or rewrite them.
