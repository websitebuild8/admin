# Administrator access and workspace switching

The current administrator IDs in the server's `ADMIN_CLERK_USER_IDS` configuration
are protected super administrators. Keep that configuration in place. Only those
accounts can open **Administrators** at `/delivery/administrators`, grant access,
or remove it. An optional `SUPER_ADMIN_CLERK_USER_IDS` list can name additional
protected roots. Never expose either setting through browser configuration.

## Grant or remove access

1. Sign in as the existing super admin and open **Administrators**.
2. Enter the verified primary email of an existing Clerk account and a reason.
   A registered partner or rider can use the same account. For a new staff
   person, create their account in Clerk first; this form does not send an
   invitation or create credentials.
3. Select **Grant admin access**. The server resolves the verified Clerk identity
   and saves a separate administrator grant. It automatically creates missing
   Partner and Rider profiles and approves existing operational profiles, while
   preserving their IDs and business history. No further registration is needed.
4. To revoke a grant, select **Remove access**, enter a reason, choose the one
   operational workspace to retain, and confirm. Keep Rider while the person has
   physically picked-up packages. The other profile is suspended and its history
   is preserved; retaining Partner releases unpicked rider assignments.
   The removed grant remains
   in history and can be reactivated through the grant form. Protected super
   administrators cannot be removed here.

Ordinary administrators can operate the delivery platform but cannot list,
grant, or revoke administrator access. The server checks the configured super
admin identity; a client-supplied flag or header cannot grant privileges.

## Switch workspace

Every active admin, including the configured super admin, gets a **Switch workspace**
menu offering **Admin**, **Partner** and **Rider** automatically.
The choice changes the portal URL and request context for that tab, without
changing the stored role or another tab. Choices refresh when the window gains
focus and every 30 seconds while visible.

Ordinary users keep one Partner or Rider workspace and cannot add the other
using the same sign-in. Admins can fill their own operational details at
**Admin → Workspace details**. A new business needs its real pickup address,
phone and operating location before registering deliveries. See
[automatic admin workspaces](admin-workspaces.md) for initialization and removal.

The server verifies role ownership on each request. Partner lists, finances,
private logos and notices remain scoped to that business in Partner mode. Admin
notifications do not appear in Partner or Rider mode. Driver operations still
require the approved rider identity and explicit pickup/delivery actions.

Revoked admin mutations and cached mutation replays are denied. Grant/revoke
operations use serializable transactions, idempotency keys and advisory locks;
audit events retain who acted, when, the target and the reason. Grants are private
server-owned records with RLS and client access revoked. No grant can be deleted.

## Optional application assets

Business Facebook/Instagram/website links and logos are optional for every
business type. Supplied links are still normalized and validated. Supplied logos
still use private Supabase Storage, validated image processing and scoped reads.
Without a logo, submission makes no Storage request and the review screen shows
the business initials. Submission has its own timestamp, separate from upload
readiness, so a valid application without an image can be approved and activated.

## Release

Migration `20261017010000_admin_access_optional_partner_assets` and
`20261017000000_origin_pricing_retire_cod` were applied to the configured live
database on 17 October 2026. Live administrator-list and dashboard reads pass.
Migration `20261018010000_admin_multiple_operational_roles` was applied on
18 October 2026; it preserves existing records and enables automatic profiles
when admins first access the updated site.
For another environment, follow the coordinated
[release steps](origin-pricing-and-rider-jobs.md#release-steps) before serving this
code. A local build or disposable-schema test does not apply live migrations or
publish the website.

Before launch, exercise the actual hosted Clerk flow with a partner/admin and
rider/admin account, verify all three workspace options, remove each grant, and
verify only the retained operational workspace still works. The automated identity-directory and UI
fixtures do not prove a real signed-in Clerk session or deployment.
