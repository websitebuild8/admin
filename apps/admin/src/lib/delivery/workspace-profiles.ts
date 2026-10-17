import "server-only";
import { database } from "../db";
import { audit, serialized } from "./commands";
import { assertAdministrator } from "./admin-authorization";
import {
  DeliveryError,
  nextCutoff,
  operatingLocationLabels,
  requireRole,
  type Actor,
} from "./domain";
import type { WorkspaceProfileInput } from "./workspace-profile-input";
const administrativeActor = (actor: Actor): Actor => {
  requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
  // This selects the authorization being exercised, not a privilege grant.
  // assertAdministrator independently checks the current private DB grant/root.
  return { ...actor, role: "ADMIN", status: "APPROVED" };
};
export async function workspaceProfiles(actor: Actor) {
  const admin = administrativeActor(actor);
  return database().$transaction(
    async (tx) => {
      await assertAdministrator(tx, admin);
      return {
        profiles: await tx.deliveryAccount.findMany({
          where: { clerkUserId: actor.userId },
          orderBy: { role: "asc" },
          select: {
            id: true,
            role: true,
            name: true,
            phone: true,
            status: true,
            primary: true,
            partner: {
              select: {
                id: true,
                businessName: true,
                pickupAddress: true,
                operatingLocation: true,
                pageUrl: true,
              },
            },
          },
        }),
      };
    },
    { maxWait: 10000, timeout: 20000 },
  );
}
export async function updateWorkspaceProfile(
  actor: Actor,
  key: string,
  input: WorkspaceProfileInput,
) {
  const admin = administrativeActor(actor);
  return serialized(
    admin,
    key,
    { type: "updateWorkspaceProfile", ...input },
    async (tx) => {
      const profile = await tx.deliveryAccount.findUnique({
        where: {
          clerkUserId_role: { clerkUserId: actor.userId, role: input.role },
        },
        include: { partner: true },
      });
      if (!profile)
        throw new DeliveryError(
          "This workspace has not been initialized. Refresh and try again.",
          409,
        );
      await tx.deliveryAccount.update({
        where: { id: profile.id },
        data: { name: input.name, phone: input.phone },
      });
      if (input.role === "PARTNER") {
        if (!profile.partner)
          throw new DeliveryError(
            "Your business profile is missing. Contact the super admin.",
            409,
          );
        await tx.deliveryPartner.update({
          where: { id: profile.partner.id },
          data: {
            businessName: input.businessName,
            pickupAddress: input.pickupAddress,
            pageUrl: input.pageUrl,
            operatingLocation: input.operatingLocation,
            pickupArea: operatingLocationLabels[input.operatingLocation],
            nextInvoiceAt:
              profile.partner.nextInvoiceAt ??
              nextCutoff(new Date(), profile.partner.cutoffMinutes),
          },
        });
      }
      await audit(
        tx,
        admin,
        "OWN_WORKSPACE_DETAILS_UPDATED",
        profile.id,
        {
          role: input.role,
          ...(input.role === "PARTNER"
            ? {
                previousOperatingLocation: profile.partner!.operatingLocation,
                operatingLocation: input.operatingLocation,
              }
            : {}),
        },
        profile.partner?.id,
      );
      return {
        message:
          "Workspace details saved. Existing delivery rates on packages are unchanged.",
      };
    },
  );
}
