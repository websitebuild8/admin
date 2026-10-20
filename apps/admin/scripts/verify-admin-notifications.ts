import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import {
  dispatchRiderPush,
  savePushSubscription,
} from "../src/lib/delivery/push";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";

export async function verifyAdminNotifications(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  other: Actor,
  driver: Actor,
  ok: (label: string) => void,
) {
  const vars = [
    "WEB_PUSH_PUBLIC_KEY",
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
  ] as const;
  const previous = vars.map((v) => process.env[v]);
  const vapid = webpush.generateVAPIDKeys();
  process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
  process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
  process.env.WEB_PUSH_SUBJECT = "https://example.com";
  const cmd = (who: Actor, command: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(who, key, command);
  const input = () => ({
    action: "subscribe",
    endpoint: `https://fcm.googleapis.com/fcm/send/qa-admin-${randomUUID()}`,
    keys: { p256dh: vapid.publicKey, auth: "a".repeat(22) },
  });
  const rootSub = input(),
    staffSub = input();
  const staff: Actor = {
    ...admin,
    userId: `qa_staff_push_${randomUUID()}`,
    superAdmin: false,
  };
  try {
    const grant = await db.deliveryAdminGrant.create({
      data: {
        clerkUserId: staff.userId,
        email: `${randomUUID()}@example.com`,
        name: "QA Staff",
        grantedBy: admin.userId,
      },
    });
    await savePushSubscription(admin, rootSub);
    await savePushSubscription(staff, staffSub);
    await savePushSubscription(admin, rootSub);
    assert.equal(
      await db.deliveryPushSubscription.count({
        where: { adminUserId: admin.userId },
      }),
      1,
    );
    assert.equal(
      await db.deliveryAccount.count({ where: { clerkUserId: staff.userId } }),
      0,
    );
    await assert.rejects(
      savePushSubscription({ ...admin, userId: partner.userId }, input()),
      { status: 403 },
    );
    await assert.rejects(
      savePushSubscription(partner, {
        action: "unsubscribe",
        endpoint: rootSub.endpoint,
      }),
      { status: 409 },
    );
    await assert.rejects(
      savePushSubscription(staff, {
        action: "unsubscribe",
        endpoint: rootSub.endpoint,
      }),
      { status: 409 },
    );
    await assert.rejects(
      db.deliveryPushSubscription.create({
        data: {
          ...rootSub.keys,
          endpoint: input().endpoint,
          adminUserId: admin.userId,
          driverId: driver.id!,
        },
      }),
    );
    ok(
      "super admins and granted admins can subscribe without operational accounts; ownership and exclusive-owner constraints block hijacking",
    );
    const key = randomUUID(),
      message = {
        type: "sendAdminMessage" as const,
        title: "QA partner message",
        message: "Please check our collection schedule.",
      };
    const sent = await Promise.all([
      cmd(partner, message, key),
      cmd(partner, message, key),
    ]);
    assert.deepEqual(sent[0], sent[1]);
    await cmd(driver, { ...message, title: "QA rider message" });
    for (const who of [admin, { ...partner, status: "SUSPENDED" }])
      await assert.rejects(cmd(who, message), { status: 403 });
    for (const recipient of [admin.userId, staff.userId]) {
      const notices = await db.deliveryNotification.findMany({
        where: {
          recipient,
          workspace: "ADMIN",
          title: { in: [message.title, "QA rider message"] },
        },
      });
      assert.equal(notices.length, 2);
      for (const notice of notices)
        assert.equal(
          await db.deliveryPushMessage.count({
            where: { notificationId: notice.id },
          }),
          1,
        );
    }
    const history = async (who: Actor) =>
      deliveryQuery(
        who,
        "sent-admin-messages",
        new URLSearchParams(),
      ) as Promise<{ items: { actor: string; role: string }[]; total: number }>;
    assert.equal((await history(partner)).total, 1);
    assert.equal((await history(driver)).total, 1);
    assert.equal((await history(other)).total, 0);
    await assert.rejects(history(admin), { status: 403 });
    ok(
      "partner/rider messages reach each admin exactly once, with isolated sent history and no client-chosen recipient",
    );
    const delivered: { endpoint: string; payload: string }[] = [];
    await dispatchRiderPush(async (s, payload) => {
      delivered.push({ endpoint: s.endpoint, payload });
    });
    assert(delivered.some((s) => s.endpoint === rootSub.endpoint));
    assert(delivered.some((s) => s.endpoint === staffSub.endpoint));
    for (const item of delivered) {
      assert.equal(JSON.parse(item.payload).url, "/delivery/notifications");
      assert(!item.payload.includes("collection schedule"));
    }
    ok(
      "admin pushes use the admin inbox and keep custom message contents off the lock screen",
    );
    const parcel = await db.deliveryParcel.create({
      data: {
        publicId: `ADMIN-PAY-${randomUUID()}`,
        partnerId: partner.partnerId!,
        externalReference: randomUUID(),
        recipientName: "QA customer",
        recipientPhone: "7771234",
        destination: "QA destination",
        zone: "MALE",
        origin: "MALE",
        destinationLabel: "Malé",
        fee: 2500,
      },
    });
    await cmd(admin, {
      type: "assign",
      driverId: driver.id!,
      parcelIds: [parcel.id],
    });
    await cmd(driver, { type: "pickup", parcelIds: [parcel.id] });
    await cmd(driver, { type: "deliver", parcelId: parcel.id });
    const issued = await cmd(admin, {
      type: "createPartnerInvoice",
      partnerId: partner.partnerId!,
      expectedCount: 1,
      expectedTotal: 2500,
    });
    assert("invoiceId" in issued && typeof issued.invoiceId === "string");
    const invoiceId = issued.invoiceId;
    async function pay(amount: number) {
      const receipt = await db.deliveryReceipt.create({
        data: {
          partnerId: partner.partnerId!,
          path: `${partner.partnerId}/${randomUUID()}.webp`,
          sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          bytes: 100,
          ready: true,
        },
      });
      await cmd(partner, {
        type: "submitPayment",
        invoiceId,
        receiptId: receipt.id,
        bankReference: `QA-${randomUUID()}`,
        amount,
      });
      return db.deliveryPayment.findUniqueOrThrow({
        where: { receiptId: receipt.id },
      });
    }
    const first = await pay(1000);
    assert.equal(
      await db.deliveryNotification.count({
        where: {
          recipient: admin.userId,
          title: "Bank transfer awaiting review",
          targetId: first.id,
        },
      }),
      1,
    );
    assert.equal(
      await db.deliveryNotification.count({
        where: { title: "Invoice paid", targetId: first.id },
      }),
      0,
    );
    assert.equal(
      (await db.deliveryInvoice.findUniqueOrThrow({ where: { id: invoiceId } }))
        .paid,
      0,
    );
    await cmd(admin, {
      type: "reviewPayment",
      paymentId: first.id,
      decision: "CONFIRM",
      confirmedAmount: 1000,
      note: "QA partial verification",
    });
    assert.equal(
      await db.deliveryNotification.count({
        where: {
          recipient: admin.userId,
          title: "Invoice payment verified",
          targetId: first.id,
        },
      }),
      1,
    );
    const final = await pay(1500),
      review = {
        type: "reviewPayment" as const,
        paymentId: final.id,
        decision: "CONFIRM" as const,
        confirmedAmount: 1500,
        note: "QA final verification",
      },
      reviewKey = randomUUID();
    await Promise.all([
      cmd(admin, review, reviewKey),
      cmd(admin, review, reviewKey),
    ]);
    for (const recipient of [admin.userId, staff.userId]) {
      const paidNotice = await db.deliveryNotification.findFirstOrThrow({
        where: {
          recipient,
          workspace: "ADMIN",
          title: "Invoice paid",
          targetId: final.id,
        },
      });
      assert.equal(
        await db.deliveryNotification.count({
          where: { recipient, title: "Invoice paid", targetId: final.id },
        }),
        1,
      );
      assert.equal(
        await db.deliveryPushMessage.count({
          where: { notificationId: paidNotice.id },
        }),
        1,
      );
    }
    ok(
      "receipt submission, partial verification and fully paid invoices generate distinct retry-safe admin alerts without premature payment credit",
    );
    await db.deliveryAdminGrant.update({
      where: { id: grant.id },
      data: { active: false, revokedAt: new Date(), revokedBy: admin.userId },
    });
    await assert.rejects(savePushSubscription(staff, staffSub), {
      status: 403,
    });
    await assert.rejects(cmd(staff, { type: "testPush" }), { status: 403 });
    const rootDevice = await db.deliveryPushSubscription.findUniqueOrThrow({
      where: { endpoint: rootSub.endpoint },
    });
    await cmd(admin, { type: "clearNotices" });
    assert.equal(
      await db.deliveryPushMessage.count({
        where: { subscriptionId: rootDevice.id },
      }),
      0,
    );
    const after: string[] = [];
    await dispatchRiderPush(async (s) => {
      after.push(s.endpoint);
    });
    assert(!after.includes(staffSub.endpoint));
    assert.equal(
      await db.deliveryPushMessage.count({
        where: {
          subscription: { adminUserId: staff.userId },
          state: "PENDING",
        },
      }),
      0,
    );
    assert.equal((await history(partner)).total, 1);
    await cmd(admin, { type: "testPush" });
    await dispatchRiderPush(async (s) => {
      after.push(s.endpoint);
    });
    assert(after.includes(rootSub.endpoint));
    await savePushSubscription(admin, {
      action: "unsubscribe",
      endpoint: rootSub.endpoint,
    });
    assert.equal(
      await db.deliveryPushSubscription.count({
        where: { adminUserId: admin.userId },
      }),
      0,
    );
    ok(
      "revocation blocks queued admin push and stale commands; clear-all preserves sent audit and device settings; admin test/unsubscribe work",
    );
  } finally {
    await db.deliveryPushSubscription.deleteMany({
      where: { adminUserId: { in: [admin.userId, staff.userId] } },
    });
    vars.forEach((v, i) => {
      if (previous[i] === undefined) delete process.env[v];
      else process.env[v] = previous[i];
    });
  }
}
