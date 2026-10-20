# Notifications and partner finance

## Where to use the features

- Admin → Notifications → Message partner. Select a business, write a message or choose an outstanding invoice for a payment reminder, review it, then send.
- Admin → Finance → an outstanding invoice → Remind payment. Partner pages also have a Message partner action beside each approved business.
- Admin → Notifications → Sent to partners preserves sent-message history after a recipient clears their inbox. The date selector applies to this history.
- Partner → Finance combines invoices, bank transfers and completed deliveries. Select an invoice to see its packages, transfers, payment history, invoice document and paid copy. Submit bank transfer starts from the specific outstanding invoice.
- Admin, Partner or Rider → Notifications → Enable alerts. Browser-alert controls appear only in this tab, never Overview or Collect. Existing enabled subscriptions keep working when navigating away. Test alert sends only to the signed-in workspace’s registered devices.
- Partner and Rider → Notifications → Message admin → review → Send notification. Approved operational accounts can contact the admin inbox without choosing a recipient. Sent to admin retains their own paginated, date-filtered message history after admins clear their notifications.
- Admins receive inbox and subscribed browser alerts for pending transfer evidence, verified installments, fully paid invoices, partner/rider messages and other existing admin notifications. Receipt submission never marks an invoice paid.
- Inbox notifications are plain, non-clickable text. Mark read and Mark all read & clear remain available. Tapping a phone/browser push opens the workspace inbox; it does not open an invoice or package. Invoice and delivery details are accessed from Finance or package tables.

## Deployment and configuration

Migration `20261020000000_workspace_notifications` adds typed notification targets, safely links historical invoice notices using existing foreign keys, adds transactional push queuing, and updates the existing invoice scheduler’s notification insert. Migration `20261021000000_admin_browser_alerts` adds independent admin subscription ownership to the same queue. An admin subscription belongs to a Clerk identity; it does not require a rider/partner profile. Existing subscriptions, invoicing eligibility, locking and fee/payment rules remain unchanged.

The workspace notification migration was applied on 20 October 2026; the admin subscription migration was applied on 21 October 2026 after disposable-schema verification. For another environment, from `apps/admin`, apply migrations with `npm run db:deploy` before deploying the updated app. Never run this blindly if unrelated destructive migrations are pending; inspect `npm run db:status` first.

Netlify must have these **server-side** environment variables for Functions/runtime, followed by a fresh deployment:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT` (the existing HTTPS site origin or a valid `mailto:` contact)
- `PUSH_CRON_SECRET` (at least 32 characters)
- `DELIVERY_PUBLIC_URL` (the deployed HTTPS origin, for example `https://igodelivery.netlify.app`)

### Where to find the values

The existing push keys were checked and preserved in `apps/admin/.env.local` on 20 October 2026. Open that ignored file in VS Code. Copy the values after `=` for `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `PUSH_CRON_SECRET` into Netlify; do not include the variable name or surrounding quotes in its Value field. Do not commit the local environment file or paste the private key/signing secret into chat.

For this deployment, `WEB_PUSH_SUBJECT` can be `https://igodelivery.netlify.app` and `DELIVERY_PUBLIC_URL` must be `https://igodelivery.netlify.app`. Neither of these two is a generated key. If the public domain changes, use the new HTTPS origin.

