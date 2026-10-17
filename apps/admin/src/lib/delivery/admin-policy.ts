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
export function requireSuperAdmin(
  actor: Actor,
  action = "manage administrator access",
) {
  if (
    actor.role !== "ADMIN" ||
    actor.status !== "APPROVED" ||
    !isSuperAdmin(actor.userId)
  )
    throw new DeliveryError(`Only the super admin can ${action}.`, 403);
}
export type OperationalIdentity = {
  id: string;
  role: "PARTNER" | "DRIVER";
  status: string;
  name: string;
  primary?: boolean;
  partner?: null | {
    id: string;
    businessName: string;
    application?: null | { logoReady: boolean };
  };
};
export type DeliveryIdentity = {
  userId: string;
  account?: OperationalIdentity | null;
  accounts?: OperationalIdentity[];
  grant: null | { active: boolean; name: string };
};
export function actorForIdentity(
  identity: DeliveryIdentity,
  requested?: DeliveryWorkspace,
  strict = true,
): Actor {
  const { userId, grant } = identity;
  const root = isSuperAdmin(userId),
    admin = root || !!grant?.active;
  const all = identity.accounts ?? (identity.account ? [identity.account] : []);
  const primary = all.find((account) => account.primary !== false) ?? all[0];
  const eligible = admin ? all : primary ? [primary] : [];
  const account =
    requested && requested !== "ADMIN"
      ? eligible.find((a) => a.role === requested)
      : primary;
  const workspaces: DeliveryWorkspace[] = [];
  if (admin) workspaces.push("ADMIN");
  for (const role of ["PARTNER", "DRIVER"] as const)
    if (
      eligible.some(
        (profile) => profile.role === role && profile.status === "APPROVED",
      )
    )
      workspaces.push(role);
  if (requested && requested !== "ADMIN" && !account && !all.length && !admin)
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
    requested && (requested === "ADMIN" ? admin : !!account);
  if (requested && !ownsRequested && strict)
    throw new DeliveryError(
      "This account does not have access to the requested workspace.",
      403,
    );
  const role = ownsRequested
    ? requested!
    : admin
      ? "ADMIN"
      : (primary?.role ?? "APPLICANT");
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
  const selected = account ?? primary;
  if (selected)
    return {
      userId,
      id: selected.id,
      partnerId: selected.partner?.id ?? null,
      role: selected.role,
      status: selected.status,
      name: selected.name,
      businessName: selected.partner?.businessName,
      logoAvailable: selected.partner?.application?.logoReady ?? false,
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
