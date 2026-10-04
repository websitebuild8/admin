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
- Floating translucent yellow navigation. iOS 26+ uses native Liquid Glass;
  older iOS uses native blur, and Android uses Flutter glass. Reduced transparency
  and motion settings use accessible fallbacks. Native device verification is pending.
- Customer home/search, sample cafe menu, quantity-aware cart using integer laari,
  confirmed entrance/address form and card-only checkout presentation. Payments
  remain disabled.
- Google Maps entrance picker and authenticated Google Places search. Choose an
  address suggestion to fill coordinates automatically, review the location, and
  add building/unit/access instructions. Pin adjustment and manual coordinates
  remain available. Search is restricted to approximate Malé/Hulhumalé bounds.
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

The picker has no current-location button and requests no GPS permission. Search
suggestions and coordinates require Google credentials, enabled billing, and a
connected native account. Design preview contains sample food imagery and fictional
jobs; Google search is unavailable in that preview. The browser runner is for UI
review and does not load native Google Maps. It offers the coordinate fallback.

The server independently validates the selected island. These approximate
rectangles are not surveyed land/service polygons. Real operating coverage must
be confirmed before accepting paid orders. Google search does not guarantee every
Maldivian building or entrance is indexed. Users review results before saving.

See [Google Maps setup](../../docs/google-maps-setup.md) for Android/iOS restrictions,
backend Places credentials, usage limits, and Google coordinate retention. Native
SDK configuration uses `GOOGLE_MAPS_API_KEY` from the Flutter build defines; Android
and iOS must use separate restricted keys. iOS targets **16+** for the current
Google SDK, with Liquid Glass on 26+.

## Checks

```bash
flutter analyze
flutter test --concurrency=1
flutter build web --no-wasm-dry-run --dart-define=IGO_PREVIEW=true
```

iOS compilation and device testing require macOS/Xcode or the future Codemagic CI
setup. No iOS binary, signed Android release, or store submission is provided yet.