Set all five variables for the Production deploy context and make them available to Functions. Then publish a fresh deploy: [Netlify Functions environment-variable guidance](https://docs.netlify.com/build/functions/environment-variables/). The setup does not require a Google Maps key or a paid key-generation service.

The existing `npm run rider:keys` creates missing VAPID keys/signing secret in the ignored `.env.local` file without printing them or replacing valid keys. Keep existing keys when enabling partners or admins; rotating them disconnects subscribed devices. Only the public VAPID key is returned to authenticated clients. Never put the private key or cron secret into `NEXT_PUBLIC_*` variables.

For another environment, after the updated site and matching variables are deployed, run `DELIVERY_PUBLIC_URL=https://igodelivery.netlify.app npm run rider:cron` locally from `apps/admin` (replace the origin if using a different domain). The local ignored environment must contain the same VAPID keys and `PUSH_CRON_SECRET` as Netlify. The historical command/job name covers **admins, partners and riders**. It verifies the deployed signed endpoint, then configures the Supabase pg_cron/pg_net/Vault retry job. `npm run rider:push-status` reads queue counts and schedule status without exposing secrets. On 21 October 2026, the configured environment's job was installed at a one-minute interval and its scheduled executions were verified as successful. Existing jobs and VAPID keys were preserved. Deploy the new code before enabling Admin alerts in the Notifications tab.

No new email, SMS, maps or storage service is required for these notification features. Delivery is browser Web Push, not SMS.

## Phone setup

- Android: open the HTTPS site in a supported browser, sign in, and choose Enable alerts. Allow notifications when prompted. Installing the workspace on the Home Screen is also supported.
- iPhone/iPad: iOS/iPadOS 16.4 or later; use Safari → Share → Add to Home Screen. Open that installed Partner/Rider workspace, sign in, and choose Enable alerts. iOS browser-tab-only permission is insufficient.
- Permission requests happen only after a user presses Enable alerts. OS notification permissions, browser support, network connectivity and Focus/battery settings affect delivery. A web page cannot guarantee that an operating system displays every notification.
- No private API responses or pages are cached by the service workers. Push content is generic; customer addresses, phone numbers, invoice balances and custom-message bodies remain behind authenticated access.
- If a workspace has already had notifications denied, change its notification permission in browser/OS settings before enabling again.

References: [Apple/WebKit Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).

## Security and financial behavior

Received inbox rows have no navigation action. Phone alerts open only their own workspace inbox, including queued alerts containing older record links. Existing typed references and authorized legacy data endpoints remain for compatibility; record URLs and queries still enforce ownership.

Only authorized admins may send partner messages. Approved partners and riders may message the admin inbox; recipients and sender identity are determined server-side. Both directions have length validation, per-minute rate limits, transactional audits and idempotency. Sent-to-admin history is scoped to the current sender and workspace. Invoice reminders read the server-side invoice balance, require that it belongs to the selected partner and reject fully paid invoices. Partner finance endpoints force the current partner ID regardless of submitted filters. Admin finance data and exports remain admin-only.

Pending receipts do not reduce outstanding balances. Only verified amounts count as paid. Completed-delivery fees, invoices, pending transfers and verified payments remain separate. No cash-on-delivery functionality is added.

Push subscriptions are bound to either an approved Partner/Rider account or a currently authorized Admin identity, enforced by a database exclusive-owner constraint. Other accounts and workspaces cannot take over endpoints. Admin grant revocation removes admin subscriptions and queued messages; the sender also checks current admin access before delivery. Queues are created in the same transaction as notifications, including SQL-generated daily invoice notices. Workers lease jobs, retry temporary provider failures, suppress read/deleted or stale notices and retire expired subscriptions. Clear-all deletes the recipient’s notifications and queued messages while leaving sent-message audits and device subscriptions intact. Admin lock-screen payloads remain generic and open only `/delivery/notifications`.

## Verification

- Unit tests include target/input validation, generic payloads, and worker navigation restrictions for all three workspaces.
- `npm run delivery:integration -- --admin-alerts` checks all three subscription types with a fake sender, sender-history isolation, duplicate messages, pending/partial/paid invoice events, admin access revocation, clear-all and operational push regressions in a disposable database schema.
- On 21 October 2026, all 79 unit tests and 32 notification/push database checks passed; the production build and lint passed. Browser checks using real components, production styles and fictional data confirmed no alert controls on Admin/Partner Overview or Rider Collect, with controls on each Notifications tab. Partner/rider message dialogs were checked in dark and light appearance, including a 390px viewport. The mobile notification text layout was corrected so Mark read no longer squeezes its message into a narrow column.
- `npm run delivery:integration -- --workspace-notifications` uses a disposable database schema and a fake push sender. It verifies real constraints, transactions, tenant isolation, admin-only messaging, duplicate requests, link authorization, payment reminders, partner finance, clear-all, rider workflow and push retry regressions. It does not send real alerts or modify real business records.
- Browser layout checks passed at 320px, 390px and 1440px using fictional data and the real portal components: admin message/reminder review, partner transfer history, ten-row pagination, and absence of admin controls in partner finance. Notification rows have since been changed back to plain text at the operator’s request. Light and dark dialog contrast were inspected. These checks use fictional data with the real portal components. They do not prove production Clerk authentication, receipt storage or actual OS notification display.
- After deployment, use a real approved admin, partner and rider device to enable alerts in Notifications, press Test alert, close the site, receive an alert and confirm that tapping it returns to the correct signed-in workspace. This real-device acceptance test remains required. On iPhone, install/open the appropriate workspace from its home-screen app first; each workspace has a separate manifest and service-worker scope.
