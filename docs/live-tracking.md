# Current delivery and tracking implementation

> Latest decision (3 October 2026): continuous rider tracking is removed. Use saved customer/restaurant entrance pins, external Google Maps navigation, and service-area dispatch. See [mobile design](mobile-design.md). Earlier tracking implementation below is historical and must not be connected to mobile.
Updated 3 October 2026. This replaces the earlier plan to show live rider positions to every role.

## Implemented

- Only the authenticated admin workspace receives rider GPS coordinates. Dispatch shows last fix, accuracy and stale status; locations older than two minutes are excluded from nearby offers and map markers. A Google Maps JS browser key enables the admin map. With no key, coordinates are listed and the map is explicitly unavailable. Live admin data refreshes every 15 seconds; no Ably dependency is required for this first version.
- Restaurant: order confirmed → ready for pickup → order picked up.
- Rider: order assigned → arrived at restaurant → order picked up → arrived at customer → delivery complete.
- A shared pickup event updates both flows. Food readiness and restaurant arrival are required; completion cannot skip arrival at the destination. Repeated pickup/completion does not duplicate delivery milestones or counts.
- Confirmation starts nearby dispatch: fresh GPS, approved/verified, online, unoccupied riders only. Search radii are 1 km, 3 km, then 8 km; each wave offers the job to eligible riders within that radius, sorted by distance. Offers expire after 45 seconds. A secured minute-based scheduler advances expired waves; admin can also expand searches manually. No acceptance after expiry or after another rider wins.
- Admin can assign/reassign before pickup. Serializability plus the existing active-rider unique index protect competing updates. Conflicts return HTTP 409; clients refresh before retrying.
- Customer and restaurant responses contain status, rider name, timeline and approximate ETA, never live coordinates or dispatch offers. Assigned riders also receive pickup and destination details for their own jobs.
- Events and recipient inbox notifications are persisted in the same transaction as state changes. Admin can inspect the generated notifications. External push delivery is not connected.
- ETA is an explicitly labeled distance-based fallback: preparation remaining, rider approach, street-distance multiplier and cross-island allowance. It is not a Google road route, traffic prediction or guarantee. Missing/stale data returns an unavailable/updating estimate.

## Mobile API contract

`GET /api/mobile/operations`: role-scoped assigned orders, unexpired rider offers, latest 100 recipient notifications. Native clients use a Clerk bearer session token. This is intended for future Flutter integration; it is not a completed mobile app.

`POST /api/mobile/operations`: commands `preparation`, `delivery`, `accept-offer`, and `location`. All other commands are admin-only. Browser clients must be same-origin; native clients must carry a bearer token. Do not submit a user-selected role as authorization.

GPS command includes `riderId`, `point: {lat,lng}`, `accuracy`, `capturedAt`, and a monotonically increasing `sequence`. Rider ID must match the server-bound identity. Resume sequence from your last successful update; persist it across app restarts. Out-of-order, stale, future, inaccurate and implausible jumps are rejected.

Approved partner identities require both a trusted `clerkUserId` binding on Rider/Restaurant and an Active matching RoleApplication on Profile. Customer order ownership uses Profile.id. Provision these through trusted onboarding; current partner review cards do not create identity bindings. The current resolver selects an approved rider role first, then restaurant, then customer; multi-role account switching remains future work.

## Activation and outstanding work

1. Apply the new Prisma migration to a Supabase development project, then verify concurrent acceptance against a real database. No cloud migration was applied during implementation.
2. Configure Clerk identities/bindings and order/restaurant coordinates from verified onboarding and checkout. No real addresses were geocoded or inserted.
3. Add restricted `NEXT_PUBLIC_GOOGLE_MAPS_KEY`; enable Maps JavaScript billing and limit the key to your admin origins/API. The map is focused on Malé/Hulhumalé; this viewport restriction is not a checkout delivery-zone validator.
4. Add random `CRON_SECRET`. Vercel Pro's configured cron runs every minute. Without deployment/scheduler, only manual dispatch expansion runs. Monitor exhausted searches and failed scheduled calls.
5. Build Flutter role screens, rider location permissions/background collection, recipient inbox polling and push registration/delivery (e.g. FCM). No phone push alerts or device GPS collection happen in the current demo.
6. Replace full-state transaction reads and admin polling with scoped queries/transport before high volume. Add location retention cleanup, operational metrics and real concurrent database tests before launch.

The local demo uses fictional positions and explicit simulated GPS/acceptance buttons. Demo v2 uses separate browser storage from v1. Google Maps and live Clerk/Supabase behavior require credentials and have not been exercised here.

References: [Google Maps markers](https://developers.google.com/maps/documentation/javascript/markers), [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
