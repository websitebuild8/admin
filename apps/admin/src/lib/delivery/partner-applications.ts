import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { audit, notify, notifyAdmins, serialized, type Tx } from "./commands";
import { DeliveryError, nextCutoff, requireRole, type Actor } from "./domain";
import type { PartnerApplicationInput } from "./partner-application-input";

export const applicationSelection = {
  id: true,
  publicId: true,
  ownerName: true,
  email: true,
  phone: true,
  businessName: true,
  businessType: true,
  pageUrl: true,
  pickupAddress: true,
  pickupArea: true,
  dailyDeliveries: true,
  status: true,
  reviewNote: true,
  createdAt: true,
  reviewedAt: true,
  invitationState: true,
  invitationSentAt: true,
  partner: { select: { id: true } },
} satisfies Prisma.DeliveryPartnerApplicationSelect;

export async function lockApplication(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"partner-application:" + id}, 0))`;
}

export async function reservePartnerApplication(
  key: string,
  input: PartnerApplicationInput,
  logo: Buffer,
) {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .update(logo)
    .digest("hex");
  try {
    return await database().$transaction(async (tx) => {
      await lockApplication(tx, key);
      const existing = await tx.deliveryPartnerApplication.findUnique({
        where: { requestKey: key },
      });
      if (existing) {
        if (existing.digest !== digest)
          throw new DeliveryError(
            "This request was used for different details. Refresh the form before submitting changes.",
            409,
          );
        return existing;
      }
      const id = randomUUID();
      return tx.deliveryPartnerApplication.create({
        data: {
          id,
          publicId: `IGO-APP-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
          requestKey: key,
          digest,
          email: input.email,
          ownerName: input.ownerName,
          phone: input.phone,
          businessName: input.businessName,
          businessType: input.businessType,
          pageUrl: input.pageUrl,
          pickupAddress: input.pickupAddress,
          pickupArea: input.pickupArea,
          dailyDeliveries: input.dailyDeliveries,
          logoPath: `${id}/logo.webp`,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new DeliveryError(
        "An application with these details already exists. Contact iGO to update it.",
        409,
      );
    throw error;
  }
}

export async function completePartnerApplication(id: string, digest: string) {
  return database().$transaction(async (tx) => {
    await lockApplication(tx, id);
    const application = await tx.deliveryPartnerApplication.findUniqueOrThrow({
      where: { id },
    });
    if (application.digest !== digest)
      throw new DeliveryError("Application upload did not match.", 409);
    if (!application.logoReady) {
      await tx.deliveryPartnerApplication.update({
        where: { id },
        data: { logoReady: true },
      });
      const actor: Actor = {
        userId: "public:partner-application",
        role: "APPLICANT",
        id: null,
        partnerId: null,
        status: "PENDING",
        name: "Applicant",
      };
      await audit(tx, actor, "PARTNER_APPLICATION_SUBMITTED", id, {
        reference: application.publicId,
      });
      await notifyAdmins(
        tx,
        "New partner application",
        `${application.businessName} submitted ${application.publicId}. Review it under Partner applications.`,
      );
    }
    return {
      reference: application.publicId,
      message: "Your business application is awaiting admin review.",
    };
  });
}

export async function reviewPartnerApplication(
  actor: Actor,
  key: string,
  id: string,
  status: "APPROVED" | "REJECTED",
  note: string,
) {
  requireRole(actor, "ADMIN");
  return serialized(
    actor,
    key,
    { type: "reviewPartnerApplication", id, status, note },
    async (tx) => {
      await lockApplication(tx, id);
      const application = await tx.deliveryPartnerApplication.findUnique({
        where: { id },
        include: { partner: true },
      });
      if (!application?.logoReady)
        throw new DeliveryError("A complete application was not found.", 404);
      if (application.partner)
        throw new DeliveryError(
          "This partner is already activated. Manage their access under Partner pages.",
          409,
        );
      if (application.status === status)
        throw new DeliveryError("This decision is already saved.", 409);
      await tx.deliveryPartnerApplication.update({
        where: { id },
        data: {
          status,
          reviewNote: note,
          reviewedBy: actor.userId,
          reviewedAt: new Date(),
        },
      });
      await audit(tx, actor, "PARTNER_APPLICATION_REVIEWED", id, {
        from: application.status,
        to: status,
        note,
      });
      return {
        message:
          status === "APPROVED"
            ? "Application approved. Send the setup invitation when you are ready."
            : "Application rejected. No partner access has been granted.",
      };
    },
  );
}

// The caller must obtain this email from Clerk's verified primary email, never
// from a request body, a query parameter, or editable user metadata.
export async function activateApprovedPartner(
  userId: string,
  verifiedEmail: string,
) {
  const db = database();
  const application = await db.deliveryPartnerApplication.findUnique({
    where: { email: verifiedEmail },
  });
  if (
    !application ||
    application.status !== "APPROVED" ||
    application.invitationState !== "SENT"
  )
    return null;
  return db.$transaction(async (tx) => {
    await lockApplication(tx, application.id);
    const current = await tx.deliveryPartnerApplication.findUnique({
      where: { id: application.id },
      include: { partner: { include: { account: true } } },
    });
    if (
      !current ||
      current.status !== "APPROVED" ||
      current.invitationState !== "SENT" ||
      !current.logoReady
    )
      return null;
    if (current.partner)
      return current.partner.account.clerkUserId === userId
        ? current.partner.account
        : null;
    const existing = await tx.deliveryAccount.findUnique({
      where: { clerkUserId: userId },
    });
    if (existing) return existing;
    const account = await tx.deliveryAccount.create({
      data: {
        clerkUserId: userId,
        role: "PARTNER",
        status: "APPROVED",
        name: current.ownerName,
        phone: current.phone,
        reviewedBy: current.reviewedBy,
        reviewedAt: current.reviewedAt,
        reviewNote: current.reviewNote,
        partner: {
          create: {
            applicationId: current.id,
            businessName: current.businessName,
            pageUrl: current.pageUrl,
            pickupAddress: current.pickupAddress,
            pickupArea: current.pickupArea,
            nextInvoiceAt: nextCutoff(new Date(), 1080),
          },
        },
      },
      include: { partner: true },
    });
    const actor: Actor = {
      userId,
      role: "PARTNER",
      id: account.id,
      partnerId: account.partner!.id,
      name: account.name,
      status: "APPROVED",
    };
    await audit(
      tx,
      actor,
      "PARTNER_ACCOUNT_ACTIVATED",
      current.id,
      {},
      account.partner!.id,
    );
    await notify(
      tx,
      userId,
      "Welcome to your partner workspace",
      "Your business account is ready. Register your first package or import your delivery list.",
    );
    return account;
  });
}
