import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { assertAdministrator } from "./admin-authorization";
import { audit, type Tx } from "./commands";
import { DeliveryError, type Actor } from "./domain";
import { isSuperAdmin } from "./admin-policy";
import {
  lockRoleIdentity,
  multiRoleAllowed,
  permitRoleIdentity,
  roleAccounts,
} from "./role-authorization";

export async function provisionAdminWorkspaces(
  tx: Tx,
  actor: Actor,
  identity: { userId: string; name: string; phone?: string },
) {
  await lockRoleIdentity(tx, identity.userId);
  if (!(await multiRoleAllowed(tx, identity.userId)))
    throw new DeliveryError(
      "Only current administrators receive all three workspaces.",
      403,
    );
  if (isSuperAdmin(identity.userId))
    await permitRoleIdentity(tx, identity.userId);
  let existing = await roleAccounts(tx, identity.userId);
  const changed: Prisma.InputJsonObject[] = [];
  if (existing.length && !existing.some((a) => a.primary)) {
    await tx.deliveryAccount.update({
      where: { id: existing[0].id },
      data: { primary: true },
    });
    existing = await roleAccounts(tx, identity.userId);
  }
  for (const role of ["PARTNER", "DRIVER"] as const) {
    const current = existing.find((account) => account.role === role);
    if (current) {
      if (
        role === "PARTNER" &&
        !(await tx.deliveryPartner.findUnique({
          where: { accountId: current.id },
          select: { id: true },
        }))
      ) {
        await tx.deliveryPartner.create({
          data: {
            accountId: current.id,
            businessName: current.name,
            pageUrl: "",
            pickupAddress: "",
            pickupArea: "",
            operatingLocation: null,
          },
        });
        changed.push({ id: current.id, role, businessProfileCreated: true });
      }
      if (current.status !== "APPROVED") {
        await tx.deliveryAccount.update({
          where: { id: current.id },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedBy: actor.userId,
            reviewNote:
              "Automatically included with approved administrator access.",
          },
        });
        changed.push({ id: current.id, role, previousStatus: current.status });
      }
      continue;
    }
    const account = await tx.deliveryAccount.create({
      data: {
        clerkUserId: identity.userId,
        role,
        primary: existing.length === 0,
        name: existing[0]?.name ?? identity.name,
        phone: existing[0]?.phone ?? identity.phone ?? "",
        status: "APPROVED",
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
        reviewNote:
          "Automatically included with approved administrator access.",
        ...(role === "PARTNER"
          ? {
              partner: {
                create: {
                  businessName: existing[0]?.name ?? identity.name,
                  pageUrl: "",
                  pickupAddress: "",
                  pickupArea: "",
                  operatingLocation: null,
                },
              },
            }
          : {}),
      },
    });
    existing.push(account);
    changed.push({ id: account.id, role, created: true });
  }
  if (changed.length)
    await audit(tx, actor, "ADMIN_WORKSPACES_ENABLED", identity.userId, {
      profiles: changed,
    });
}

export async function ensureAdminWorkspaces(
  actor: Actor,
  known?: {
    name: string;
    role: string;
    status: string;
    partner: { id: string } | null;
  }[],
) {
  const db = database();
  const accounts =
    known ??
    (await db.deliveryAccount.findMany({
      where: { clerkUserId: actor.userId },
      include: { partner: { select: { id: true } } },
    }));
  if (
    accounts.length === 2 &&
    accounts.every((a) => a.status === "APPROVED") &&
    accounts.some((a) => a.role === "PARTNER" && a.partner)
  )
    return false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          await assertAdministrator(tx, actor);
          await provisionAdminWorkspaces(tx, actor, {
            userId: actor.userId,
            name: accounts[0]?.name ?? actor.name,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 20000,
        },
      );
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 4
      )
        continue;
      throw error;
    }
  }
}
