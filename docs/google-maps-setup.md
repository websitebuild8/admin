# Google Maps and automatic address search

Updated 7 October 2026. iGO uses Google Maps native SDKs plus Places API (New).
Eeezap's [privacy policy](https://eeezap.com/privacy-policy) confirms Google Maps
and Places usage, but does not document its exact UI or software architecture.
This implementation follows the agreed iGO flow rather than claiming to reproduce
Eeezap's private implementation.

## What users do

1. Select Malé or Hulhumalé and type a building, road or nearby landmark.
2. Choose a Google suggestion. iGO automatically resolves the coordinates and
   shows the selected location for review; no separate manual pin placement is
   required for a correct result.
3. Confirm the actual building name, floor/unit and entrance instructions. Those
   private details have separate fields and are not sent to Places search.
4. Save. Restaurant entrance changes await admin review. Riders receive only their
   assigned job's pickup/dropoff locations and can open Google Maps directions.
   Customers can view fixed saved entrances for their own orders on the status map;
   no role receives a live rider position.

Search has a 450 ms debounce, minimum three characters, at most five suggestions,
separate sessions for completed searches, and stale-response protection. Both
server and client validate the selected island. The pilot bounds are approximate
rectangles, not surveyed service polygons. Google may not have every local building;
users can select a nearby landmark and adjust the entrance or enter coordinates.
Typing an address without selecting/resolving or confirming a pin cannot save one.

## 1. Google Cloud

Create/select a Google Cloud project, enable billing, then enable:

- **Maps SDK for Android**.
- **Maps SDK for iOS** if building iOS.
- **Places API (New)** for the backend.

