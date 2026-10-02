# Shared API contracts

The admin and future Flutter application will use the same versioned backend contracts. Domain validation currently lives in `apps/admin/src/lib/domain.ts`. Extract it into a workspace package when the mobile API is introduced; publish OpenAPI and generate a Dart client rather than attempting to import TypeScript into Flutter.

Clerk is the identity provider. Neon PostgreSQL holds business roles, approvals, memberships and orders. Client registration is a role application, never an authorization grant. Mobile apps must not connect directly to PostgreSQL or hold Clerk secret keys.
