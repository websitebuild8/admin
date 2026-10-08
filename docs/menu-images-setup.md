# Food photos with Supabase Storage

Each food item has one square cover photo. Approved restaurants can select a
JPEG/PNG/WebP from the phone's gallery, crop by moving/pinching, rotate, replace,
or remove it. Photos change when **Save menu item** succeeds. Cancelling retains
the existing saved photo. Removing the menu item also queues its photo for removal.
Customer and restaurant menu tiles use the same photo with a consistent crop and
a placeholder while loading or if the image cannot load.

Supabase stores the files; PostgreSQL stores ownership and item links. Clerk
remains the identity provider. No separate image-hosting service or Supabase Auth
integration is required. The backend produces a WebP cover up to 1024 × 1024 and
thumbnail up to 256 × 256, without upscaling small photos. This avoids requiring
Supabase's paid on-demand image transformation feature. Storage, bandwidth and
hosting still have their own plan allowances; this is not a promise of unlimited
free uploads.

## Get the backend settings

Use the **same Supabase project** as the iGO database.

1. Open the project dashboard, click **Connect**, and copy the Project URL
   (`https://YOUR_PROJECT_REF.supabase.co`).
2. Open **Settings → API Keys → Secret keys**. Create a key named `igo-backend`
   if needed; copy its `sb_secret_...` value.
3. Add the two settings to the ignored `apps/admin/.env.local`:

```dotenv
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SECRET_KEY="sb_secret_REPLACE_WITH_YOUR_BACKEND_KEY"
```

Do not use the database password or a publishable/anon key here. Do not paste the
secret into chat, put it in Flutter/Codemagic settings, prefix it with NEXT_PUBLIC_,
or commit it. The backend also accepts the older `SUPABASE_SERVICE_ROLE_KEY` JWT
if an existing project still uses it; the new secret key is preferred. Only one
private key is needed. New keys are sent in the `apikey` header; legacy JWTs also
use Authorization. A key change does not change Clerk login or admin approvals.

After saving, restart the backend and refresh the mobile account. Add these same
settings to the **backend's Vercel environment** when deployed and redeploy.
Phones need the reachable backend URL and their existing public app settings,
not any Supabase private key. Keep Supabase's Data API disabled; Storage is a
separate API. Do not replace DATABASE_URL or DIRECT_URL with the project URL.

## Bucket and access

Migration `20261007020000_menu_images` creates `MenuImage`, the unique item-image
link, and the **igo-menu-images** bucket. Run `npm run db:deploy` from `apps/admin`
on other environments; the migration was applied to the current development DB.
The bucket is public for food photography downloads, allows only WebP and limits
each output file to 2 MiB. Restrictive policies deny direct client operations on
this bucket and its objects even if unrelated buckets have broader policies.
Business-table RLS remains enabled, with anon/authenticated access revoked.

All uploads go through iGO's backend, which checks an active, verified restaurant
and its Clerk identity before reading/decoding the photo. Customer/rider/pending
accounts cannot upload. Raw uploads are capped at 3 MiB and 16 megapixels; the
mobile picker downscales before cropping. Still JPEG/PNG/WebP only; originals,
EXIF/GPS and identifying metadata are not published. One native image processor
runs per backend process, with at most three waiting requests. Each owner is
limited to 20 attempts/hour, 100/day and 10 unfinished uploads; malformed attempts
also count. Limits apply per instance's processor and globally per database owner.

Replacing an image uses a new filename. The menu link and previous image's delete
queue change in one database transaction. A failed save keeps the staged upload
for retry; duplicate creation retries use a stable draft ID. Cancelling discards
only an unattached staged image. No client-controlled image URL is saved.

## Shared demos and cleanup

Admin-created shared demo sessions support the same photo flow. Their images have
separate session ownership and cannot be attached to real restaurant items or
another session. Customer demo menus read the saved photo from that shared session.
The keyless standalone design preview keeps photo edits on the device only.

Deleted/replaced files are removed through the Storage API after a menu commit.
If Storage is temporarily unavailable, a durable database queue remains. Unused
uploads expire after 24 hours; interrupted uploads after 30 minutes. Ended/expired
or reset demo-session photos are collected too. Upload-attempt records remain at
least 48 hours for quotas. Public downloads may remain in device/CDN caches after
removal; this bucket must not contain private documents or customer details.

The backend `vercel.json` includes a daily **/api/maintenance/menu-images** cleanup
endpoint. Set **CRON_SECRET** to a strong private value in the Vercel backend so
Vercel can authorize it; it shares the existing dispatch scheduler's secret.
Confirm the deployed cron is active and monitor successful cleanup. On another
host, invoke the protected endpoint daily using `Authorization: Bearer <CRON_SECRET>`.
For local maintenance, run `npm run photos:cleanup` from `apps/admin` with the
Storage settings present. If more than 30 assets are queued, repeat until drained.
This command removes only files whose database state is Deleting/stale; never
manually delete storage.objects metadata in SQL.

The iOS photo-library usage description is included. Gallery selection does not
request camera/microphone/GPS or broad Android media-library permissions. Android
lost-picker results are recovered at startup for explicit review in a menu editor;
no photo is automatically attached to an item. Native picker behavior and Google
SDK behavior must be checked on the Codemagic APK and an iOS device.

## Check before enabling real uploads

`npm run photos:verify` checks database ownership, atomic links, retries, quotas,
cleanup and bucket settings using rollback fixtures and mocked Storage HTTP. It
does not prove the secret key works or publish real files.

After adding backend credentials, `npm run photos:verify-storage` checks the real
provider. Run it from `apps/admin`. It creates a separate 30-minute fictional demo
session, uploads three generated food-photo fixtures, downloads both public image
sizes, checks WebP sizing and metadata removal, verifies shared customer menus,
and tests replacement/removal/item deletion. It cleans up only that session's
files and database records, without changing real menus, orders or accounts.
Removal is verified against Storage metadata because public CDN/device caches
can retain a downloaded photo. If a network failure prevents cleanup, the script
reports it and leaves a durable deletion queue for the maintenance collector.
It prints neither private keys nor project URLs.

This real provider check passed for the current development project on
8 October 2026 using the configured new server secret key. All temporary files
and records were removed. This verifies backend handlers and Storage access;
it does not verify a deployed website or native gallery permissions.

On a phone, test upload → customer menu → crop/replace → remove with a fictional
shared demo session. Confirm failed upload leaves the old photo visible,
cancelling does not replace it, and no original metadata appears in downloaded
outputs. Policies remain drafts with business placeholders until approved. The default policy
version is now `draft-2026-10-08` for the photo changes; if IGO_POLICY_VERSION is
explicitly set to an older draft in your backend environment, update it too.

Official references:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Image transformations and plan availability](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [Flutter image picker](https://pub.dev/packages/image_picker)
