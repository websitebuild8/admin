import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { ensureAdminWorkspaces } from "../src/lib/delivery/admin-workspaces";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { commandInput, type Actor } from "../src/lib/delivery/domain";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { dispatchRiderPush } from "../src/lib/delivery/push";

export async function verifyNotificationClearing(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  driver: Actor,
  ok: (label: string) => void,
) {
  assert.equal(
    commandInput.safeParse({ type: "clearNotices", recipient: partner.userId })
      .success,
    false,
  );
  assert.equal(
    commandInput.safeParse({ type: "clearNotices", workspace: "ADMIN" })
      .success,
    false,
  );
  await assert.rejects(
    deliveryCommand({ ...partner, role: "APPLICANT" }, randomUUID(), {
      type: "clearNotices",
    }),
    { status: 403 },
  );
  ok(
    "clear-all rejects client-selected recipients/workspaces and unapproved actors",
  );

  await ensureAdminWorkspaces(admin);
  const ownAccounts = await db.deliveryAccount.findMany({
    where: { clerkUserId: admin.userId },
    include: { partner: true },
  });
  const ownPartnerAccount = ownAccounts.find((a) => a.role === "PARTNER")!;
  const ownRiderAccount = ownAccounts.find((a) => a.role === "DRIVER")!;
  const ownPartner: Actor = {
    ...admin,
    role: "PARTNER",
    id: ownPartnerAccount.id,
    partnerId: ownPartnerAccount.partner!.id,
  };
  const ownRider: Actor = {
    ...admin,
    role: "DRIVER",
    id: ownRiderAccount.id,
    partnerId: null,
  };
  await db.deliveryNotification.createMany({
    data: Array.from({ length: 24 }, (_, n) => ({
      recipient: admin.userId,
      workspace: "ADMIN",
      title: `QA clear ${n}`,
      message: "Disposable notification",
      readAt: n % 2 ? new Date() : null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })),
  });
  const partnerNotice = await db.deliveryNotification.create({
    data: {
      recipient: admin.userId,
      workspace: "PARTNER",
      title: "QA partner",
      message: "Keep",
    },
  });
  const riderNotice = await db.deliveryNotification.create({
    data: {
      recipient: admin.userId,
      workspace: "DRIVER",
      title: "QA rider",
      message: "Keep",
    },
  });
  const foreignNotice = await db.deliveryNotification.create({
    data: {
      recipient: partner.userId,
      workspace: "PARTNER",
      title: "QA other",
      message: "Keep",
    },
  });
  const sharedNotice = await db.deliveryNotification.create({
    data: {
      recipient: admin.userId,
      workspace: "ACCOUNT",
      title: "QA account",
      message: "Shared inbox",
    },
  });
  const before = await db.deliveryNotification.count({
    where: { recipient: admin.userId, workspace: { in: ["ADMIN", "ACCOUNT"] } },
  });
  const key = randomUUID();
  const [first, duplicate] = await Promise.all([
    deliveryCommand(admin, key, { type: "clearNotices" }),
    deliveryCommand(admin, key, { type: "clearNotices" }),
  ]);
  assert.deepEqual(first, duplicate);
  assert("count" in first && first.count === before);
  assert.equal(
    await db.deliveryNotification.count({
      where: {
        recipient: admin.userId,
        workspace: { in: ["ADMIN", "ACCOUNT"] },
      },
    }),
    0,
  );
  assert.equal(
    await db.deliveryNotification.count({
      where: {
        id: { in: [partnerNotice.id, riderNotice.id, foreignNotice.id] },
      },
    }),
    3,
  );
  assert.equal(
    await db.deliveryNotification.findUnique({
      where: { id: sharedNotice.id },
    }),
    null,
  );
  const audit = await db.deliveryActivity.findFirstOrThrow({
    where: {
      kind: "NOTIFICATIONS_CLEARED",
      actor: admin.userId,
      role: "ADMIN",
    },
  });
  assert.deepEqual(
    audit.detail && (audit.detail as { count: number }).count,
    before,
  );
  const inbox = (await deliveryQuery(
    admin,
    "notifications",
    new URLSearchParams(),
  )) as { total: number; unread: number };
  assert.deepEqual(
    { total: inbox.total, unread: inbox.unread },
    { total: 0, unread: 0 },
  );
  ok(
    "clear-all deletes read/unread messages beyond ten items and old dates, preserves other identities and roles, and clears unread counts",
  );

  const later = await db.deliveryNotification.create({
    data: {
      recipient: admin.userId,
      workspace: "ADMIN",
      title: "QA newer",
      message: "New arrival",
    },
  });
  assert.deepEqual(
    await deliveryCommand(admin, key, { type: "clearNotices" }),
    first,
  );
  assert(await db.deliveryNotification.findUnique({ where: { id: later.id } }));
  assert.equal(
    await db.deliveryActivity.count({
      where: {
        kind: "NOTIFICATIONS_CLEARED",
        actor: admin.userId,
        role: "ADMIN",
      },
    }),
    1,
  );
  await deliveryCommand(admin, randomUUID(), { type: "clearNotices" });
  const empty = await deliveryCommand(admin, randomUUID(), {
    type: "clearNotices",
  });
  assert("count" in empty && empty.count === 0);
  ok(
    "concurrent replay clears once, a retry preserves later arrivals, and a new clear handles an empty inbox safely",
  );

  await deliveryCommand(ownPartner, randomUUID(), { type: "clearNotices" });
  assert.equal(
    await db.deliveryNotification.findUnique({
      where: { id: partnerNotice.id },
    }),
    null,
  );
  assert(
    await db.deliveryNotification.findUnique({ where: { id: riderNotice.id } }),
  );
  await deliveryCommand(ownRider, randomUUID(), { type: "clearNotices" });
  assert.equal(
    await db.deliveryNotification.findUnique({ where: { id: riderNotice.id } }),
    null,
  );
  assert(
    await db.deliveryNotification.findUnique({
      where: { id: foreignNotice.id },
    }),
  );
  ok(
    "the same administrator can clear Partner and Rider inboxes independently without touching another partner",
  );

  const staffId = `qa_clear_revoked_${randomUUID()}`;
  const grant = await db.deliveryAdminGrant.create({
    data: {
      clerkUserId: staffId,
      email: "clear@example.test",
      name: "QA staff",
      grantedBy: admin.userId,
    },
  });
  const staff: Actor = { ...admin, userId: staffId, superAdmin: false };
  const staffKey = randomUUID();
  await deliveryCommand(staff, staffKey, { type: "clearNotices" });
  const staffNotice = await db.deliveryNotification.create({
    data: {
      recipient: staffId,
      workspace: "ADMIN",
      title: "QA revoked",
      message: "Keep",
    },
  });
  await db.deliveryAdminGrant.update({
    where: { id: grant.id },
    data: { active: false, revokedBy: admin.userId, revokedAt: new Date() },
  });
  await assert.rejects(
    deliveryCommand(staff, staffKey, { type: "clearNotices" }),
    { status: 403 },
  );
  await assert.rejects(
    deliveryCommand(staff, randomUUID(), { type: "clearNotices" }),
    { status: 403 },
  );
  assert(
    await db.deliveryNotification.findUnique({ where: { id: staffNotice.id } }),
  );
  ok(
    "revoked administrator access denies both fresh and cached clear-all commands",
  );

  const subscription = await db.deliveryPushSubscription.create({
    data: {
      driverId: driver.id!,
      endpoint: `https://fcm.googleapis.com/fcm/send/qa-clear-${randomUUID()}`,
      p256dh: "qa-key",
      auth: "qa-auth",
    },
  });
  const driverNotice = await db.deliveryNotification.create({
    data: {
      recipient: driver.userId,
      workspace: "DRIVER",
      title: "Collection assigned",
      message: "Disposable assignment",
    },
  });
  await db.deliveryPushMessage.create({
    data: {
      subscriptionId: subscription.id,
      notificationId: driverNotice.id,
      leaseToken: randomUUID(),
      leaseUntil: new Date(Date.now() + 120000),
    },
  });
  await deliveryCommand(driver, randomUUID(), { type: "clearNotices" });
  assert.equal(
    await db.deliveryPushMessage.count({
      where: { subscriptionId: subscription.id },
    }),
    0,
  );
  assert(
    await db.deliveryPushSubscription.findUnique({
      where: { id: subscription.id },
    }),
  );
  let sends = 0;
  await dispatchRiderPush(async (_subscription, payload) => {
    if (payload.includes(driverNotice.id)) sends++;
  });
  assert.equal(sends, 0);
  ok(
    "clearing a rider inbox cascades queued/leased push jobs without removing future alert subscriptions",
  );
}
