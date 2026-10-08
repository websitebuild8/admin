# Build the iGO Android app on Codemagic

The repository is a monorepo: `apps/admin` contains Next.js, while
`apps/mobile/pubspec.yaml` identifies the Flutter app. The repository name
`admin` does not identify the Flutter project directory.

`Failed to install dependencies ... /Users/builder/clone. Directory was not found`
means the selected build configuration is looking for Flutter at the clone root.
The root `codemagic.yaml` sets `working_directory: apps/mobile` for all three workflows.
After compilation, **Prepare APK download** verifies the APK exists and copies it
to `/tmp/igo-android-artifacts/app-debug.apk`. The `artifacts` section uses this
absolute path, avoiding ambiguity between the clone and working directories.

## First APK

1. Commit and push `codemagic.yaml` to the branch selected in Codemagic.
2. Open the application settings in Codemagic, select that branch and use
   **Check for configuration file** to load the root YAML file.
3. Start a new build and choose **iGO Android APK - design preview**.
4. After it succeeds, open that build's overview and download `app-debug.apk` from
   **Artifacts** below the build details.

If an earlier successful build shows **No artifacts were found** under Publishing,
its APK was compiled but was not collected for download. Start a new build from the
updated branch; reopening the old build cannot apply the corrected configuration.
The new **Prepare APK download** step fails if the expected APK is missing, instead
of silently continuing without a download.

This APK uses clearly marked fictional data. It does not register accounts,
charge cards, or write delivery operations to the backend. It is for checking
the UI and navigation on a phone.

If continuing with Codemagic's Flutter Workflow Editor instead of YAML, set its
Flutter project path to `apps/mobile` and select Android. The YAML workflows
are the reproducible configuration for this repository.

## Connected APK

In Codemagic application settings, create an environment variable group called
`igo_mobile` with these values:

| Variable | Value |
| --- | --- |
| `CLERK_PUBLISHABLE_KEY` | The existing Clerk application's public `pk_test_...` key for pilot testing. |
| `IGO_API_BASE_URL` | The deployed admin/backend HTTPS origin, such as `https://YOUR-ADMIN-DOMAIN`. |
| `GOOGLE_MAPS_API_KEY` | Optional restricted Android Maps SDK key; required to display native maps. |
| `IGO_ANDROID_DEBUG_KEYSTORE_BASE64` | Optional secret base64 of a stable debug keystore, keeping the Maps signing fingerprint consistent. |

Then select **iGO Android APK - connected app**. Its setup script validates the
settings and writes an ignored build configuration file containing only those
public Clerk/API/Maps values. The private Places key stays on the backend. Local `.env.local.json` files are intentionally absent from Git.
A phone cannot reach the development server using your computer's `localhost`.

Clerk secret keys, the Google Places server key, Supabase database URLs/service keys, BML credentials and
administrator ID settings stay on the backend; they do not belong in this group
or the APK. The backend must run with `IGO_DEMO_MODE=false`, matching Clerk keys,
and the Supabase migrations applied.

The connected APK follows the backend registration rules. Restaurant/rider
applications stay pending until admin approval. Only allowlisted admin IDs can access the web dashboard.
BML collection remains disabled. Production registration remains gated until
the placeholder policies are finalized and approved.

## Google Maps demo APK

Use **iGO Android APK - Google Maps demo** to check actual Google Maps while
keeping fictional role workspaces and the shared demo purchase entry. This
workflow imports **igo_mobile** and requires its Android **GOOGLE_MAPS_API_KEY**.
It does not require Clerk credentials or activate bank payments. The backend URL
is optional; a reachable backend and a private session key are still needed to
join the integrated shared demo on a phone. Automatic Places search belongs to
the authenticated connected app.

Restrict the key to **mv.igo.igo_mobile**, the APK's actual signing SHA-1 and
**Maps SDK for Android**. Both Maps-enabled workflows restore the optional stable
debug keystore and print the SHA-1 in **Show Maps signing fingerprint**. Follow
[Google Maps setup](google-maps-setup.md#quick-android-activation) before building.
The keyless design-preview workflow deliberately stays available separately.

## Build environment and verification limits

All workflows use Flutter 3.47.2, matching the local SDK, and Java 21. Dependency
installation, analysis, tests and Android compilation run sequentially. Gradle
is limited to one worker and a 2 GB Java heap. No build triggers or store publishing
are configured; start each run manually.

These are debug-signed APKs for testing. Play Store distribution requires a
release signing setup and an AAB workflow. Schema validation and Flutter tests
do not prove native compilation; the successful Codemagic build confirms that.

References: [Codemagic monorepo configuration](https://docs.codemagic.io/getting-started/adding-apps/),
[Flutter YAML builds](https://docs.codemagic.io/yaml-quick-start/building-a-flutter-app/),
[YAML configuration and artifact paths](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/).

Google Maps configuration and signing-fingerprint steps: [Google Maps setup](google-maps-setup.md).

## Shared demo purchases

All workflows include **Try shared demo**. The design preview APK can
join a demo session without build-time Clerk or bank keys. Enter the reachable
HTTPS backend and the private session key from the connected admin on each phone.
See [the demo walkthrough](demo-purchases.md). Never put the demo key into
Codemagic variables, source code or a committed configuration file.
