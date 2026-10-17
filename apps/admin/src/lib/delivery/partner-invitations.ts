import "server-only";
import { assertAdministrator } from "./admin-authorization";
import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { database } from "../db";
import { audit } from "./commands";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { lockApplication } from "./partner-applications";

type Invite = { id: string; url?: string };
export type InvitationGateway = {
  find(email: string, applicationId: string): Promise<Invite | null>;
  create(
    email: string,
    applicationId: string,
    redirectUrl: string,
  ): Promise<Invite>;
};
const lifetime = 7 * 86400000;
function clerk() {
  if (!process.env.CLERK_SECRET_KEY)
    throw new DeliveryError(
      "Clerk invitations need server configuration.",
      503,
    );
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}
function gateway(): InvitationGateway {
  return {
    async find(email, applicationId) {
      const client = clerk();
      const users = await client.users.getUserList({
        emailAddress: [email],
        limit: 10,
      });
      const ids = users.data.map((user) => user.id);
      if (
        ids.length &&
        (await database().deliveryAccount.count({
          where: { clerkUserId: { in: ids } },
        }))
      )
        throw new DeliveryError(
          "This email already belongs to a partner or rider. Resolve that existing account before inviting another business.",
          409,
        );
      const invitations = await client.invitations.getInvitationList({
        query: email,
        status: "pending",
        limit: 50,
      });
      return (
        invitations.data.find(
          (invite) =>
            invite.emailAddress.toLowerCase() === email &&
            invite.publicMetadata?.partnerApplicationId === applicationId &&
            invite.createdAt > Date.now() - lifetime,
        ) ?? null
      );
    },
    async create(emailAddress, applicationId, redirectUrl) {
      return clerk().invitations.createInvitation({
        emailAddress,
        redirectUrl,
        expiresInDays: 7,
        notify: true,
        ignoreExisting: true,
        publicMetadata: { partnerApplicationId: applicationId },
      });
    },
  };
}

export async function sendPartnerInvitation(
  actor: Actor,
  applicationId: string,
  origin: string,
  provider: InvitationGateway = gateway(),
) {
  requireRole(actor, "ADMIN");
  const base = new URL(process.env.DELIVERY_PUBLIC_URL || origin);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  )
    throw new DeliveryError(
      "Configure DELIVERY_PUBLIC_URL with the HTTPS website address.",
      503,
    );
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new DeliveryError(
      "DELIVERY_PUBLIC_URL must contain only the website origin.",
      503,
    );
  const lease = randomUUID();
  const application = await database().$transaction(async (tx) => {
    await assertAdministrator(tx, actor);
    await lockApplication(tx, applicationId);
    const current = await tx.deliveryPartnerApplication.findUnique({
      where: { id: applicationId },
      include: { partner: true },
    });
    if (
      !current?.submittedAt ||
      (current.logoPath && !current.logoReady) ||
      current.status !== "APPROVED"
    )
      throw new DeliveryError(
        "Approve the complete business application before sending an invitation.",
        409,
      );
    if (current.partner)
      throw new DeliveryError(
        "This partner has already activated their account. They can use partner sign-in.",
        409,
      );
    if (
      current.invitationState === "SENT" &&
      current.invitationSentAt &&
      current.invitationSentAt.getTime() > Date.now() - lifetime
    )
      return { ...current, alreadySent: true };
    if (
      current.invitationState === "SENDING" &&
      current.invitationStartedAt &&
      current.invitationStartedAt.getTime() > Date.now() - 120000
    )
      throw new DeliveryError(
        "An invitation request is already in progress. Wait before retrying.",
        409,
      );
    await tx.deliveryPartnerApplication.update({
      where: { id: applicationId },
      data: {
        invitationState: "SENDING",
        invitationLease: lease,
        invitationStartedAt: new Date(),
      },
    });
    return { ...current, alreadySent: false };
  });
  if (application.alreadySent)
    return {
      message:
        "The setup email was already requested. Ask the owner to check their inbox and spam folder; the link is valid for seven days.",
    };
  try {
    // Reconcile a provider-accepted invitation after an interrupted request
    // before creating another one. No email is sent inside a DB transaction.
    const invitation =
      (await provider.find(application.email, application.id)) ??
      (await provider.create(
        application.email,
        application.id,
        `${base.origin}/partner/activate`,
      ));
    if (!invitation.id) throw new Error("Missing invitation reference");
    await database().$transaction(async (tx) => {
      await assertAdministrator(tx, actor);
      await lockApplication(tx, applicationId);
      const current = await tx.deliveryPartnerApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      if (current.invitationLease !== lease || current.status !== "APPROVED")
        throw new DeliveryError(
          "The review changed while the invitation was being prepared. Partner access remains blocked unless approved.",
          409,
        );
      await tx.deliveryPartnerApplication.update({
        where: { id: applicationId },
        data: {
          invitationState: "SENT",
          invitationId: invitation.id,
          invitationSentAt: new Date(),
          invitationLease: null,
        },
      });
      await audit(tx, actor, "PARTNER_INVITATION_REQUESTED", applicationId, {
        providerId: invitation.id,
      });
    });
    return {
      message:
        "Clerk accepted the setup invitation. The owner will use their email to sign in and set their own password.",
    };
  } catch (error) {
    await database().deliveryPartnerApplication.updateMany({
      where: { id: applicationId, invitationLease: lease },
      data: { invitationState: "FAILED", invitationLease: null },
    });
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError(
      "The setup invitation was not confirmed. The application is still saved. Check Clerk and retry; no password has been created or emailed.",
      503,
    );
  }
}
