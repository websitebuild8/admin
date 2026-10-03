# Mobile design and current product direction

3 October 2026. The user's attached original iGO mockup remains the visual reference.
White and warm yellow, black typography, generous rounded surfaces, translucent
panels and floating navigation. Keep blur restrained for readability/performance;
honor accessibility settings. The supplied iGO logo is reused unchanged.

One Flutter app, three backend-approved experiences. Customer home → cafe menu →
cart → confirmed delivery entrance/address → hosted BML card payment → verified
paid order → status timeline. Restaurant dashboard shows confirmation, food-ready
and handover. Rider dashboard shows service-area jobs, assignment, arrival at
restaurant, pickup, arrival at customer and completion. Full destination details
must be server-restricted to the assigned rider.

The wallet and live-tracking mockup screens are superseded. No bank transfers,
cash, wallet balance, or continuous rider tracking. Customer support and legitimate
remedies remain available even without change-of-mind cancellation.

Location design: one-time pin selection for customer/restaurant entrances, saved
address details and order snapshots; external Google Maps directions for riders.
Offer jobs by selected service area/admin assignment rather than rider proximity.
This supersedes earlier tracking sections in product-and-checkout.md and
live-tracking.md; their legacy backend implementation is not mobile launch-ready.

First milestone is an explicitly marked interactive design preview. It does not
claim authenticated registration, real payment, synchronized dispatch or native
Apple Liquid Glass. Those require separate integration and device verification.

The entrance picker now renders an OpenFreeMap vector map through MapLibre. No
Google SDK billing key or device GPS permission is required. Customer and restaurant
forms require a building and explicitly confirmed pin, retain existing details when
edited, and offer manual coordinate entry if tiles cannot load. Customer home and
checkout share one in-memory address. Switching islands clears the old pin. The
island rectangles are approximate preview validation; server coverage polygons,
branch review, saved accounts and order snapshots remain integration work. Rider
sample navigation still opens fixed fictional destinations, not a real placed order.

Map data is OpenStreetMap-based and is not a copy of Google Maps landmark data.
OpenFreeMap/OpenMapTiles/OpenStreetMap credits are visible alongside the map.
