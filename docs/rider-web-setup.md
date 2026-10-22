# Phase 1 rider website

The seller delivery platform now has a separate rider website at `/rider`, with registration at `/rider/join` and sign-in at `/rider/sign-in`. It uses the existing Clerk application and Supabase database. The retired native/restaurant project is removed.

## How it works

1. A rider opens `/rider/join`, creates a Clerk account and submits their name and Maldives phone number. Their account is pending, without access to packages.
2. Admin opens **Delivery → Riders → Review access**, checks the application and approves it. Partners and riders cannot approve accounts.
3. Admin selects registered packages in **Packages**, then **Assign rider**. Only approved riders appear in the selector.
4. **Collect** contains available jobs and the rider's own active packages in one table, with **All active**, **Available jobs**, **To pickup** and **To deliver** filters. Each page contains at most 10 packages. **Details** opens pickup/destination information and directions. On narrow screens, every column becomes a labeled field within its row, including pickup, customer, stage and actions, without sideways scrolling. Available-job privacy restrictions still apply.
5. **Take job** atomically claims an unassigned package. Customer names, phone numbers and business references become visible only to the assigned rider. A claim is not pickup.
6. Checkboxes are local selections. **Confirm pickup**, followed by the explicit physical-receipt confirmation, records pickup for only those selected packages. Picked-up packages remain in Collect under **To deliver**.
7. **Deliver** requires confirmation that the customer physically received the package. Server time and rider attribution are recorded; no customer payment is collected.
8. Completed packages move to the paginated **History** table. Notifications remain accessible through the bell and contain only that rider's information.

The former Find jobs and Deliver routes redirect to the matching Collect filter.
See [Collect and History behavior](rider-collect.md) for query compatibility,
privacy rules and verification details.

There is no live GPS tracking. Directions open in the rider's Google Maps application/browser; iGO does not request or store their device location. Addresses are the partner's saved pickup address and the package's saved destination, rather than surveyed coordinates. Riders should confirm building/entrance details when necessary. Boat packages show the destination on a place map, without inventing a ferry route.

## Google Maps setup

Use a **browser key restricted to Maps Embed API and your website origins** for this web integration.

