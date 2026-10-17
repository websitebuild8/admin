import "server-only";
import { auth } from "@clerk/nextjs/server";
import { hasClerkKeys, isDemoMode } from "./mode";
import { hasAdministratorAccess } from "./delivery/admin-authorization";

export async function requireAdmin() {
  if (isDemoMode()) throw new Error("Live data is disabled in demo mode.");
  if (!hasClerkKeys()) throw new Error("Clerk is not configured.");
  const { userId } = await auth();
  if (!userId || !(await hasAdministratorAccess(userId)))
    throw new Error("Administrator access required.");
  return userId;
}
