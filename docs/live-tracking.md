# Live tracking recommendation

Researched 3 October 2026. Proposed architecture; tracking is not yet implemented. Logo updates are independent of this proposal.

## Recommended starting stack

- MapLibre GL JS for the Next.js admin map; MapLibre Flutter for the single mobile application. Both render the map and moving markers; neither supplies a complete tracking backend. [Web](https://maplibre.org/projects/gl-js/), [Flutter](https://github.com/maplibre/flutter-maplibre-gl).
- Geoapify for hosted OpenStreetMap-based tiles. Its free plan allows commercial production use with required attribution, 3,000 credits/day and up to 5 requests/second. Tile requests cost 0.25 credits, so the theoretical tile-only allowance is 12,000 requests/day. Geocoding and routing share the credits. This is not 12,000 map sessions, and simultaneous viewers can reach the rate limit. [Pricing](https://www.geoapify.com/pricing/), [tile accounting](https://apidocs.geoapify.com/docs/maps/).
- Ably as an initial managed real-time transport. Free includes 6 million messages/month, 200 concurrent connections, 200 concurrent channels and 500 messages/second. It is positioned for proofs of concept; budget for production support and growth. Deliveries to each subscriber count separately. [Plan](https://ably.com/docs/platform/pricing/free), [message counting](https://faqs.ably.com/how-does-ably-count-messages).
- Retain Clerk for identity and Neon for order/assignment state and bounded location snapshots. Do not use database polling for every map animation.

MapTiler's free plan is for non-commercial use or commercial R&D, so it is not the free commercial launch recommendation. OpenStreetMap's community tile server has no SLA and should not be treated as an unlimited delivery-platform backend. Self-hosting regional tiles is possible later, but hosting, bandwidth and maintenance still cost money. [MapTiler terms](https://www.maptiler.com/terms/cloud/), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Implementation sequence

1. Add an admin map centered on the Malé/Hulhumalé operating area, provider attribution, marker clustering, last-update times, and explicit stale/offline states. Validate local streets, bridge access, pickup entrances and address pins in field tests before promising routing accuracy. Map display, address search and route/ETA calculation are separate functions.
2. Add a rider location endpoint authenticated by Clerk. The server derives rider identity and checks approved rider status plus the current assignment. Validate coordinates, accuracy, sequence, timestamp and rate; reject old/out-of-order updates and implausible jumps. Never trust a supplied rider ID or claimed role.
3. While on an active delivery, target an update every 5–10 seconds when moving, slower while stationary. These are engineering starting values, not guaranteed timing. Send latitude, longitude, heading, accuracy, capture time, sequence and assignment version. Use receipt time for freshness, animate only between valid fixes, and label stale positions rather than pretending movement continues.
4. Backend publishes validated fixes to authorized channels. Issue short-lived, narrowly scoped subscription tokens; never expose the Ably server key. Map updates move a marker without reloading map tiles. Reassignment and completion must revoke access promptly: rotate assignment channels and revoke tokens/connections as appropriate, not merely hide UI or wait for token expiry.
5. Customer: only their active order's assigned rider. Restaurant: only riders serving its active orders. Rider: own location and assigned job. Admin: authorized on-duty operations. Stop order subscriptions at completion, expire last-known locations, and establish an explicit minimal retention policy for any history.
6. Flutter rider mode must handle location permissions, Android foreground location service and iOS background location configuration, reconnects, denied permissions, battery saving and screen lock. Customer/restaurant mode does not need background GPS to watch a rider. Android otherwise throttles background updates heavily. Test on physical devices. [Android background limits](https://developer.android.com/develop/sensors-and-location/location/background).

## Capacity example (estimate)

20 riders × 8 hours/day × one update/10 seconds × 30 days = 1,728,000 updates/month. At one publish plus three recipient deliveries, that is about 6,912,000 messages before presence, history and other traffic, above Ably's free message allowance. Geoapify limits are independent. Add quota alerts and controlled degraded states before a paid pilot.

No provider accounts were created, no keys were added and no real rider location was collected for this research. Next integration requires map/realtime credentials and the mobile location producer; the current app remains a labeled demo.
