import "server-only";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { database } from "../db";
import { audit, notify, serialized } from "./commands";
import { adminLock } from "./admin-authorization";
import { isSuperAdmin, requireSuperAdmin, superAdminIds } from "./admin-policy";
import { verifiedPrimaryEmail } from "./partner-application-input";
import { DeliveryError, type Actor } from "./domain";
const reason = z.string().trim().min(3).max(500);
export const adminAccessInput = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("GRANT"),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    reason,
  }),
  z.strictObject({ action: z.literal("REVOKE"), grantId: z.uuid(), reason }),
]);
type Input = z.output<typeof adminAccessInput>;
export type AdminIdentity = { userId: string; email: string; name: string };
export type AdminDirectory = (email: string) => Promise<AdminIdentity>;
export const clerkAdminDirectory: AdminDirectory = async (email) => {
  if (!process.env.CLERK_SECRET_KEY)
    throw new DeliveryError("Clerk needs server configuration.", 503);
  const users = await createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  }).users.getUserList({ emailAddress: [email], limit: 10 });
  const matches = users.data.filter(
    (user) => verifiedPrimaryEmail(user) === email,
  );
  if (matches.length !== 1)
    throw new DeliveryError(
      "Use an existing Clerk account’s verified primary email. The person can register as a partner or rider first, or you can create their account in Clerk.",
      400,
    );
  const user = matches[0];
  return {
    userId: user.id,
    email,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      email,
  };
};
export async function manageAdministrator(
  actor: Actor,
  key: string,
  input: Input,
  directory: AdminDirectory = clerkAdminDirectory,
) {
  requireSuperAdmin(actor);
  const identity =
    input.action === "GRANT" ? await directory(input.email) : null;
  if (input.action === "GRANT" && identity && identity.email !== input.email)
    throw new DeliveryError(
      "The verified account does not match that email.",
      409,
    );
  if (identity && isSuperAdmin(identity.userId))
    throw new DeliveryError(
      "This account is already a protected super admin.",
      409,
    );
  return serialized(actor, key, input, async (tx) => {
    // Re-check the configured super admin; a client-supplied flag grants nothing.
    requireSuperAdmin(actor);
    if (input.action === "GRANT") {
      const target = identity!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${adminLock(target.userId)},0))`;
      const previous = await tx.deliveryAdminGrant.findUnique({
        where: { clerkUserId: target.userId },
      });
      if (previous?.active)
        return { message: "This account already has administrator access." };
      const grant = await tx.deliveryAdminGrant.upsert({
        where: { clerkUserId: target.userId },
        create: {
          clerkUserId: target.userId,
          email: target.email,
          name: target.name,
          grantedBy: actor.userId,
        },
        update: {
          active: true,
          email: target.email,
          name: target.name,
          grantedBy: actor.userId,
          grantedAt: new Date(),
          revokedBy: null,
          revokedAt: null,
        },
      });
      await audit(tx, actor, "ADMIN_ACCESS_GRANTED", grant.id, {
        targetUserId: target.userId,
        email: target.email,
        reason: input.reason,
        reactivated: !!previous,
      });
      await notify(
        tx,
        target.userId,
        "Administrator access granted",
        "The super admin granted administrator access. Use Switch workspace to open Admin. Your existing partner or rider access is unchanged.",
      );
      return {
        message:
          "Administrator access granted. Existing partner or rider access is unchanged.",
      };
    }
    const grant = await tx.deliveryAdminGrant.findUnique({
      where: { id: input.grantId },
    });
    if (!grant) throw new DeliveryError("Administrator record not found.", 404);
    if (isSuperAdmin(grant.clerkUserId))
      throw new DeliveryError(
        "A protected super admin cannot be removed here.",
        403,
      );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${adminLock(grant.clerkUserId)},0))`;
    if (!grant.active)
      return { message: "Administrator access was already removed." };
    await tx.deliveryAdminGrant.update({
      where: { id: grant.id },
      data: { active: false, revokedBy: actor.userId, revokedAt: new Date() },
    });
    await audit(tx, actor, "ADMIN_ACCESS_REVOKED", grant.id, {
      targetUserId: grant.clerkUserId,
      email: grant.email,
      reason: input.reason,
    });
    await notify(
      tx,
      grant.clerkUserId,
      "Administrator access removed",
      "Your administrator access has been removed. Your approved partner or rider workspace remains available.",
    );
    return {
      message:
        "Administrator access removed. Partner and rider records remain unchanged.",
    };
  });
}
export async function administrators(actor: Actor, page: number) {
  requireSuperAdmin(actor);
  const db = database();
  const [items, total] = await Promise.all([
    db.deliveryAdminGrant.findMany({
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
      take: 10,
      skip: (page - 1) * 10,
    }),
    db.deliveryAdminGrant.count(),
  ]);
  const accounts = await db.deliveryAccount.findMany({
    where: { clerkUserId: { in: items.map((item) => item.clerkUserId) } },
    select: { clerkUserId: true, role: true, status: true },
  });
  return {
    items: items.map((item) => ({
      ...item,
      protected: isSuperAdmin(item.clerkUserId),
      account:
        accounts.find((account) => account.clerkUserId === item.clerkUserId) ??
        null,
    })),
    total,
    page,
    pageSize: 10,
    superAdmins: superAdminIds().map((userId) => ({
      userId,
      current: userId === actor.userId,
    })),
  };
}
