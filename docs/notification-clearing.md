# Clearing notifications

Admin, Partner and Rider inboxes have **Mark all read & clear**. This acknowledges
and permanently removes both read and unread messages across every page and date
in the signed-in user's selected workspace. Account-wide messages visible in
that inbox are cleared too. Other users' messages and other workspace-specific
inboxes are unaffected. Newly arriving notifications can still appear afterward.

The action runs through the authenticated, origin-checked, rate-limited delivery
command API. The client cannot specify another recipient or workspace. Current
account/admin privileges are checked inside the serializable transaction, including
before returning an idempotent replay. The deletion and its count-only audit record
commit together. Retries of a successful request do not delete subsequent arrivals.
Clearing resets pagination, refreshes unread counts and notifies other open tabs to
reload their authorized data. Private inbox responses use `no-store`.

Invoice and paid-invoice dispatch records retain their send-once keys, senders and
timestamps after their notification pointer is detached. Invoice balances, paid
documents, verified payments and timeline events remain available. Database guards
still reject changing or reattaching a dispatch; only the notification foreign-key
cleanup may null its pointer. A sent invoice cannot be resent merely because its
notification was cleared.

Rider push-message rows cascade with the cleared notifications; subscriptions
remain active for future assignments. Workers recheck leased messages before
sending. A push request already in transit to a browser cannot be recalled;
clearing the website inbox does not dismiss existing operating-system alerts.

## Release

Migration `20261019010000_clear_notifications` changes two nullable invoice-notice
links and their immutable-history guards. It is compatible with the previously
published site and deletes no existing notification or financial record. It was
applied to the configured Supabase database on 19 October 2026. Commit/push the
source changes and deploy the site separately; no new environment values or
external notification service are needed.

## Verification

`npm run delivery:integration -- --notifications` applies migrations in a random
disposable schema and checks recipient/workspace isolation, old/read/unread messages,
more than ten records, concurrent replay, subsequent arrivals, revoked access,
queued/leased push cleanup and preserved invoice/paid-invoice history. It removes
the test schema afterward and does not clear operational inboxes.