No Geolocation, Routes, Navigation SDK, Maps JavaScript or continuous GPS service is
needed for this flow. Opening external Google Maps directions uses a universal
Maps URL with the destination; iGO does not provide or collect the device origin.
Use the current [Google setup guide](https://developers.google.com/maps/flutter-package/config)
and [API security guide](https://developers.google.com/maps/api-security-best-practices).
Creating/enabling billing and obtaining restricted keys remain account-owner setup.

## 2. Separate keys and locations

| Setting | Where it belongs | Restriction |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` (Android) | Codemagic `igo_mobile` group / Flutter build defines | Android application `mv.igo.igo_mobile`, actual APK signing SHA-1; API restricted to Maps SDK for Android. |
| `GOOGLE_MAPS_API_KEY` (iOS) | iOS build defines, using a different key | iOS application bundle `mv.igo.igoMobile`; API restricted to Maps SDK for iOS. |
| `GOOGLE_PLACES_API_KEY` | Backend `.env.local` and Vercel environment settings | API restricted to Places API (New); never in Flutter, `NEXT_PUBLIC_*`, or Codemagic mobile defines. |
| `IGO_MAP_PROOF_SECRET` | Backend `.env.local` and Vercel | A private random secret of at least 32 characters, identical across backend instances; signs the Google coordinate expiry. |
| `IGO_MAP_DAILY_LIMIT` | Backend, optional | Default 3000 provider requests per UTC day; configurable 1–10000. |

For a backend with fixed outbound IPs, add Google's IP application restriction to
the Places server key. Ordinary Vercel functions do not provide a fixed egress IP;
do not use a browser-referrer restriction for server calls. API restriction,
authenticated proxy and durable quotas are included; fixed-egress infrastructure
is an additional deployment choice if required. Set Google-side quotas too.
A billing budget alert does not stop spending.

To create the backend signing secret locally, `openssl rand -hex 32` is suitable.
Store its value securely; do not paste it into chat or commit it. Add these backend
settings in the Vercel project's environment variables, matching the development
or production Google project deliberately. Restart the local server / redeploy
Vercel after changing settings. Public map keys in APKs are expected; application
and API restrictions protect them.

## 3. Supabase retention and request limits

Migration `20261005000000_google_places` adds a protected usage counter table and
Google address metadata. The backend requires a verified Clerk primary email,
valid bearer session and matching origin before proxying search. Restaurant
registration can search before approval. Per-account caps are 30 requests per
minute and 250 per UTC day; the global cap is configurable. Atomic database updates
make these caps apply across server instances. Provider failures are sanitized and
never send server keys or raw provider errors back to the app.

Google Places coordinates may be cached for up to 30 days. iGO uses a shorter
26-day lifetime. Hourly Supabase Cron deletes expired Google-derived saved addresses,
restaurant entrance/legacy coordinate copies, and order/quote coordinate snapshots;
user-provided order descriptions and payment records are retained. Expired
restaurant entrances close ordering until a new reviewed entrance is supplied.
Saved delivery addresses need another lookup after expiry. Provider suggestion
lists and selected labels stay transient, and building text is user supplied.
Map attribution uses the official unmodified Google Maps logo.

The migration and cleanup job were applied to the current Supabase project. For a
new database, run the migrations, enable **Supabase Cron / pg_cron**, then from
`apps/admin` run:

```bash
node --conditions=react-server --import tsx scripts/configure-google-cleanup.ts
```

This installs the hourly job and runs cleanup once. It makes no Google API calls.
Search fails closed if cleanup is not configured. Monitor successful runs of
`igo-google-content-prune` in Supabase Cron. Confirm backup/recovery retention,
operating coverage and the final business privacy terms before public launch.
The legal drafts include Google Maps Terms/Privacy links and keep the agreed
business placeholders. Draft policy version is now `draft-2026-10-05`.

References: [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies),
[Google service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms),
[Supabase Cron](https://supabase.com/docs/guides/cron).

## 4. Codemagic and local device builds

In the existing **igo_mobile** group add the restricted Android
`GOOGLE_MAPS_API_KEY`. Choose the workflow appropriate to the test:

| Codemagic workflow | What it displays | Required settings |
| --- | --- | --- |
| **iGO Android APK - design preview** | Fictional layouts with an explicitly illustrated map. | None. This workflow does not import `igo_mobile`. |
| **iGO Android APK - Google Maps demo** | Real Google basemap and fixed fictional entrances, plus access to shared demo purchases. | Android `GOOGLE_MAPS_API_KEY` in `igo_mobile`; backend URL optional because a demo session can be joined on the phone. No Clerk/bank keys required. |
| **iGO Android APK - connected app** | Approved accounts, saved entrances and authenticated address search. | Clerk public key, deployed HTTPS backend URL; Android Maps key for tiles and separate backend Places configuration for search. |

The Maps demo build fails early if its key is missing. It uses the native SDK on
Android, not a downloaded map image or a simulated rider marker. Sample pins stay
fictional and identified as sample data. The native map retains Google's default
landmark labels and attribution. Job cameras fit both endpoints, including
cross-island deliveries; the fit control restores them after panning. The rider
panel reserves map padding for attribution and controls. Map browsing bounds do
not extend server-approved coverage, and no device GPS permission is requested.

The build configuration contains only public mobile settings. Google Places
remains server-side. Address search still requires a connected, signed-in account;
the Maps demo does not call Places or enable real payments. Shared demo sessions
continue using their fixed sample entrances.

Google's Android restriction needs the actual APK signing SHA-1. Codemagic's
**Show Maps signing fingerprint** step prints it after the build. Add that SHA-1 to
the Android key's application restrictions. Also add the Play App Signing
certificate when preparing a store release; it differs from the upload certificate.

### Quick Android activation

1. Enable billing and **Maps SDK for Android** in your Google Cloud project.
2. Create an Android application key, restrict it to package
   **mv.igo.igo_mobile**, and restrict its API to **Maps SDK for Android**.
   Add the SHA-1 of your stable testing certificate (create/list it below before
   the first Maps build). Do not use a web-referrer
   restriction, an iOS key or your server Places key here.
3. Save it as **GOOGLE_MAPS_API_KEY** in Codemagic's **igo_mobile** group. Do not
   paste it into chat, Git or a source file. Push the source changes manually,
   rescan `codemagic.yaml`, then start **iGO Android APK - Google Maps demo**.
4. Read **Show Maps signing fingerprint** in that build and ensure its SHA-1 is
   present on the Android key. Download **app-debug.apk** under **Artifacts**,
   install it, and use an internet connection to open the rider Map screen.
   Check Malé and Hulhumalé, pinch/pan, restore the area with the fit button, and
   open an assigned sample job to confirm both entrance markers are visible.
5. For real customer/restaurant automatic address lookup, separately configure
   the backend **GOOGLE_PLACES_API_KEY** and use the **connected app** workflow.

If a map is blank with only Google's logo, check the exact package/SHA-1 pair,
enabled SDK, billing and the key's API restriction. A successful Flutter test or
native view creation does not verify Google tile authorization. Updating a key's
restrictions does not change the APK's embedded key; changing the key value itself
requires a new APK. Do not remove restrictions to work around a mismatch.

For a stable testing fingerprint, create a standard debug keystore once, privately:

```bash
keytool -genkeypair -v -keystore igo-debug.keystore -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android \
  -dname "CN=Android Debug,O=Android,C=US"
keytool -list -v -keystore igo-debug.keystore -alias androiddebugkey \
  -storepass android -keypass android
base64 -w 0 igo-debug.keystore
```

Store the base64 as a **secret** Codemagic variable
`IGO_ANDROID_DEBUG_KEYSTORE_BASE64` in `igo_mobile`; never commit the keystore or
base64. The workflow restores it to the debug signing location. Without it, build
machines may generate different fingerprints and each new fingerprint must be
added to the Google Android restriction. This is testing signing, not store signing.

For local native testing, put the public settings in ignored `.env.local.json`:

```json
{
  "CLERK_PUBLISHABLE_KEY": "YOUR_CLERK_PUBLIC_KEY",
  "IGO_API_BASE_URL": "https://YOUR-DEPLOYED-BACKEND",
  "GOOGLE_MAPS_API_KEY": "YOUR_PLATFORM_RESTRICTED_MAPS_KEY"
}
```

Then `flutter run --dart-define-from-file=.env.local.json`. Use a separate iOS key
for an iOS build. iOS requires 16+ for Google Maps SDK 10; Liquid Glass requires
26+ and a compatible Xcode build environment. Browser design preview does not load
the native map, and Google native/platform configuration needs device verification.
No new APK or iOS binary has been built locally for these changes.
