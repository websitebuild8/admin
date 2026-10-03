# iGO mobile

## Build an Android APK with Codemagic

Use the repository-root `codemagic.yaml`, which sets the Flutter project directory
to `apps/mobile`. In Codemagic, scan the branch for this configuration and select
**iGO Android APK - design preview** for the first test APK. The connected workflow
uses the `igo_mobile` variable group for the Clerk public key and deployed HTTPS
backend URL. See [the complete setup steps](../../docs/codemagic-android.md).

APK compilation runs on Codemagic. Both workflows produce a debug APK for testing;
release signing and Play Store publishing are separate setup steps.

One Flutter application for customers, restaurants and riders. Android, iOS and web
preview runners are included. Bundle identifiers are `mv.igo.igo_mobile` on Android and `mv.igo.igoMobile`
on iOS and must be confirmed before store registration. Native launcher icons
still need platform-sized brand assets before distribution.

## Run the design preview

```bash
flutter pub get
flutter run --dart-define=IGO_PREVIEW=true
```

The browser target is for design review, not a separate customer web product:

```bash
flutter run -d web-server --web-hostname localhost --web-port 8080 --dart-define=IGO_PREVIEW=true
```

Without `IGO_PREVIEW=true`, no sample workspace can be entered. Configured native
builds use Clerk authentication and shared backend registration. Customer access
follows registration; restaurant/rider access requires approval. No client choice
grants a real role. Never put Clerk secret keys, database URLs, or Supabase service
keys in this app.

## First implementation

- Original iGO logo, yellow/white surfaces, black typography, rounded glass panels
  and floating translucent navigation inspired by the supplied mockup.
- Flutter-rendered glass effect, not native Apple Liquid Glass. Stronger opacity
  and no blur when high contrast or reduced motion is requested.
- Customer home/search, sample cafe menu, quantity-aware cart using integer laari,
  confirmed entrance/address form and card-only checkout presentation. Payments
  remain disabled.
- MapLibre entrance picker with OpenFreeMap/OpenStreetMap tiles, visible data
  credits and a manual coordinate alternative. Approximate Malé/Hulhumalé bounds
  reject mismatched island pins. Building, unit, entrance instructions and pin are
  retained together; home and checkout reuse the same in-memory customer address.
  Restaurant pickup addresses are separate and can be edited with existing values.
- Restaurant sample preparation workflow and availability switch.
- Rider service-area selection, sample job acceptance and sequential delivery
  milestones. Google Maps directions use destination coordinates without an API key.
  No rider GPS collection or location permissions are present.
- Separate sample states are in memory and reset on leaving the experience. Sample
  restaurant/rider actions do not synchronize with one another or the backend.

## Connected app capabilities and limits

Native builds with the public Clerk key and API URL use the existing Clerk
application. The admin website still restricts access to its allowlisted admin IDs;
public mobile registrations do not grant admin access. Sessions use secure device
storage, and the backend verifies bearer tokens before checking approved roles and
ownership.

The connected app provides registration/pending approval screens, saved customer
entrances, reviewed restaurant pickup entrances, menu/availability management,
server-paginated catalog and orders, rider service-area requests, delivery milestones,
status inbox updates and server-priced checkout quotes. Only the assigned rider
receives job entrances for Google Maps navigation. Continuous GPS and proximity
search are removed from both the mobile app and admin dispatch.

BML collection is disabled until merchant setup and payment verification are ready.
No unpaid order can be submitted. Production registration remains gated while
business policies contain unapproved placeholders. Document upload verification,
background push notifications, account-deletion execution and launch coverage
polygons remain unfinished. The Flutter Clerk SDK is a pinned community beta;
authentication and secure storage still require native device checks. Native iOS
Liquid Glass navigation is added for iOS 26+, with older-device fallback, but awaits
macOS compilation and device verification.

The picker has no current-location button and requests no GPS permission. Drag the
map to the entrance and explicitly confirm it, or enter existing latitude/longitude
coordinates. It uses an approximate bounding rectangle for each island; this does
not establish real building entrances, land boundaries or approved service coverage.
The server must enforce actual service zones before accepting an order. The
connected backend stores saved addresses and immutable checkout quote snapshots.
Design-preview addresses stay in memory, and its rider sample jobs use fictional
fixed destinations. Do not use these sample jobs for real deliveries.

Map tiles are served by [OpenFreeMap](https://openfreemap.org/quick_start/) and
rendered by [MapLibre](https://pub.dev/packages/maplibre_gl). This data is independent
of Google's listings, and does not guarantee all Google Maps landmarks. Public tile
hosting has no service-level guarantee. Change the provider through
`--dart-define=IGO_MAP_STYLE_URL=https://your-provider/style.json` when necessary.
The web runner needs WebGL2 and network access to the MapLibre CDN and tile provider.
Android builds need JDK 21 for the map dependency. iOS currently targets iOS 15+.

## Checks

```bash
flutter analyze
flutter test --concurrency=1
flutter build web --no-wasm-dry-run --dart-define=IGO_PREVIEW=true
```

iOS compilation and device testing require macOS/Xcode or the future Codemagic CI
setup. No iOS binary, signed Android release, or store submission is provided yet.
