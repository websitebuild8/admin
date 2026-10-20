import "server-only";
import { createHash, randomUUID } from "node:crypto";
import webpush from "web-push";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import {
  allowedPushEndpoint,
  pushRetry,
  pushSubscriptionInput,
} from "./rider-contract";
import { superAdminIds } from "./admin-policy";
import { workspacePushPayload } from "./notification-contract";
import { assertOperationalActor } from "./role-authorization";
import {
  assertAdministrator,
  hasAdministratorAccess,
} from "./admin-authorization";
import { pushSettings } from "./push-settings";

export async function savePushSubscription(actor: Actor, raw: unknown) {
  requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
  const input = pushSubscriptionInput.parse(raw);
  if (input.action === "subscribe" && !pushSettings())
    throw new DeliveryError("Background alerts are not configured yet.", 503);
  return database().$transaction(async (tx) => {
    if (actor.role === "ADMIN") await assertAdministrator(tx, actor);
    else await assertOperationalActor(tx, actor);
    const lock = createHash("sha256").update(input.endpoint).digest("hex");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"push:" + lock},0))`;
    const owner =
      actor.role === "ADMIN"
        ? { adminUserId: actor.userId }
        : { driverId: actor.id! };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"push-owner:" + actor.role + ":" + actor.userId},0))`;
    const existing = await tx.deliveryPushSubscription.findUnique({
      where: { endpoint: input.endpoint },
    });
    if (
      existing &&
      (actor.role === "ADMIN"
        ? existing.adminUserId !== actor.userId
        : existing.driverId !== actor.id || existing.adminUserId !== null)
    )
      throw new DeliveryError(
        "This browser is linked to a different account. Disable its old subscription before enabling this account.",
        409,
      );
    if (input.action === "unsubscribe") {
      if (existing)
        await tx.deliveryPushSubscription.delete({
          where: { id: existing.id },
        });
      return { message: "Background alerts disabled on this browser." };
    }
    if (
      !existing &&
      (await tx.deliveryPushSubscription.count({
        where: owner,
      })) >= 5
    )
      throw new DeliveryError(
        "Five browsers are already enabled. Remove an old device before adding another.",
        409,
      );
    await tx.deliveryPushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { ...owner, endpoint: input.endpoint, ...input.keys },
      update: input.keys,
    });
    return { message: "Background alerts enabled on this browser." };
  });
}

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<unknown>;
export async function dispatchRiderPush(sender?: PushSender) {
  if (sender && process.env.NODE_ENV !== "test")
    throw new Error(
      "A test push sender is only allowed in an isolated test run.",
    );
  const settings = pushSettings();
  if (!settings && !sender) return { configured: false, processed: 0 };
  const db = database(),
    token = randomUUID();
  const schema =
    process.env.NODE_ENV === "test" &&
    /^igo_qa_[a-f0-9]+$/.test(process.env.IGO_DELIVERY_TEST_SCHEMA ?? "")
      ? process.env.IGO_DELIVERY_TEST_SCHEMA!
      : "public";
  const jobs = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${schema}"."DeliveryPushMessage"`)} WHERE "state"='PENDING' AND "nextAttemptAt"<=now() AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "createdAt","id" FOR UPDATE SKIP LOCKED LIMIT 10`,
    );
    if (!rows.length) return [];
    await tx.deliveryPushMessage.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
      },
    });
    return tx.deliveryPushMessage.findMany({
      where: { leaseToken: token },
      include: {
        notification: true,
        subscription: { include: { driver: true } },
      },
    });
  });
  const secondaryUsers = [
    ...new Set(
      jobs.flatMap((j) =>
        j.subscription.driver && !j.subscription.driver.primary
          ? [j.subscription.driver.clerkUserId]
          : [],
      ),
    ),
  ];
  const activeGrants = secondaryUsers.length
    ? await db.deliveryAdminGrant.findMany({
        where: { clerkUserId: { in: secondaryUsers }, active: true },
        select: { clerkUserId: true },
      })
    : [];
  const extraAccess = new Set([
    ...superAdminIds(),
    ...activeGrants.map((g) => g.clerkUserId),
  ]);
  const send: PushSender =
    sender ??
    ((subscription, payload) =>
      webpush.sendNotification(subscription, payload, {
        vapidDetails: settings!,
        TTL: 3600,
        urgency: "high",
        timeout: 8000,
      }));
  async function deliver(job: (typeof jobs)[number]) {
    const subscription = job.subscription;
    const driver = subscription.driver;
    const admin = subscription.adminUserId;
    const role = admin ? "ADMIN" : driver?.role;
    const allowed = admin
      ? await hasAdministratorAccess(admin)
      : !!driver &&
        driver.status === "APPROVED" &&
        (driver.primary || extraAccess.has(driver.clerkUserId));
    const where = { id: job.id, state: "PENDING", leaseToken: token };
    if (
      !allowed ||
      !role ||
      job.notification.recipient !== (admin ?? driver?.clerkUserId) ||
      !(admin ? ["ADMIN"] : ["ACCOUNT", role]).includes(
        job.notification.workspace,
      ) ||
      job.notification.readAt ||
      job.createdAt.getTime() < Date.now() - 86400000 ||
      !allowedPushEndpoint(subscription.endpoint)
    ) {
      await db.deliveryPushMessage.updateMany({
        where,
        data: {
          state: "DISCARDED",
          completedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return;
    }
    try {
      // The batch may have been leased before the rider cleared their inbox.
      // Never send a deleted/read message from that stale in-memory snapshot.
      const current = await db.deliveryPushMessage.count({
        where: { ...where, notification: { readAt: null } },
      });
      if (!current) return;
      await send(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(workspacePushPayload(job.notification, role)),
      );
      await db.deliveryPushMessage.updateMany({
        where,
        data: {
          state: "SENT",
          completedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
        },
      });
    } catch (error) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : undefined;
      const retry = pushRetry(job.attempts, status);
      if (retry === "expired") {
        await db.deliveryPushSubscription.deleteMany({
          where: { id: subscription.id, driverId: subscription.driverId },
        });
      } else
        await db.deliveryPushMessage.updateMany({
          where,
          data: {
            state: retry === "failed" ? "FAILED" : "PENDING",
            nextAttemptAt: new Date(
              Date.now() + (typeof retry === "number" ? retry : 0),
            ),
            completedAt: retry === "failed" ? new Date() : null,
            leaseToken: null,
            leaseUntil: null,
            lastError: status ? `HTTP_${status}` : "PUSH_SEND_FAILED",
          },
        });
    }
  }
  // Two bounded network requests at a time; expired leases recover on the next tick.
  for (let index = 0; index < jobs.length; index += 2)
    await Promise.all(jobs.slice(index, index + 2).map(deliver));
  return { configured: true, processed: jobs.length };
}
