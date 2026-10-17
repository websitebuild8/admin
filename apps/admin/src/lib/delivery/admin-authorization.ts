import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { isSuperAdmin } from "./admin-policy";
type AdminStore = Pick<
  Prisma.TransactionClient,
  "deliveryAdminGrant" | "$executeRaw"
>;
export const adminLock = (userId: string) => `admin-access:${userId}`;
export async function hasAdministratorAccess(userId: string) {
  if (isSuperAdmin(userId)) return true;
  return !!(
    await database().deliveryAdminGrant.findUnique({
      where: { clerkUserId: userId },
      select: { active: true },
    })
  )?.active;
}
export async function assertAdministrator(tx: AdminStore, actor: Actor) {
  requireRole(actor, "ADMIN");
  if (isSuperAdmin(actor.userId)) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${adminLock(actor.userId)},0))`;
  const grant = await tx.deliveryAdminGrant.findUnique({
    where: { clerkUserId: actor.userId },
    select: { active: true },
  });
  if (!grant?.active)
    throw new DeliveryError(
      "Your administrator access has been removed. Switch to an available workspace or contact the super admin.",
      403,
    );
}
