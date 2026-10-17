# One sign-in, three admin workspaces

The configured super admin and every active administrator receive **Admin,
Partner and Rider** access automatically. There is no second registration,
partner application, invitation or approval step for an administrator's own
operational profiles. A new admin grant creates both missing profiles in the
same transaction. Existing admins and the configured root initialize missing
profiles on their next authenticated request.

Use **Switch workspace** in the header. It keeps the same Clerk session and
verified email while selecting a separate operational account ID. Partner pages
query only that profile's business, packages, invoices and payments. Rider pages
use only that profile's rider ID. Role-specific notifications stay in the
corresponding inbox.

Only the configured root can grant or revoke administrator access. Staff admins
cannot create other admins or super admins, including by editing their own
profile or submitting a forged role/flag. There is no public admin signup.
The root remains a server setting; do not add staff IDs to the root environment
allowlist. Use **Administrators** instead. The current local configuration has
one protected super-admin identity.

## Business details

**Admin → Workspace details** (`/delivery/my-workspaces`) edits the signed-in
admin's own partner and rider contact details. It accepts no other user's ID or
email and cannot change privileges. Partner Settings also links to this screen
for admins using their Partner workspace.

A newly included business has no invented address or operating location.
Complete its business name, pickup address, phone and operating location before
registering deliveries. This is profile maintenance, not registration: the role
is already approved. Existing business details, logos, cutoff, package IDs and
frozen rates are preserved. Updating the operating location changes new quotes
only. Updating contact details does not change the Clerk sign-in email.

## Ordinary users and removal of admin access

Ordinary accounts retain one Partner **or** Rider workspace. A verified email
and Clerk user ID cannot create an additional operational profile without
current admin access. Public forms cannot grant admin membership.

When the root removes admin access, the confirmation selects one operational
workspace to keep. The other profile is suspended and disappears from the
switcher. Its history stays in the database; it cannot be reopened or approved
as a second active role without admin access. Cached commands are checked
against current authorization before returning a saved response.

If the person has physically picked-up packages, keep Rider until those
deliveries are completed. If Partner is retained instead of Rider, registered
unpicked assignments are released for another rider. Granting admin access
again reuses both profile IDs and restores all three workspaces.

Deleting an active admin's partner or rider profile clears its selected data,
but the role is recreated **empty** on the next authenticated request, because
admin membership automatically includes it. Deleted packages and financial
history are not restored. The deletion confirmation explains this exception.

## Database and release

Migration `20261018010000_admin_multiple_operational_roles` replaces the single
account-per-Clerk-user constraint with one account per `(clerkUserId, role)`.
Existing accounts remain primary. A unique partial index keeps at most one
primary profile, and a private database trigger guards additional profiles,
identity changes and reactivation. The app checks actual root configuration or
an active private admin grant; client metadata and role headers cannot grant
membership.

The migration preserves existing account IDs and records. It classifies older
notifications into their proper operational inbox without deleting their
contents. It does not create or change Clerk users and sends no external email.

The migration must precede the updated site deployment. It was applied to the
configured Supabase database on 18 October 2026. No live role
profiles were provisioned by the migration; existing admins initialize them
automatically when they access the updated website. The command below is for
other environments and can safely confirm an already-applied migration.

```bash
cd /home/ahusan/Desktop/igo/apps/admin
npm run db:deploy
```

Commit/push manually in VS Code as requested, then deploy to Netlify. On the new
version, sign in with your usual admin account and open the role switcher. Test
the ordinary-user account separately: it should offer only its own role and
return an authorization error for other workspaces.

## Verification

The isolated `--admin-workspaces` database suite exercises root initialization,
ordinary-user denial, duplicate/concurrent initialization, super-admin-only
grants, automatic staff profiles, own-business configuration, tenant and inbox
isolation, physical rider operations, revocation, stale cached requests,
assignment release, regrant and database client permissions:

```bash
npm run delivery:integration -- --admin-workspaces
```

Its identity-directory transport is a test double. Actual Clerk account
creation, external emails and hosted browser sessions are not claimed by that
suite. The existing verified Clerk identity integration remains in place.
