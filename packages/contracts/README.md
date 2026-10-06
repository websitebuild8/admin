# Shared API contracts

The admin backend and Flutter application share the existing `/api/mobile/v1/*`
and `/api/mobile/operations` contracts. Server validation lives in
`apps/admin/src/lib/mobile-contract.ts` and fulfilment/domain validation files;
Flutter serialization is in `apps/mobile/lib/mobile_api.dart`, `models.dart` and
`places_lookup.dart`. An OpenAPI-generated Dart client remains future work.

Clerk supplies identity; Supabase holds roles, approvals, addresses and orders.
Bearer tokens are verified before ownership/approval checks. Mobile apps never
receive database credentials, Clerk server secrets or the Google Places key.

`POST /api/mobile/v1/places` accepts `search` (area, input, UUID session token) or
`resolve` (area, place ID, same session token). Search returns at most five transient
suggestions; resolve returns coordinates and signed `google` expiry metadata.
Address registration/save preserves that metadata. Changing an entrance manually
uses user-provided coordinates. Unknown areas, unverified accounts and expired or
altered provider leases are rejected. See [Maps setup](../../docs/google-maps-setup.md).

`GET /api/mobile/v1/catalog` accepts page, optional restaurant ID, `q`, and cuisine
(`All`, `Coffee`, `Maldivian`, `Pizza`). Search/filtering precedes ten-row pagination.
The server owns prices, fees, payment status, order identity and workflow state;
registration is a role application and never grants administrative permissions.

## Menu management and customer order maps — 7 October 2026

`GET /api/mobile/v1/menu` accepts `q`, `stock` (`All`, `Available`, `Out of stock`)
and page. Filtering runs before ten-row pagination; `itemCount` and `availableCount`
are scoped to the approved restaurant. Menu items now have a category, default General.
`POST /api/mobile/v1/menu` creates/edits full item details. `POST .../menu-stock`
accepts only `{id,available}` and `POST .../menu-delete` accepts only `{id}`.
Every mutation derives the restaurant ID from the authenticated approved role,
returns 404 for another owner's item, and preserves existing order snapshots.
BML activation must revalidate current quote/item availability before collecting money.

Restaurant-specific catalog requests also accept `category`; available categories
are returned for the whole restaurant, with filtering before pagination.
Customer operation payloads include `entrances: {pickup,destination}` for the
customer's own orders only. These are fixed saved endpoints, never device GPS.
Restaurant payloads do not receive coordinates. Assigned rider job payloads remain
restricted to that assigned rider. The customer status screen subscribes to the
workspace's foreground polling; background push is unfinished.

## Shared demo contract

Demo traffic uses `/api/demo/mobile/{resource}`, a private session bearer key and
`X-iGO-Demo-Role: customer|restaurant|rider`. It cannot authenticate to real APIs.
`account` and quotes identify `demo: true` and `demoCheckoutEnabled: true`; actual
`paymentsEnabled` stays false. POST `checkout` accepts only `{quoteId}` and returns
one pending simulator attempt. POST `demo-payment` accepts only
`{attemptId, outcome: Approved|Declined|Cancelled}`. Only Approved produces one
`DEMO-…` order in an isolated session. Replays return its original final result;
declines and cancellations produce no order. No amounts, paid flags, ownership,
card numbers or bank credentials can be supplied by a client. All keys stay out
of URLs, build files and source control. See ../../docs/demo-purchases.md.
