# iGO mobile

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

Without `IGO_PREVIEW=true`, no sample workspace can be entered. Real registration
is intentionally unavailable until mobile Clerk sessions and backend-approved role
onboarding are implemented. No client choice grants a real role. Never put Clerk
secret keys, database URLs, or Supabase service keys in this app.

## First implementation

- Original iGO logo, yellow/white surfaces, black typography, rounded glass panels
  and floating translucent navigation inspired by the supplied mockup.
- Flutter-rendered glass effect, not native Apple Liquid Glass. Stronger opacity
  and no blur when high contrast or reduced motion is requested.
- Customer home/search, sample cafe menu, quantity-aware cart using integer laari,
  address form and card-only checkout presentation. Payments remain disabled.
- Restaurant sample preparation workflow and availability switch.
- Rider service-area selection, sample job acceptance and sequential delivery
  milestones. Google Maps directions use destination coordinates without an API key.
  No rider GPS collection or location permissions are present.
- Separate sample states are in memory and reset on leaving the experience. Sample
  restaurant/rider actions do not synchronize with one another or the backend.

## Next integration work

Clerk mobile authentication, registration forms/document submission, server-approved
roles, live catalog and order APIs, entrance-pin selection, validated address
snapshots, BML hosted checkout, notification delivery, policy acceptance versions,
and account deletion are not implemented yet. The admin Clerk instance is currently
restricted to its approved email: public mobile onboarding requires a deliberate
identity configuration change while preserving admin user-ID checks.

Use saved coordinates for restaurant pickup and customer drop-off; let the rider
open Google Maps for navigation. Latest product decision removes continuous rider
tracking and proximity-based dispatch: use selected service areas/admin assignment.
The existing admin backend still contains the earlier GPS/nearby-offer implementation;
it must be revised before connecting mobile operations. Do not enable that GPS flow.

The customer map must include a manual alternative to one-time location permission.
The current address form is a preview only and does not yet save a geographic pin.
All sample destination coordinates are fictional. Do not use them for real deliveries.

## Checks

```bash
flutter analyze
flutter test --concurrency=1
flutter build web --dart-define=IGO_PREVIEW=true
```

iOS compilation and device testing require macOS/Xcode or the future Codemagic CI
setup. No iOS binary, signed Android release, or store submission is provided yet.
