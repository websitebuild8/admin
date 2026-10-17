import { DeliveryError, type Actor } from "./domain";
import type { DeliveryWorkspace } from "./workspace-contract";
export function superAdminIds(
  env: Record<string, string | undefined> = process.env,
) {
  return [
    ...new Set(
      [env.ADMIN_CLERK_USER_IDS, env.SUPER_ADMIN_CLERK_USER_IDS].flatMap(
        (value) =>
          (value ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
      ),
    ),
  ];
}
export function isSuperAdmin(userId: string) {
  return superAdminIds().includes(userId);
}
export function requireSuperAdmin(actor: Actor) {
  if (
    actor.role !== "ADMIN" ||
    actor.status !== "APPROVED" ||
    !isSuperAdmin(actor.userId)
  )
    throw new DeliveryError(
      "Only the super admin can manage administrator access.",
      403,
    );
}
export type DeliveryIdentity = {
  userId: string;
  account: null | {
    id: string;
    role: "PARTNER" | "DRIVER";
    status: string;
    name: string;
    partner?: null | {
      id: string;
      businessName: string;
      application?: null | { logoReady: boolean };
    };
  };
  grant: null | { active: boolean; name: string };
};
export function actorForIdentity(
  identity: DeliveryIdentity,
  requested?: DeliveryWorkspace,
  strict = true,
): Actor {
  const { userId, account, grant } = identity;
  const root = isSuperAdmin(userId),
    admin = root || !!grant?.active;
  const workspaces: DeliveryWorkspace[] = [];
  if (admin) workspaces.push("ADMIN");
  if (account?.status === "APPROVED") workspaces.push(account.role);
  if (requested && requested !== "ADMIN" && !account)
    return {
      userId,
      id: null,
      partnerId: null,
      role: "APPLICANT",
      status: "UNREGISTERED",
      name: "Welcome",
      workspaces,
      superAdmin: false,
    };
  const ownsRequested =
    requested && (requested === "ADMIN" ? admin : account?.role === requested);
  if (requested && !ownsRequested && strict)
    throw new DeliveryError(
      "This account does not have access to the requested workspace.",
      403,
    );
  const role = ownsRequested
    ? requested!
    : admin
      ? "ADMIN"
      : (account?.role ?? "APPLICANT");
  if (role === "ADMIN")
    return {
      userId,
      id: null,
      partnerId: null,
      role,
      status: "APPROVED",
      name: root ? "Super administrator" : grant!.name,
      superAdmin: root,
      workspaces,
    };
  if (account)
    return {
      userId,
      id: account.id,
      partnerId: account.partner?.id ?? null,
      role: account.role,
      status: account.status,
      name: account.name,
      businessName: account.partner?.businessName,
      logoAvailable: account.partner?.application?.logoReady ?? false,
      workspaces,
      superAdmin: false,
    };
  return {
    userId,
    id: null,
    partnerId: null,
    role: "APPLICANT",
    status: "UNREGISTERED",
    name: "Welcome",
    workspaces,
    superAdmin: false,
  };
}
