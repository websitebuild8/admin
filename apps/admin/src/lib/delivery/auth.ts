import "server-only";
import { cache } from "react";
import { actorForIdentity, isSuperAdmin } from "./admin-policy";
import type { DeliveryWorkspace } from "./workspace-contract";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { deliveryIdentity, identityAccounts } from "./identity-data";
import { hasClerkKeys } from "../mode";
import { DeliveryError, type Actor } from "./domain";
import { activateApprovedPartner } from "./partner-applications";
import { verifiedPrimaryEmail } from "./partner-application-input";
import { ensureAdminWorkspaces } from "./admin-workspaces";

export const deliveryActor = cache(async function deliveryActor(
  workspace?: DeliveryWorkspace,
  strict = true,
): Promise<Actor> {
  if (!hasClerkKeys())
    throw new DeliveryError("Clerk authentication is not configured.", 503);
  const { userId } = await auth();
  if (!userId) throw new DeliveryError("Please sign in.", 401);
  const identity = await deliveryIdentity(userId);
  const { grant } = identity;
  let { accounts } = identity;
  if (isSuperAdmin(userId) || grant?.active) {
    const admin = actorForIdentity({ userId, accounts, grant }, "ADMIN");
    if (await ensureAdminWorkspaces(admin, accounts))
      accounts = await identityAccounts(userId);
  } else if (!accounts.length) {
    const user = await (await clerkClient()).users.getUser(userId);
    const email = verifiedPrimaryEmail(user);
    if (email && (await activateApprovedPartner(userId, email)))
      accounts = await identityAccounts(userId);
  }
  return actorForIdentity({ userId, accounts, grant }, workspace, strict);
});
