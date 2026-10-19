import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import {
  dispatchRiderPush,
  savePushSubscription,
  type PushSender,
} from "../src/lib/delivery/push";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";
import type { RiderSnapshot } from "../src/lib/delivery/rider-contract";

export async function verifyRiderWorkflows(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  ok: (label: string) => void,
) {
  const cmd = (who: Actor, value: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(who, key, value);
  const applicant: Actor = {
    userId: `qa_rider_${randomUUID()}`,
    id: null,
    partnerId: null,
    role: "APPLICANT",
    status: "UNREGISTERED",
    name: "QA Rider",
  };
  await cmd(applicant, {
    type: "apply",
    application: { role: "DRIVER", name: "QA Rider", phone: "7771234" },
  });
  const account = await db.deliveryAccount.findUniqueOrThrow({
    where: {
      clerkUserId_role: { clerkUserId: applicant.userId, role: "DRIVER" },
    },
  });
  const rider: Actor = {
    ...applicant,
    id: account.id,
    role: "DRIVER",
    status: "PENDING",
  };
  assert.equal(account.status, "PENDING");
  await assert.rejects(
    deliveryQuery(rider, "rider-workspace", new URLSearchParams()),
  );
  await assert.rejects(
    cmd(admin, {
      type: "assign",
      parcelIds: [randomUUID()],
      driverId: account.id,
    }),
  );
  await assert.rejects(
    cmd(partner, {
      type: "reviewAccount",
      accountId: account.id,
      status: "APPROVED",
      note: "Forbidden approval",
    }),
  );
  ok(
    "rider registration is pending; neither partners nor applicants can approve access",
  );
  await cmd(admin, {
    type: "reviewAccount",
    accountId: account.id,
    status: "APPROVED",
    note: "QA rider reviewed",
  });
  rider.status = "APPROVED";
  await assert.rejects(
    deliveryQuery(partner, "rider-workspace", new URLSearchParams()),
  );
  await assert.rejects(deliveryQuery(rider, "drivers", new URLSearchParams()));
  ok("rider workspace and admin rider directory enforce separate server roles");
  const saved = {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY,
    subject: process.env.WEB_PUSH_SUBJECT,
  };
  const vapid = webpush.generateVAPIDKeys();
  process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
  process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;
  process.env.WEB_PUSH_SUBJECT = "https://example.com";
  try {
    const input = {
      action: "subscribe",
      endpoint: `https://fcm.googleapis.com/fcm/send/igo-qa-${randomUUID()}`,
      keys: { p256dh: vapid.publicKey, auth: "a".repeat(22) },
    };
    await savePushSubscription(rider, input);
    await savePushSubscription(rider, input);
    assert.equal(
      await db.deliveryPushSubscription.count({
        where: { driverId: rider.id! },
      }),
      1,
    );
    await assert.rejects(savePushSubscription(partner, input));
    const foreignAccount = await db.deliveryAccount.create({
      data: {
        name: "Other QA rider",
        phone: "7771234",
        role: "DRIVER",
        status: "APPROVED",
        clerkUserId: `qa_other_${randomUUID()}`,
      },
    });
    const foreign: Actor = {
      ...rider,
      userId: foreignAccount.clerkUserId,
      id: foreignAccount.id,
    };
    await assert.rejects(savePushSubscription(foreign, input));
    await assert.rejects(
      savePushSubscription({ ...rider, userId: foreign.userId }, input),
    );
    ok(
      "push subscriptions are idempotent, approved-rider-only and cannot be stolen by another account",
    );
    for (let n = 0; n < 12; n++)
      await cmd(partner, {
        type: "register",
        parcel: {
          externalReference: `RIDER-${n}`,
          recipientName: "Private QA Recipient",
          recipientPhone: "7771234",
          destination: "Private QA building, Malé",
          zone: "MALE",
          description: "QA only",
        },
      });
    const parcels = await db.deliveryParcel.findMany({
      where: {
        partnerId: partner.partnerId!,
        externalReference: { startsWith: "RIDER-" },
      },
    });
    const assign = {
        type: "assign" as const,
        parcelIds: parcels.map((p) => p.id),
        driverId: rider.id!,
      },
      key = randomUUID();
    await cmd(admin, assign, key);
    await cmd(admin, assign, key);
    const queued = await db.deliveryPushMessage.findMany({
      include: { notification: true },
    });
    assert.equal(queued.length, 1);
    assert.equal(queued[0].notification.title, "Collection assigned");
    await assert.rejects(
      db.deliveryPushMessage.create({
        data: {
          notificationId: queued[0].notificationId,
          subscriptionId: queued[0].subscriptionId,
        },
      }),
    );
    ok(
      "assignment enqueues a durable push transactionally and replay cannot duplicate its message",
    );
    const first = (await deliveryQuery(
      rider,
      "rider-workspace",
      new URLSearchParams("screen=collections&stage=TO_PICKUP&page=1"),
    )) as RiderSnapshot;
    const second = (await deliveryQuery(
      rider,
      "rider-workspace",
      new URLSearchParams("screen=collections&stage=TO_PICKUP&page=2"),
    )) as RiderSnapshot;
    assert.equal(first.work.items.length, 10);
    assert.equal(second.work.items.length, 2);
    assert.equal(first.summary.collections, 12);
    assert.equal(
      new Set([...first.work.items, ...second.work.items].map((p) => p.id))
        .size,
      12,
    );
    assert.equal(
      (
        (await deliveryQuery(
          foreign,
          "rider-workspace",
          new URLSearchParams("stage=TO_PICKUP"),
        )) as RiderSnapshot
      ).work.total,
      0,
    );
    assert.equal(
      await db.deliveryParcel.count({
        where: {
          id: { in: parcels.map((p) => p.id) },
          state: "REGISTERED",
          pickedUpAt: null,
        },
      }),
      12,
    );
    ok(
      "rider stops paginate at ten, exclude other riders and do not record pickup on read",
    );
    let sends = 0;
    const sender: PushSender = async (_subscription, payload) => {
      sends++;
      assert(!payload.includes("Private QA"));
      assert(!payload.includes("7771234"));
    };
    await Promise.all([dispatchRiderPush(sender), dispatchRiderPush(sender)]);
    assert.equal(sends, 1);
    assert.equal(
      (
        await db.deliveryPushMessage.findUniqueOrThrow({
          where: { id: queued[0].id },
        })
      ).state,
      "SENT",
    );
    ok(
      "concurrent push workers claim a message once and send a generic lock-screen payload",
    );
    async function job(read = false) {
      const notice = await db.deliveryNotification.create({
        data: {
          recipient: rider.userId,
          title: "Collection assigned",
          message: "Private QA body",
          readAt: read ? new Date() : null,
        },
      });
      const subscription = await db.deliveryPushSubscription.findFirstOrThrow({
        where: { driverId: rider.id! },
      });
      return db.deliveryPushMessage.create({
        data: { notificationId: notice.id, subscriptionId: subscription.id },
      });
    }
    const transient = await job();
    await dispatchRiderPush(async () => {
      throw Object.assign(new Error("sensitive provider body"), {
        statusCode: 503,
      });
    });
    const retry = await db.deliveryPushMessage.findUniqueOrThrow({
      where: { id: transient.id },
    });
    assert.equal(retry.state, "PENDING");
    assert.equal(retry.attempts, 1);
    assert.equal(retry.lastError, "HTTP_503");
    assert(retry.nextAttemptAt > new Date());
    await dispatchRiderPush(sender);
    assert.equal(sends, 1);
    await db.deliveryPushMessage.update({
      where: { id: transient.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await dispatchRiderPush(sender);
    assert.equal(sends, 2);
    ok(
      "transient push failures retain their queue entry, back off and retry without leaking provider data",
    );
    const read = await job(true);
    await dispatchRiderPush(sender);
    assert.equal(
      (
        await db.deliveryPushMessage.findUniqueOrThrow({
          where: { id: read.id },
        })
      ).state,
      "DISCARDED",
    );
    const staleLease = await job();
    await db.deliveryPushMessage.update({
      where: { id: staleLease.id },
      data: { leaseToken: randomUUID(), leaseUntil: new Date(0) },
    });
    await dispatchRiderPush(sender);
    assert.equal(sends, 3);
    ok("read notifications are suppressed and expired worker leases recover");
    const permanent = await job();
    await dispatchRiderPush(async () => {
      throw { statusCode: 401 };
    });
    assert.equal(
      (
        await db.deliveryPushMessage.findUniqueOrThrow({
          where: { id: permanent.id },
        })
      ).state,
      "FAILED",
    );
    await job();
    await dispatchRiderPush(async () => {
      throw { statusCode: 410 };
    });
    assert.equal(
      await db.deliveryPushSubscription.count({
        where: { driverId: rider.id! },
      }),
      0,
    );
    ok(
      "permanent failures stop retrying and expired browser subscriptions are removed",
    );
    await savePushSubscription(rider, input);
    await assert.rejects(
      cmd(foreign, { type: "pickup", parcelIds: [parcels[0].id] }),
    );
    await cmd(rider, { type: "pickup", parcelIds: [parcels[0].id] });
    const active = (await deliveryQuery(
      rider,
      "rider-workspace",
      new URLSearchParams("screen=deliveries"),
    )) as RiderSnapshot;
    assert.equal(active.work.total, 1);
    assert.equal(active.summary.collections, 11);
    const deliveryKey = randomUUID(),
      completion = {
        type: "deliver" as const,
        parcelId: parcels[0].id,
      };
    await Promise.all([
      cmd(rider, completion, deliveryKey),
      cmd(rider, completion, deliveryKey),
    ]);
    const history = (await deliveryQuery(
      rider,
      "rider-workspace",
      new URLSearchParams("screen=history"),
    )) as RiderSnapshot;
    assert.equal(history.work.total, 1);
    assert.equal(typeof history.summary.available, "number");
    assert.equal(history.summary.onBoard, 0);
    const delivered = await db.deliveryParcel.findUniqueOrThrow({
      where: { id: parcels[0].id },
    });
    assert.equal(delivered.deliveredBy, rider.userId);
    assert(delivered.deliveredAt && delivered.pickedUpAt);
    ok(
      "explicit pickup and delivery update only this rider's packages and history once",
    );
    const suspended = await job();
    await cmd(admin, {
      type: "reviewAccount",
      accountId: rider.id!,
      status: "SUSPENDED",
      note: "QA suspended rider",
    });
    await assert.rejects(savePushSubscription(rider, input));
    await assert.rejects(
      cmd(rider, { type: "pickup", parcelIds: [parcels[1].id] }),
    );
    await dispatchRiderPush(sender);
    assert.equal(
      (
        await db.deliveryPushMessage.findUniqueOrThrow({
          where: { id: suspended.id },
        })
      ).state,
      "DISCARDED",
    );
    ok("suspension blocks stale rider commands and prevents background pushes");
  } finally {
    for (const [key, value] of Object.entries({
      WEB_PUSH_PUBLIC_KEY: saved.publicKey,
      WEB_PUSH_PRIVATE_KEY: saved.privateKey,
      WEB_PUSH_SUBJECT: saved.subject,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
