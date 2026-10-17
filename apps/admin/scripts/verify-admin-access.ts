import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  manageAdministrator,
  administrators,
  type AdminDirectory,
} from "../src/lib/delivery/admin-access";
import { actorForIdentity } from "../src/lib/delivery/admin-policy";
import { deliveryCommand, notifyAdmins } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";
import { partnerApplicationInput } from "../src/lib/delivery/partner-application-input";
import {
  reservePartnerApplication,
  completePartnerApplication,
  reviewPartnerApplication,
  activateApprovedPartner,
} from "../src/lib/delivery/partner-applications";
import { sendPartnerInvitation } from "../src/lib/delivery/partner-invitations";
import { partnerLogo } from "../src/lib/delivery/partner-logos";

export async function verifyAdminAccess(
  db: PrismaClient,
  root: Actor,
  partner: Actor,
  rider: Actor,
  ok: (label: string) => void,
) {
  const target = await db.deliveryAccount.findUniqueOrThrow({
    where: { id: partner.id! },
    include: { partner: true },
  });
  const riderAccount = await db.deliveryAccount.findUniqueOrThrow({
    where: { id: rider.id! },
  });
  let lookups = 0;
  const directory: AdminDirectory = async (email) => {
    lookups++;
    if (email === "partner-admin@example.test")
      return { userId: partner.userId, email, name: partner.name };
    if (email === "root@example.test")
      return { userId: root.userId, email, name: root.name };
    return { userId: rider.userId, email, name: rider.name };
  };
  const grant = {
    action: "GRANT" as const,
    email: "partner-admin@example.test",
    reason: "QA administrator grant",
  };
  await assert.rejects(
    manageAdministrator(
      { ...partner, superAdmin: true },
      randomUUID(),
      grant,
      directory,
    ),
  );
  assert.equal(lookups, 0);
  await assert.rejects(
    manageAdministrator(
      root,
      randomUUID(),
      { ...grant, email: "root@example.test" },
      directory,
    ),
  );
  const key = randomUUID();
  await Promise.all([
    manageAdministrator(root, key, grant, directory),
    manageAdministrator(root, key, grant, directory),
  ]);
  const record = await db.deliveryAdminGrant.findUniqueOrThrow({
    where: { clerkUserId: partner.userId },
  });
  assert(record.active);
  assert.equal(
    await db.deliveryAdminGrant.count({
      where: { clerkUserId: partner.userId },
    }),
    1,
  );
  assert.equal(
    await db.deliveryActivity.count({
      where: { kind: "ADMIN_ACCESS_GRANTED", entityId: record.id },
    }),
    1,
  );
  assert.equal(
    (await db.deliveryAccount.findUniqueOrThrow({ where: { id: target.id } }))
      .role,
    "PARTNER",
  );
  const admin = actorForIdentity({
    userId: partner.userId,
    account: target,
    grant: record,
  });
  const own = actorForIdentity(
    { userId: partner.userId, account: target, grant: record },
    "PARTNER",
  );
  assert.equal(admin.role, "ADMIN");
  assert.equal(admin.partnerId, null);
  assert.equal(own.partnerId, partner.partnerId);
  await assert.rejects(
    manageAdministrator(
      { ...admin, superAdmin: true },
      randomUUID(),
      grant,
      directory,
    ),
  );
  await assert.rejects(administrators(admin, 1));
  ok(
    "only configured super admin can grant/revoke/list administrators; forged flags, root changes and duplicate grants cannot escalate access",
  );
  const ownPackages = (await deliveryQuery(
    own,
    "packages",
    new URLSearchParams(),
  )) as { items: { partnerId: string }[] };
  assert(ownPackages.items.every((row) => row.partnerId === partner.partnerId));
  await db.$transaction((tx) =>
    notifyAdmins(
      tx,
      "QA admin-only notice",
      "Another business has an admin-only update.",
    ),
  );
  const partnerNotices = (await deliveryQuery(
    own,
    "notifications",
    new URLSearchParams(),
  )) as { items: { title: string }[] };
  assert(
    !partnerNotices.items.some((row) => row.title === "QA admin-only notice"),
  );
  const adminNotices = (await deliveryQuery(
    admin,
    "notifications",
    new URLSearchParams(),
  )) as { items: { title: string }[] };
  assert(
    adminNotices.items.some((row) => row.title === "QA admin-only notice"),
  );
  const hidden = await db.deliveryNotification.findFirstOrThrow({
    where: { recipient: partner.userId, title: "QA admin-only notice" },
  });
  await assert.rejects(
    deliveryCommand(own, randomUUID(), { type: "readNotice", id: hidden.id }),
  );
  const sameKey = randomUUID();
  const rate: DeliveryCommandInput = {
    type: "rate",
    origin: "MALE",
    zone: "BOAT",
    fee: 2500,
  };
  await deliveryCommand(admin, sameKey, rate);
  await deliveryCommand(own, sameKey, {
    type: "register",
    parcel: {
      externalReference: "QA-DUAL-ROLE",
      recipientName: "QA recipient",
      recipientPhone: "7771234",
      destination: "QA destination",
      zone: "MALE",
      description: "Disposable QA",
    },
  });
  ok(
    "role switches preserve partner isolation, keep admin notifications out of the partner inbox and isolate request replay by workspace",
  );
  const revokeKey = randomUUID(),
    revoke = {
      action: "REVOKE" as const,
      grantId: record.id,
      reason: "QA revoke access",
    };
  await manageAdministrator(root, revokeKey, revoke, directory);
  await manageAdministrator(root, revokeKey, revoke, directory);
  const revoked = await db.deliveryAdminGrant.findUniqueOrThrow({
    where: { id: record.id },
  });
  assert(!revoked.active);
  await assert.rejects(deliveryCommand(admin, sameKey, rate));
  await assert.rejects(deliveryCommand(admin, randomUUID(), rate));
  const restored = actorForIdentity({
    userId: partner.userId,
    account: target,
    grant: revoked,
  });
  assert.equal(restored.role, "PARTNER");
  assert.deepEqual(restored.workspaces, ["PARTNER"]);
  assert.equal(
    (await db.deliveryAccount.findUniqueOrThrow({ where: { id: target.id } }))
      .status,
    target.status,
  );
  ok(
    "revocation blocks stale admin mutations and cached replays while preserving original partner status and history",
  );
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "GRANT",
      email: "rider-admin@example.test",
      reason: "QA rider grant",
    },
    directory,
  );
  const riderGrant = await db.deliveryAdminGrant.findUniqueOrThrow({
    where: { clerkUserId: rider.userId },
  });
  const riderAdmin = actorForIdentity({
    userId: rider.userId,
    account: riderAccount,
    grant: riderGrant,
  });
  const riderView = actorForIdentity(
    { userId: rider.userId, account: riderAccount, grant: riderGrant },
    "DRIVER",
  );
  assert.equal(riderAdmin.role, "ADMIN");
  assert.equal(riderView.id, rider.id);
  assert.deepEqual(riderView.workspaces, ["ADMIN", "DRIVER"]);
  const results = await Promise.allSettled([
    deliveryCommand(riderAdmin, randomUUID(), rate),
    manageAdministrator(
      root,
      randomUUID(),
      {
        action: "REVOKE",
        grantId: riderGrant.id,
        reason: "QA concurrent revoke",
      },
      directory,
    ),
  ]);
  assert.equal(results[1].status, "fulfilled");
  await assert.rejects(deliveryCommand(riderAdmin, randomUUID(), rate));
  assert.equal(
    (await db.deliveryAccount.findUniqueOrThrow({ where: { id: rider.id! } }))
      .role,
    "DRIVER",
  );
  await assert.rejects(
    db.deliveryAdminGrant.delete({ where: { id: record.id } }),
  );
  ok(
    "rider/admin switching and concurrent revocation leave the rider identity intact and access history cannot be deleted",
  );
  for (let n = 0; n < 10; n++)
    await db.deliveryAdminGrant.create({
      data: {
        clerkUserId: `qa_extra_admin_${randomUUID()}`,
        email: `admin-${n}@example.test`,
        name: `Admin ${n}`,
        grantedBy: root.userId,
      },
    });
  const first = await administrators(root, 1),
    second = await administrators(root, 2);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 2);
  assert(
    !first.items.some((row) =>
      second.items.some((other) => other.id === row.id),
    ),
  );
  assert(
    first.superAdmins.some(
      (item) => item.userId === root.userId && item.current,
    ),
  );
  const schema = process.env.IGO_DELIVERY_TEST_SCHEMA!;
  const [security] = await db.$queryRawUnsafe<
    { rls: boolean; anon: boolean; authenticated: boolean }[]
  >(
    `SELECT relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='DeliveryAdminGrant'`,
    schema,
  );
  assert(security.rls);
  assert(!security.anon && !security.authenticated);
  ok(
    "administrator history paginates ten disjoint rows and database clients have no direct access to privilege grants",
  );
}
export async function verifyOptionalPartnerAssets(
  db: PrismaClient,
  root: Actor,
  ok: (label: string) => void,
) {
  for (const [index, location] of ["HULHUMALE_1", "HULHUMALE_2"].entries()) {
    const email = `optional-${index}@example.test`,
      userId = `qa_optional_${randomUUID()}`;
    const input = partnerApplicationInput.parse({
      businessName: `Optional business ${index}`,
      businessType: index ? "INSTAGRAM" : "FACEBOOK",
      ownerName: "QA owner",
      email,
      phone: "7771234",
      pickupAddress: "QA pickup building",
      operatingLocation: location,
      dailyDeliveries: 5,
      contactConsent: true,
    });
    const key = randomUUID();
    const app = await reservePartnerApplication(key, input, null);
    assert.equal(app.logoPath, null);
    assert.equal(app.logoReady, false);
    assert.equal(app.pageUrl, "");
    await completePartnerApplication(app.id, app.digest);
    await completePartnerApplication(app.id, app.digest);
    assert.equal(
      (await reservePartnerApplication(key, input, null)).id,
      app.id,
    );
    const completed = await db.deliveryPartnerApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    assert(completed.submittedAt);
    assert.equal(completed.logoReady, false);
    assert.equal(
      await db.deliveryActivity.count({
        where: { kind: "PARTNER_APPLICATION_SUBMITTED", entityId: app.id },
      }),
      1,
    );
    await reviewPartnerApplication(
      root,
      randomUUID(),
      app.id,
      "APPROVED",
      "Complete optional-assets application",
    );
    await sendPartnerInvitation(root, app.id, "https://igo.test", {
      find: async () => null,
      create: async () => ({ id: `qa_inv_${randomUUID()}` }),
    });
    const activated = await activateApprovedPartner(userId, email);
    assert(activated);
    const account = await db.deliveryAccount.findUniqueOrThrow({
      where: { id: activated.id },
      include: { partner: true },
    });
    assert(account.partner);
    assert.equal(account.partner.operatingLocation, location);
    const actor: Actor = {
      userId,
      id: account.id,
      partnerId: account.partner.id,
      role: "PARTNER",
      status: "APPROVED",
      name: account.name,
    };
    await assert.rejects(partnerLogo(actor), { status: 404 });
  }
  ok(
    "Facebook/Instagram applications without URL or logo submit, review, invite and activate in either Hulhumalé phase without storage calls or duplicate notifications",
  );
}