1. Open [Google Cloud Console](https://console.cloud.google.com/). Create/select the iGO project and attach a billing account.
2. Under **APIs & Services → Library**, enable **Maps Embed API**. This implementation does not require Maps JavaScript API, Routes API, Places API or Geocoding API.
3. Open **APIs & Services → Credentials → Create credentials → API key**. Edit the key immediately.
4. Set **Application restrictions → Websites (HTTP referrers)**. Add the exact origins you use, for example:
   - `https://igodelivery.netlify.app/*`
   - `http://localhost:3000/*`
   - `http://127.0.0.1:3000/*`
   Use a separate development key if you prefer. Add your custom domain when it is live. Avoid allowing every Netlify site.
5. Set **API restrictions → Restrict key → Maps Embed API** and save.
6. Set `GOOGLE_MAPS_EMBED_API_KEY` in `apps/admin/.env.local` for local use and in Netlify's production environment for **Functions/runtime**. Redeploy Netlify after saving. The value is a browser key, so it will be visible in the iframe URL; the restrictions are essential.
7. As an approved rider with an assigned package, open **Package details → Show Google map**. Check both Malé and Hulhumalé addresses. If Google rejects the key, check billing, enabled API, the referrer restrictions and that the latest deployment has the variable.

The route/place map is loaded only when requested. The iframe preserves Google's attribution and uses the required referrer policy. **Navigate to pickup/destination** uses Google's Maps URLs and works even without an API key. Google lists Embed API usage as no charge, with a billing account and valid key required; this does not make other Google APIs free. See [Embed usage and billing](https://developers.google.com/maps/documentation/embed/usage-and-billing), [key setup](https://developers.google.com/maps/documentation/embed/get-api-key), [API security](https://developers.google.com/maps/api-security-best-practices), and [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

## Background assignment alerts

Web push works on supported browsers over HTTPS, after the rider explicitly permits it. On iPhone/iPad, open the website from **Add to Home Screen** on iOS/iPadOS 16.4 or later, then enable alerts inside that web app. On Android, a supported browser can receive web push without a native app. Browser permission, operating-system settings, battery restrictions, connectivity and force-quitting can affect delivery. In-app notifications are always retained even when a device cannot receive push. See [Apple/WebKit web push guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

From `apps/admin`, run `npm run rider:keys` once. It generates missing values privately in the ignored `.env.local`, preserves existing keys and prints no key values. Copy these four variable values privately to the production Netlify environment (Functions/runtime), then redeploy:

| Variable | Purpose |
| --- | --- |
| `WEB_PUSH_PUBLIC_KEY` | VAPID public application key; delivered to approved riders |
| `WEB_PUSH_PRIVATE_KEY` | Server-only signing key; never share or prefix with `NEXT_PUBLIC_` |
| `WEB_PUSH_SUBJECT` | Contact HTTPS URL or `mailto:` address for the push service |
| `PUSH_CRON_SECRET` | Separate server-only secret for the retry scheduler |

Keep these keys stable. Rotating the VAPID pair requires riders to disable and re-enable subscriptions on their devices. Each approved rider may enable five browsers. Admin approval is required before enabling push; a business or admin account cannot subscribe as a rider. Lock-screen messages deliberately omit customer names, addresses, phone numbers and collection amounts. Sign out on shared devices, and disable alerts before handing a device to another rider.

The service worker only handles push notifications and opening the rider workspace. It does not cache delivery data for offline access.

### Retry schedule

Assignments save an in-app notice and a per-device push message in the same database transaction. A bounded worker runs after delivery commands. Unsent messages are leased atomically, retry transient failures with backoff and stop after five attempts. Invalid/expired subscriptions are removed. Read, suspended-account and over-24-hour-old notifications are suppressed. Notification tags reduce duplicate display after a send/acknowledgement failure; external push delivery is at least once, not exactly once.

For retries to run while no one is using the site:

1. Deploy the code and four push variables first.
2. Confirm `.env.local` has `DELIVERY_PUBLIC_URL=https://igodelivery.netlify.app` (or your actual production origin), `DIRECT_URL` and the same `PUSH_CRON_SECRET` as Netlify.
3. Enable Supabase **Cron (`pg_cron`)**, **`pg_net`**, **Vault** and **`pgcrypto`** if not already enabled.
   If only `pg_net` is missing, `npm run rider:enable-network` enables that extension without creating a schedule or sending requests.
   Optional predeployment check: `npm run rider:verify-cron` validates scheduler SQL, Vault access and matching database/server signatures in a rolled-back transaction. It sends no HTTP request and leaves no active job.
4. Run `npm run rider:cron`. The installer first checks that the deployed endpoint accepts a signed request and has valid VAPID configuration. It then installs/updates only the named `igo-rider-push` job, every minute. Other jobs are preserved.
5. Run `npm run rider:push-status` to inspect queue totals and recent scheduler runs. A successful cron SQL run means an HTTP request was queued; also inspect the HTTP status in Supabase's `net._http_response` when diagnosing failures. Investigate `FAILED` messages rather than assuming every notification was delivered.

Vault stores the signing secret encrypted at rest. The scheduler puts a timestamped HMAC signature, valid for 90 seconds, into the outbound queue; it never puts the reusable signing secret or any reusable billing credential there. The dispatch endpoint accepts no unsigned request and returns no package data. See [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions) and its [pg_net request-header visibility guidance](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357).

## Deployment and acceptance checks

- Apply the additive Prisma migration with `npm run db:deploy` before deploying the application. The new tables have RLS enabled and no grants to `anon` or `authenticated`; all access goes through the authenticated server.
- Keep existing Clerk, database and storage variables. Clerk must allow rider account registration with the identity verification method you choose; admin access remains controlled by `ADMIN_CLERK_USER_IDS`. A newly created identity grants no admin or delivery access by itself.
- Use real, separate admin, partner and rider accounts to review the complete browser flow. Verify pending and suspended riders cannot access work; verify two riders cannot see each other's packages.
- Test two browsers/devices: enable rider alerts, close the rider page, assign a package as admin, receive the alert, then open the assigned work. Do not treat a provider HTTP success as proof of device display.
- Check selected versus unselected pickup, repeated confirmations, rider claim races, separate physical pickup, delivery-fee display and timestamps.
- Check route accuracy with real local addresses and check boat handover instructions. There is no live tracking or guaranteed automatic entrance-pin placement.
- Update the rider privacy notice's business/contact placeholders and review the operational rider agreement before public launch.
- Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run delivery:integration` and `npm run build`. Integration tests use a disposable database schema, test push senders and fictional delivery data; they do not send real push messages or create real deliveries.

No Git commit, push or deployment is performed by these setup commands.
