import "server-only";
import { z } from "zod";
import { createClerkClient } from "@clerk/backend";
import { database } from "../db";
import { audit, notify, serialized } from "./commands";
import { adminLock } from "./admin-authorization";
import { isSuperAdmin, requireSuperAdmin, superAdminIds } from "./admin-policy";
import { verifiedPrimaryEmail } from "./partner-application-input";
import { DeliveryError, type Actor } from "./domain";
import { provisionAdminWorkspaces } from "./admin-workspaces";
import { permitRoleIdentity, roleAccounts } from "./role-authorization";
import { dateFilter } from "./reporting-period";
const reason = z.string().trim().min(3).max(500);
export const adminAccessInput = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("GRANT"),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    reason,
  }),
  z.strictObject({
    action: z.literal("REVOKE"),
    grantId: z.uuid(),
    reason,
    retainRole: z.enum(["PARTNER", "DRIVER"]).optional(),
  }),
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
      if (previous?.active) {
        await provisionAdminWorkspaces(tx, actor, {
          userId: target.userId,
          name: target.name,
        });
        return { message: "This account already has administrator access." };
      }
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
      await provisionAdminWorkspaces(tx, actor, {
        userId: target.userId,
        name: target.name,
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
        "The super admin granted administrator access. Admin, Partner and Rider workspaces are now available in Switch workspace without another registration.",
        "ADMIN",
      );
      return {
        message:
          "Administrator access granted with Partner and Rider workspaces included automatically.",
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
    const profiles = await roleAccounts(tx, grant.clerkUserId);
    const rider = profiles.find((profile) => profile.role === "DRIVER");
    const hasPickup =
      !!rider &&
      !!(await tx.deliveryParcel.count({
        where: { driverId: rider.id, state: "PICKED_UP" },
      }));
    const retainedRole =
      input.retainRole ?? (hasPickup ? "DRIVER" : profiles[0]?.role);
    if (hasPickup && retainedRole !== "DRIVER")
      throw new DeliveryError(
        "This person has picked-up packages. Retain the Rider workspace until those deliveries are completed.",
        409,
      );
    const retained = profiles.find((profile) => profile.role === retainedRole);
    if (input.retainRole && !retained)
      throw new DeliveryError(
        "Choose one of this person's existing operational workspaces.",
        409,
      );
    const unassigned =
      rider && retainedRole !== "DRIVER"
        ? await tx.deliveryParcel.updateMany({
            where: { driverId: rider.id, state: "REGISTERED" },
            data: { driverId: null },
          })
        : { count: 0 };
    await permitRoleIdentity(tx, grant.clerkUserId);
    // The root explicitly decides which single operational role remains.
    await tx.deliveryAccount.updateMany({
      where: { clerkUserId: grant.clerkUserId },
      data: { primary: false },
    });
    if (retained)
      await tx.deliveryAccount.update({
        where: { id: retained.id },
        data: { primary: true },
      });
    await tx.deliveryAccount.updateMany({
      where: {
        clerkUserId: grant.clerkUserId,
        ...(retained ? { id: { not: retained.id } } : {}),
      },
      data: {
        status: "SUSPENDED",
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
        reviewNote:
          "Additional workspace disabled when administrator access was removed.",
      },
    });
    await tx.deliveryAdminGrant.update({
      where: { id: grant.id },
      data: { active: false, revokedBy: actor.userId, revokedAt: new Date() },
    });
    await audit(tx, actor, "ADMIN_ACCESS_REVOKED", grant.id, {
      targetUserId: grant.clerkUserId,
      email: grant.email,
      reason: input.reason,
      retainedRole: retainedRole ?? null,
      unassignedPackages: unassigned.count,
    });
    await notify(
      tx,
      grant.clerkUserId,
      "Administrator access removed",
      `Your administrator access has been removed. ${retainedRole === "DRIVER" ? "Rider" : retainedRole === "PARTNER" ? "Partner" : "No operational"} access remains; additional workspace access has been disabled.`,
    );
    return {
      message: `Administrator access removed. ${retainedRole === "DRIVER" ? "Rider" : retainedRole === "PARTNER" ? "Partner" : "No operational"} access retained; additional workspace suspended. History is preserved.`,
    };
  });
}
export async function administrators(
  actor: Actor,
  page: number,
  search = new URLSearchParams(),
) {
  requireSuperAdmin(actor);
  const db = database();
  const where = { grantedAt: dateFilter(search) };
  const [items, total] = await Promise.all([
    db.deliveryAdminGrant.findMany({
      where,
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
      take: 10,
      skip: (page - 1) * 10,
    }),
    db.deliveryAdminGrant.count({ where }),
  ]);
  const accounts = await db.deliveryAccount.findMany({
    where: { clerkUserId: { in: items.map((item) => item.clerkUserId) } },
    select: { clerkUserId: true, role: true, status: true, primary: true },
    orderBy: [{ primary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return {
    items: items.map((item) => ({
      ...item,
      protected: isSuperAdmin(item.clerkUserId),
      account:
        accounts.find((account) => account.clerkUserId === item.clerkUserId) ??
        null,
      accounts: accounts.filter(
        (account) => account.clerkUserId === item.clerkUserId,
      ),
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
