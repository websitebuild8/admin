import "server-only";
import { actorForIdentity, isSuperAdmin } from "./admin-policy";
import type { DeliveryWorkspace } from "./workspace-contract";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { database } from "../db";
import { hasClerkKeys } from "../mode";
import { DeliveryError, type Actor } from "./domain";
import { activateApprovedPartner } from "./partner-applications";
import { verifiedPrimaryEmail } from "./partner-application-input";
import { ensureAdminWorkspaces } from "./admin-workspaces";

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
  const selection = {
    partner: { include: { application: { select: { logoReady: true } } } },
  } as const;
  const load = () =>
    database().deliveryAccount.findMany({
      where: { clerkUserId: userId },
      include: selection,
      orderBy: [{ primary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  let accounts = await load();
  if (isSuperAdmin(userId) || grant?.active) {
    const admin = actorForIdentity({ userId, accounts, grant }, "ADMIN");
    if (await ensureAdminWorkspaces(admin, accounts)) accounts = await load();
  } else if (!accounts.length) {
    const user = await (await clerkClient()).users.getUser(userId);
    const email = verifiedPrimaryEmail(user);
    if (email && (await activateApprovedPartner(userId, email)))
      accounts = await load();
  }
  return actorForIdentity({ userId, accounts, grant }, workspace, strict);
}
