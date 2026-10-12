# Mobile design and location flow

Updated 12 October 2026. One Flutter app for backend-approved customers, restaurants
and riders; admin remains the Next.js web app. Customer discovery follows Swiggy
marketplace patterns. Restaurant and rider workspaces retain the earlier supplied
Uber Eats/Driver reference patterns. The original iGO logo, white/yellow/black
palette and glass panels remain. No reference-app branding or artwork is shipped.

## Customer

Four destinations: Home, Search, Orders, Account. A compact delivery address and
account control come first, followed by search, 66-pixel circular cuisine
shortcuts, a pale-yellow discovery panel, horizontal restaurant collections and
compact image/text catalog rows. The discovery panel opens the sample café in
preview or applies the actual Coffee filter in connected mode. Search text
persists across Home/Search and has an explicit clear action.

Collections show actual entries from the current page and never claim
personalized recommendations, ratings, discounts or free delivery without data.
Search runs before ten-row server pagination. Restaurant menus use a compact
information card, category filters, item rows with 104-pixel photo areas and
ADD/quantity controls, plus a persistent quantity/price cart action. These customer
controls are shared by preview and connected screens; restaurant stock/edit
controls keep their existing behavior. Checkout keeps card-only, server-priced
quotes and disabled real payment collection pending BML setup. Account identity,
address toolbars and the customer updates inbox use the same compact styling.

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

Item photos support upload, crop/rotate, replacement and removal through the
backend and Supabase Storage. Modifiers remain future work. Placeholder covers
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
The splash uses a soft pearl/ivory backdrop, static pale-yellow reflections and a
frosted frame around the unchanged logo. Android and iOS startup backgrounds use
the same pearl tone instead of a full yellow screen. Accessible high-contrast and
reduced-effects settings use an opaque frame; the splash adds no animation loop.
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

Native Maps demo and connected builds show Google's actual basemap when a
restricted platform key is supplied. Saved job pins use yellow for restaurant
pickup and the default red for delivery. The camera fits cross-island endpoints,
with a fit control after panning; the rider panel reserves padding for Google's
attribution. An area overview has no fake rider marker. The separate keyless
preview keeps its explicitly identified illustration, and the browser does not
embed the native SDK. Credentials and device checks are still outstanding.

## Customer visual system and motion

Customer headings use 19–29-pixel bold system typography, body copy 12–14 pixels,
22–23-pixel navigation icons and compact quantity controls beside each item. This
uses the existing Flutter/system fonts and bundled Cupertino icons; it does not
ship Swiggy's proprietary font or assets. White surfaces, black text and warm
pale-yellow highlights retain iGO's identity. Native iOS Liquid Glass remains in
the navigation; the Flutter fallback uses a translucent yellow blur.

Motion is finite: 320 ms entry fade/translation, 220 ms tab crossfade, 180 ms
cuisine selection, 150 ms quantity transitions and 240 ms order milestone color
changes. Reduce Motion disables these transitions, and high-contrast settings
replace navigation blur with an opaque surface. No automatic banner carousel,
animation loop or rider animation is introduced. Real order milestones and ETA
still come from the server; preview milestones are explicitly fictional.

The supplied [Mobbin Swiggy reference](https://mobbin.com/apps/swiggy-ios-7fa88b22-91ce-40bd-ac85-7f9b93f01a3d)
redirected to Mobbin's public landing page during this work. The accessible
[official Swiggy App Store screenshots](https://apps.apple.com/in/app/swiggy-food-instamart-dineout/id989540920)
provided the discovery layout reference. Exact gated-screen measurements, font
files and interaction recordings were unavailable; the implemented timings are
iGO design choices, not claimed copies of Swiggy's animation timings.

Actual Flutter widget previews are exported to `docs/previews/customer-swiggy-*.png`
using the optional capture flag on `test/customer_redesign_test.dart`. These show
the fictional preview rather than production restaurant records. Native iOS
composition and Android APK rendering still require device/CI verification.

## References and limits

The public Swiggy screenshots inform customer discovery; the three earlier
user-supplied screenshots inform restaurant/rider workflows. The supplied
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

Menu photos use a consistent square crop in the white/glass menu cards. The editor
previews a larger cover and offers Add/Replace, Edit (pan/pinch/rotate), and Remove.
Changes apply on Save; failed upload messages sit beside the Save button. Photos
are shared by customer and restaurant views through Supabase Storage.
