import { DeliveryError } from "./domain";
export const deliveryWorkspaces = ["ADMIN", "PARTNER", "DRIVER"] as const;
export type DeliveryWorkspace = (typeof deliveryWorkspaces)[number];
export const workspaceLabels: Record<DeliveryWorkspace, string> = {
  ADMIN: "Admin",
  PARTNER: "Partner",
  DRIVER: "Rider",
};
export const workspacePaths: Record<DeliveryWorkspace, string> = {
  ADMIN: "/delivery",
  PARTNER: "/partner",
  DRIVER: "/rider",
};
export function workspaceFromPath(path: string): DeliveryWorkspace | undefined {
  return deliveryWorkspaces.find(
    (role) =>
      path === workspacePaths[role] ||
      path.startsWith(`${workspacePaths[role]}/`),
  );
}
export function workspaceFromRequest(request: Request) {
  const explicit = request.headers.get("x-igo-workspace");
  if (explicit) {
    if (!(deliveryWorkspaces as readonly string[]).includes(explicit))
      throw new DeliveryError("Choose a valid workspace.", 400);
    return explicit as DeliveryWorkspace;
  }
  // Links, images and downloads cannot add a header. Same-origin referrers
  // select context only; the server independently verifies role ownership.
  try {
    const referrer = new URL(request.headers.get("referer") ?? "");
    if (referrer.origin === new URL(request.url).origin)
      return workspaceFromPath(referrer.pathname);
  } catch {
    /* A missing referrer uses the account's default workspace. */
  }
}
