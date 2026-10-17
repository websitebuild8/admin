import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isSuperAdmin } from "./admin-policy";
import { adminLock } from "./admin-authorization";
import { DeliveryError, type Actor } from "./domain";

type Store = Pick<
  Prisma.TransactionClient,
  "deliveryAccount" | "deliveryAdminGrant" | "$executeRaw"
>;
export async function lockRoleIdentity(tx: Store, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${adminLock(userId)},0))`;
}
export async function multiRoleAllowed(tx: Store, userId: string) {
  return (
    isSuperAdmin(userId) ||
    !!(
      await tx.deliveryAdminGrant.findUnique({
        where: { clerkUserId: userId },
        select: { active: true },
      })
    )?.active
  );
}
export async function roleAccounts(tx: Store, userId: string) {
  return tx.deliveryAccount.findMany({
    where: { clerkUserId: userId },
    orderBy: [{ primary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}
// A narrow transaction-local permit for the configured root identity (which
// intentionally has no DB admin grant), or for root-controlled role retention.
export async function permitRoleIdentity(tx: Store, userId: string) {
  await tx.$executeRaw`SELECT set_config('igo.role_identity', ${userId}, true)`;
}
export async function assertRoleCreation(
  tx: Store,
  userId: string,
  role: "PARTNER" | "DRIVER",
) {
  await lockRoleIdentity(tx, userId);
  const accounts = await roleAccounts(tx, userId);
  if (accounts.some((a) => a.role === role))
    throw new DeliveryError(
      "This workspace already exists. Open it with Switch workspace.",
      409,
    );
  if (accounts.length && !(await multiRoleAllowed(tx, userId)))
    throw new DeliveryError(
      "Only approved administrators can use partner and rider roles with the same sign-in. Your existing role is unchanged.",
      403,
    );
  if (isSuperAdmin(userId)) await permitRoleIdentity(tx, userId);
  if (accounts.length && !accounts.some((a) => a.primary))
    await tx.deliveryAccount.update({
      where: { id: accounts[0].id },
      data: { primary: true },
    });
  return accounts.length === 0;
}
export async function assertOperationalActor(tx: Store, actor: Actor) {
  await lockRoleIdentity(tx, actor.userId);
  const current = await tx.deliveryAccount.findUnique({
    where: {
      clerkUserId_role: {
        clerkUserId: actor.userId,
        role: actor.role as "PARTNER" | "DRIVER",
      },
    },
    include: { partner: { select: { id: true } } },
  });
  if (
    !current ||
    current.id !== actor.id ||
    current.status !== "APPROVED" ||
    (current.partner?.id ?? null) !== actor.partnerId
  )
    throw new DeliveryError(
      "Your approved access has changed. Sign in again.",
      403,
    );
  const accounts = await roleAccounts(tx, actor.userId);
  if (
    accounts[0]?.id !== current.id &&
    !(await multiRoleAllowed(tx, actor.userId))
  )
    throw new DeliveryError(
      "This extra workspace is available only while you have administrator access. Switch to your retained workspace.",
      403,
    );
}
