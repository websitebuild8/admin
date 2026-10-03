# Build the iGO Android app on Codemagic

The repository is a monorepo: `apps/admin` contains Next.js, while
`apps/mobile/pubspec.yaml` identifies the Flutter app. The repository name
`admin` does not identify the Flutter project directory.

`Failed to install dependencies ... /Users/builder/clone. Directory was not found`
means the selected build configuration is looking for Flutter at the clone root.
The root `codemagic.yaml` sets `working_directory: apps/mobile` for both workflows.
APK artifact paths include `apps/mobile` because Codemagic resolves artifact paths
relative to the clone root.

## First APK

1. Commit and push `codemagic.yaml` to the branch selected in Codemagic.
2. Open the application settings in Codemagic, select that branch and use
   **Check for configuration file** to load the root YAML file.
3. Start a new build and choose **iGO Android APK - design preview**.
4. After it succeeds, download `app-debug.apk` from the build's **Artifacts**.

This APK uses clearly marked fictional data. It does not register accounts,
charge cards, or write delivery operations to the backend. It is for checking
the UI and navigation on a phone.

If continuing with Codemagic's Flutter Workflow Editor instead of YAML, set its
Flutter project path to `apps/mobile` and select Android. The YAML workflows
are the reproducible configuration for this repository.

## Connected APK

In Codemagic application settings, create an environment variable group called
`igo_mobile` with these two values:

| Variable | Value |
| --- | --- |
| `CLERK_PUBLISHABLE_KEY` | The existing Clerk application's public `pk_test_...` key for pilot testing. |
| `IGO_API_BASE_URL` | The deployed admin/backend HTTPS origin, such as `https://YOUR-ADMIN-DOMAIN`. |

Then select **iGO Android APK - connected app**. Its setup script validates the
settings and writes an ignored build configuration file containing only those
two public values. Local `.env.local.json` files are intentionally absent from Git.
A phone cannot reach the development server using your computer's `localhost`.

Clerk secret keys, Supabase database URLs/service keys, BML credentials and
administrator ID settings stay on the backend; they do not belong in this group
or the APK. The backend must run with `IGO_DEMO_MODE=false`, matching Clerk keys,
and the Supabase migrations applied.

The connected APK follows the backend registration rules. Restaurant/rider
applications stay pending until admin approval. Only allowlisted admin IDs can access the web dashboard.
BML collection remains disabled. Production registration remains gated until
the placeholder policies are finalized and approved.

## Build environment and verification limits

Both workflows use Flutter 3.47.2, matching the local SDK, and Java 21. Dependency
installation, analysis, tests and Android compilation run sequentially. Gradle
is limited to one worker and a 2 GB Java heap. No build triggers or store publishing
are configured; start each run manually.

These are debug-signed APKs for testing. Play Store distribution requires a
release signing setup and an AAB workflow. Schema validation and Flutter tests
do not prove native compilation; the successful Codemagic build confirms that.

References: [Codemagic monorepo configuration](https://docs.codemagic.io/getting-started/adding-apps/),
[Flutter YAML builds](https://docs.codemagic.io/yaml-quick-start/building-a-flutter-app/),
[YAML configuration and artifact paths](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/).
