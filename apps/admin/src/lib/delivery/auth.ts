import "server-only";
import { actorForIdentity, isSuperAdmin } from "./admin-policy";
import type { DeliveryWorkspace } from "./workspace-contract";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { database } from "../db";
import { hasClerkKeys } from "../mode";
import { DeliveryError, type Actor } from "./domain";
import { activateApprovedPartner } from "./partner-applications";
import { verifiedPrimaryEmail } from "./partner-application-input";

export async function deliveryActor(
  workspace?: DeliveryWorkspace,
  strict = true,
): Promise<Actor> {
  if (!hasClerkKeys())
    throw new DeliveryError("Clerk authentication is not configured.", 503);
  const { userId } = await auth();
  if (!userId) throw new DeliveryError("Please sign in.", 401);
  const grant = isSuperAdmin(userId)
    ? null
    : await database().deliveryAdminGrant.findUnique({
        where: { clerkUserId: userId },
        select: { active: true, name: true },
      });
  let account = await database().deliveryAccount.findUnique({
    where: { clerkUserId: userId },
    include: {
      partner: { include: { application: { select: { logoReady: true } } } },
    },
  });
  if (
    !account &&
    ((!isSuperAdmin(userId) && !grant?.active) ||
      workspace === "PARTNER" ||
      workspace === "DRIVER")
  ) {
    const user = await (await clerkClient()).users.getUser(userId);
    const email = verifiedPrimaryEmail(user);
    if (email && (await activateApprovedPartner(userId, email)))
      account = await database().deliveryAccount.findUnique({
        where: { clerkUserId: userId },
        include: {
          partner: {
            include: { application: { select: { logoReady: true } } },
          },
        },
      });
  }
  return actorForIdentity({ userId, account, grant }, workspace, strict);
}
