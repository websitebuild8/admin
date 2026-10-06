# Mobile design and location flow

Updated 7 October 2026. One Flutter app for backend-approved customers, restaurants
and riders; admin remains the Next.js web app. The redesign follows the supplied
Uber Eats/customer and Uber Driver screenshots and common marketplace patterns,
while retaining the original iGO logo, white/yellow/black palette and glass panels.
No Uber branding or downloaded Uber artwork is used.

## Customer

Four destinations: Home, Search, Orders, Account. Address and immediate delivery
context come first, followed by search, cuisine shortcuts, restaurant collections
and the catalog. Collections show actual entries from the current page and never
claim personalized recommendations, ratings, discounts or free delivery without
data. Search runs before ten-row server pagination. Restaurant menus use compact
item rows, category filters and a persistent cart action. Checkout keeps card-only,
server-priced quotes and disabled payment collection pending BML setup.

Orders lead into a dedicated status screen with a segmented progress bar, saved
pickup/dropoff map, rider assignment details, help and the timestamped timeline.
The open page receives the workspace's foreground-polled updates (20 seconds),
not simulated progress or background push. Customers see entrances for their own
orders only. These are fixed endpoints, never the rider's location; the map does
not pretend a straight line is a navigable route. An unavailable endpoint/map has
an explicit fallback. Needs-attention orders require support.

## Restaurant

Four destinations: Kitchen, Menu, Orders, Account. Kitchen availability, actual
menu counts and actionable paid-order cards replace the mixed menu/order screen.
The menu has search plus All/Available/Out-of-stock filters across all items before
pagination. The full-screen editor supports name, description/allergens, free-text
category, exact integer-laari price, availability and deletion. Direct stock
controls update only availability. Ownership and approved restaurant access are
checked server-side for every mutation; existing order JSON snapshots survive
menu edits and deletion. Category defaults to General for existing items.

Item photography/upload and modifiers are still future work. Placeholder covers
are honest about missing real photographs; sample café photography stays in the
fictional design preview. No sample restaurant actions update production records.

## Rider

Three destinations: Map, Deliveries, Account. The primary screen uses an area map
or assigned entrance markers with a bounded scrollable glass bottom panel. It
shows actual availability, service-area requests or the current job's next action.
Assigned riders can open external Google Maps for pickup/dropoff directions.
There is no GPS collection, moving rider marker, heatmap, fake earnings or fake
in-app route. Requests use the selected service area, not proximity to a GPS fix.
Fictional preview maps use an original, clearly identified abstract illustration;
configured native builds use Google Maps. No rider navigation address is exposed
before assignment. Restaurants do not receive customer coordinates or rider GPS.

## Brand and native UI

A compact logo splash and photo-led welcome screen introduce the redesigned app.
Android and iOS launch backgrounds use the unchanged provided logo and yellow.
Navigation is translucent yellow with black controls and role-specific icons;
iOS 26+ uses native Liquid Glass, older iOS uses native blur and Android uses
Flutter glass. Reduced transparency/animation fallbacks remain. Native cold-start,
platform-view composition and iOS compilation still need device/CI checks.

Customers/restaurants type an address, choose a Places suggestion to resolve its
coordinates, review the entrance and add private building/unit/instructions.
Island/query changes invalidate stale selections; manual adjustments remain for
ambiguous buildings. The approximate Malé/Hulhumalé coverage requires validation
before paid operations. Google credentials, billing/restrictions and retention
are documented in [google-maps-setup.md](google-maps-setup.md).

## References and limits

The three user-supplied screenshots are the primary visual references. The supplied
[YouTube video](https://www.youtube.com/watch?v=fmriMi2Cjv8) could not be opened by
our research tool; no claim is made to have watched or reproduced that video.
Official research supports discovery shortcuts/collections, status-led restaurant
queues, menu changes and map-led rider stages:

- [Uber Eats discovery redesign](https://www.uber.com/us/en/newsroom/arriving-now-the-new-uber-eats/) (2020; reference history, not a claim that every current region uses this layout).
- [Uber Driver app guide](https://www.uber.com/us/en/deliver/driver-app/).
- [Uber menu editing](https://help.uber.com/en-GB/merchants-and-restaurants/article/%C3%BAprava-menu?nodeId=156909ff-4025-44c7-a200-20b339f9fa93).
- [Merchant storefront/menu guidance](https://merchants.ubereats.com/us/en/academy/storefront/).

The references inform hierarchy and interaction patterns; iGO's payment, approval,
coverage and privacy rules govern its functionality. Legal identity placeholders,
merchant activation, production release signing and store publication are unfinished.
