# Mobile design and location flow

Updated 5 October 2026. One Flutter app for backend-approved customers, restaurants
and riders; admin remains the Next.js web application. The original iGO logo stays
unchanged. White and warm yellow surfaces, black typography, generous rounded
panels and translucent yellow floating navigation combine the supplied mockup with
DoorDash-inspired restaurant browsing. iOS 26+ uses native Liquid Glass navigation;
older iOS uses native blur, and Android uses Flutter glass with accessibility
fallbacks. Those native effects require device verification.

Customer home features clear delivery details, search, cuisine chips and large
restaurant cards. Real catalog search runs on the backend before pagination, with
at most ten results per page. Restaurant cards show actual preparation availability;
no invented real-world ratings, discounts or delivery estimates are displayed.
Generated café photography is labeled sample content and stays in design preview;
real restaurants show an honest image placeholder pending supplied photography.
Menus retain an accessible cart button at the bottom of the screen.

Customers and restaurants type a building/address, select a Google Places result,
review its Google map location, and add their own unit and entrance instructions.
Coordinates are resolved automatically; pin adjustment is optional. Changing the
island or search text invalidates old selections, and late responses cannot select
a different address. Missing/ambiguous buildings can use a nearby landmark plus
an adjusted entrance, or manual coordinates. Island bounds are approximate pilot
rectangles and require operational validation before launch.

Only assigned riders receive job entrances. They can view pickup/dropoff endpoints
on a Google map and open external Google Maps directions. iGO does not collect GPS
or draw live rider positions. Restaurants update confirmation, ready-for-pickup and
handover. Riders update assignment, arrival, pickup, arrival at customer and delivery
completion. Customers receive milestones and approximate distance-based estimates.
No paid order is created until verified hosted BML card payment; payment collection
is currently disabled. Role approval and all operations share the existing backend.

The Google setup, quotas, privacy text and retention behavior are documented in
[google-maps-setup.md](google-maps-setup.md). Policies retain the agreed business
placeholders and remain draft-only. Authentication, maps, Liquid Glass and native
APK/iOS compilation need device checks with configured credentials.
