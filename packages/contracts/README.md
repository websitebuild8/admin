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
