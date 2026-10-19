import "server-only";
import { pushSettings } from "./push-settings";
import type { NoticeTarget } from "./notification-contract";
import { notificationDestination } from "./notifications";
import { assertAdministrator } from "./admin-authorization";
import { superAdminIds } from "./admin-policy";
import { commandSubjects } from "./deletion-contract";
import {
  assertOperationalActor,
  assertRoleCreation,
} from "./role-authorization";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import {
  DeliveryError,
  operatingLocationLabels,
  nextCutoff,
  localDate,
  money,
  partnerScope,
  requireRole,
  reviewAmount,
  type Actor,
  type DeliveryCommandInput,
  type ParcelInput,
} from "./domain";

export type Tx = Prisma.TransactionClient;
const sequenceSchema = () =>
  process.env.NODE_ENV === "test" &&
  /^igo_qa_[a-f0-9]+$/.test(process.env.IGO_DELIVERY_TEST_SCHEMA ?? "")
    ? process.env.IGO_DELIVERY_TEST_SCHEMA!
    : "public";
export async function audit(
  tx: Tx,
  actor: Actor,
  kind: string,
  entityId: string,
  detail: Prisma.InputJsonObject,
  partnerId?: string,
) {
  await tx.deliveryActivity.create({
    data: {
      actor: actor.userId,
      role: actor.role,
      kind,
      entityId,
      detail,
      partnerId,
    },
  });
}
export async function notify(
  tx: Tx,
  recipient: string,
  title: string,
  message: string,
  workspace: "ACCOUNT" | "ADMIN" | "PARTNER" | "DRIVER" = "ACCOUNT",
  target?: NoticeTarget,
) {
  return tx.deliveryNotification.create({
    data: { recipient, title, message, workspace, ...target },
  });
}
export async function notifyAdmins(tx: Tx, title: string, message: string, target?: NoticeTarget) {
  const grants = await tx.deliveryAdminGrant.findMany({
    where: { active: true }, select: { clerkUserId: true },
  });
  for (const recipient of new Set([...superAdminIds(), ...grants.map((g) => g.clerkUserId)]))
    await notify(tx, recipient, title, message, "ADMIN", target);
}

export async function serialized<T extends Prisma.InputJsonValue>(
  actor: Actor,
  key: string,
  payload: unknown,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const id = `${actor.userId}:${actor.role}:${key}`,
    hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await database().$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
          if (actor.role === "ADMIN") await assertAdministrator(tx, actor);
          if (actor.role === "PARTNER" || actor.role === "DRIVER")
            await assertOperationalActor(tx, actor);
          const old = await tx.deliveryCommand.findUnique({ where: { id } });
          if (old) {
            if (old.invalidated)
              throw new DeliveryError(
                "This saved request refers to deleted data. Refresh the page and start a new request.",
                409,
              );
            if (old.hash !== hash)
              throw new DeliveryError(
                "This request key was used for a different action.",
                409,
              );
            return old.response as T;
          }
          const response = await work(tx);
          await tx.deliveryCommand.create({
            data: {
              id,
              hash,
              response,
              subjects: commandSubjects(
                actor.userId,
                actor.id,
                actor.partnerId,
                payload,
                response,
              ),
            },
          });
          return response;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 20000,
        },
      );
    } catch (error) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "";
      if (["P2034", "P2002"].includes(code) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
        continue;
      }
      if (code === "P2002")
        throw new DeliveryError(
          "A package reference, bank reference, receipt or request already exists. Review the existing record.",
          409,
        );
      throw error;
    }
  }
  throw new DeliveryError(
    "This action is busy. Retry using the same request.",
    409,
  );
}
export async function createParcels(
  tx: Tx,
  actor: Actor,
  partnerId: string,
  parcels: ParcelInput[],
  importId?: string,
) {
  const partner = await tx.deliveryPartner.findUnique({
    where: { id: partnerId },
    include: { account: true },
  });
  if (!partner || partner.account.status !== "APPROVED")
    throw new DeliveryError("Choose an approved partner.", 409);
  if (!partner.operatingLocation)
    throw new DeliveryError(
      "Ask iGO to set your business operating location before registering packages.",
      409,
    );
  if (
    partner.pickupAddress.trim().length < 5 ||
    !/^(?:\+960)?[379]\d{6}$/.test(partner.account.phone)
  )
    throw new DeliveryError(
      "Complete your business pickup address and contact number in Workspace details before registering deliveries.",
      409,
    );
  const rates = await tx.deliveryRate.findMany({
    where: { origin: partner.operatingLocation },
    include: { destination: true },
  });
  const values = [];
  const counters = await tx.$queryRaw<
    { n: bigint }[]
  >`SELECT nextval(${`${sequenceSchema()}.igo_delivery_parcel_number`}::regclass) AS n FROM generate_series(1, ${parcels.length})`;
  for (const [index, parcel] of parcels.entries()) {
    const rate = rates.find(
      (r) => r.zone === parcel.zone && r.destination.active,
    );
    if (!rate)
      throw new DeliveryError(
        "This route has no active delivery rate. Ask iGO to configure it before registering.",
        409,
      );
    const fee = rate.fee;
    const counter = counters[index];
    values.push({
      ...parcel,
      id: randomUUID(),
      publicId: `IGO-${localDate(new Date()).replaceAll("-", "")}-${String(counter.n).padStart(6, "0")}`,
      partnerId,
      origin: partner.operatingLocation,
      destinationLabel: rate.destination.label,
      fee,
      importId,
    });
  }
  await tx.deliveryParcel.createMany({ data: values });
  await audit(
    tx,
    actor,
    importId ? "PACKAGES_IMPORTED" : "PACKAGE_REGISTERED",
    importId ?? values[0].id,
    { count: values.length, publicIds: values.map((v) => v.publicId) },
    partnerId,
  );
  return { count: values.length, publicIds: values.map((v) => v.publicId) };
}

export async function deliveryCommand(
  actor: Actor,
  key: string,
  command: DeliveryCommandInput,
) {
  // Hold this boundary across serialization retries. Newer messages survive.
  const clearThrough = new Date();
  return serialized(actor, key, command, async (tx) => {
    switch (command.type) {
      case "createPartnerInvoice": {
        requireRole(actor, "ADMIN");
        const schema = sequenceSchema();
        const lock =
          schema === "public"
            ? 819201016
            : 100000000 + parseInt(schema.slice(-6), 16);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock}::bigint)`;
        const partner = await tx.deliveryPartner.findUnique({
          where: { id: command.partnerId },
          select: { id: true },
        });
        if (!partner) throw new DeliveryError("Partner not found.", 404);
        const [time] = await tx.$queryRaw<
          { cutoff: Date }[]
        >`SELECT clock_timestamp() AS cutoff`;
        const parcels = await tx.$queryRaw<{ id: string; fee: number }[]>(
          Prisma.sql`SELECT p.id,p.fee FROM ${Prisma.raw(`"${schema}"."DeliveryParcel"`)} p WHERE p."partnerId"=${command.partnerId}::uuid AND p.state='DELIVERED' AND p."deliveredAt"<=${time.cutoff} AND NOT EXISTS (SELECT 1 FROM ${Prisma.raw(`"${schema}"."DeliveryInvoiceLine"`)} l WHERE l."parcelId"=p.id) ORDER BY p.id FOR UPDATE OF p`,
        );
        const total = parcels.reduce((sum, p) => sum + p.fee, 0);
        if (!parcels.length)
          throw new DeliveryError(
            "No completed, uninvoiced deliveries are available.",
            409,
          );
        if (
          parcels.length !== command.expectedCount ||
          total !== command.expectedTotal
        )
          throw new DeliveryError(
            "Completed deliveries changed. Refresh the history and review the updated invoice total.",
            409,
          );
        if (!Number.isSafeInteger(total) || total > 2147483647)
          throw new DeliveryError(
            "The invoice amount exceeds the supported limit. Contact iGO support.",
          );
        const [number] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval(${`${schema}.igo_delivery_invoice_number`}::regclass) AS n`;
        const invoice = await tx.deliveryInvoice.create({
          data: {
            partnerId: command.partnerId,
            manualCutoffAt: time.cutoff,
            total,
            publicId: `INV-${localDate(time.cutoff).replaceAll("-", "")}-${String(number.n).padStart(12, "0")}`,
          },
        });
        await tx.deliveryInvoiceLine.createMany({
          data: parcels.map((p) => ({
            invoiceId: invoice.id,
            parcelId: p.id,
            amount: p.fee,
          })),
        });
        await audit(
          tx,
          actor,
          "MANUAL_INVOICE_ISSUED",
          invoice.id,
          {
            total,
            packageCount: parcels.length,
            cutoff: time.cutoff.toISOString(),
          },
          command.partnerId,
        );
        return {
          message: `Invoice ${invoice.publicId} created for ${money(total)}. Use Send invoice to notify the partner.`,
          invoiceId: invoice.id,
        };
      }
      case "sendInvoice": {
        requireRole(actor, "ADMIN");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice-send:${command.invoiceId}`},0))`;
        const invoice = await tx.deliveryInvoice.findUnique({
          where: { id: command.invoiceId },
          include: {
            dispatch: true,
            partner: { select: { account: { select: { clerkUserId: true } } } },
          },
        });
        if (!invoice) throw new DeliveryError("Invoice not found.", 404);
        if (invoice.dispatch)
          return {
            message:
              "This invoice has already been sent to the partner dashboard.",
            invoiceId: invoice.id,
          };
        const notice = await notify(
          tx,
          invoice.partner.account.clerkUserId,
          "Delivery invoice received",
          `Invoice ${invoice.publicId}: ${money(invoice.total)} for completed deliveries. View the package details and outstanding amount in Invoices. Earlier unpaid invoices remain due.`,
          "PARTNER",
          { targetType: "INVOICE", targetId: invoice.id },
        );
        await tx.deliveryInvoiceDispatch.create({
          data: {
            invoiceId: invoice.id,
            notificationId: notice.id,
            sentBy: actor.userId,
          },
        });
        await audit(
          tx,
          actor,
          "INVOICE_SENT_TO_DASHBOARD",
          invoice.id,
          { total: invoice.total, channel: "DASHBOARD" },
          invoice.partnerId,
        );
        return {
          message: "Invoice sent to the partner dashboard with a notification.",
          invoiceId: invoice.id,
        };
      }
      case "sendPaidInvoice": {
        requireRole(actor, "ADMIN");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`paid-invoice-send:${command.invoiceId}`},0))`;
        const invoice = await tx.deliveryInvoice.findUnique({
          where: { id: command.invoiceId },
          include: {
            paidInvoice: { include: { dispatch: true } },
            partner: { select: { account: { select: { clerkUserId: true } } } },
          },
        });
        if (!invoice) throw new DeliveryError("Invoice not found.", 404);
        if (invoice.paid !== invoice.total || !invoice.paidInvoice)
          throw new DeliveryError(
            "Verify the full invoice payment before sending a paid invoice.",
            409,
          );
        if (invoice.paidInvoice.dispatch)
          return {
            message:
              "The paid invoice has already been sent to the partner dashboard.",
            invoiceId: invoice.id,
          };
        const notice = await notify(
          tx,
          invoice.partner.account.clerkUserId,
          "Paid invoice received",
          `Invoice ${invoice.publicId} is fully paid: ${money(invoice.total)} verified, ${money(0)} outstanding. Your paid invoice and payment history are available in Invoices.`,
          "PARTNER",
          { targetType: "INVOICE", targetId: invoice.id },
        );
        await tx.deliveryPaidInvoiceDispatch.create({
          data: {
            invoiceId: invoice.id,
            notificationId: notice.id,
            sentBy: actor.userId,
          },
        });
        await audit(
          tx,
          actor,
          "PAID_INVOICE_SENT_TO_DASHBOARD",
          invoice.id,
          { total: invoice.total, channel: "DASHBOARD" },
          invoice.partnerId,
        );
        return {
          message:
            "Paid invoice sent to the partner dashboard with a notification.",
          invoiceId: invoice.id,
        };
      }
      case "apply": {
        if (actor.role !== "APPLICANT")
          throw new DeliveryError("An application already exists.", 409);
        const a = command.application;
        if (a.role === "PARTNER")
          throw new DeliveryError(
            "Submit your business application at /join. Partner access is granted after review.",
            403,
          );
        const primary = await assertRoleCreation(tx, actor.userId, a.role);
        const account = await tx.deliveryAccount.create({
          data: {
            clerkUserId: actor.userId,
            role: a.role,
            primary,
            name: a.name,
            phone: a.phone,
          },
        });
        await audit(tx, actor, "APPLICATION_SUBMITTED", account.id, {
          role: a.role,
        });
        await notifyAdmins(
          tx,
          "New account application",
          `${a.name} applied for ${a.role.toLowerCase()} access. Approval is required.`,
          { targetType: "ACCOUNT", targetId: account.id },
        );
        return {
          message: "Application submitted. Your account needs admin approval.",
        };
      }
      case "reviewAccount": {
        requireRole(actor, "ADMIN");
        const account = await tx.deliveryAccount.findUnique({
          where: { id: command.accountId },
          include: { partner: true },
        });
        if (!account) throw new DeliveryError("Application not found.", 404);
        if (account.status === command.status)
          throw new DeliveryError("This account already has that status.", 409);
        await tx.deliveryAccount.update({
          where: { id: account.id },
          data: {
            status: command.status,
            reviewedAt: new Date(),
            reviewedBy: actor.userId,
            reviewNote: command.note,
          },
        });
        if (
          account.partner &&
          command.status === "APPROVED" &&
          !account.partner.nextInvoiceAt
        )
          await tx.deliveryPartner.update({
            where: { id: account.partner.id },
            data: {
              nextInvoiceAt: nextCutoff(
                new Date(),
                account.partner.cutoffMinutes,
              ),
            },
          });
        await audit(
          tx,
          actor,
          "ACCOUNT_REVIEWED",
          account.id,
          { from: account.status, to: command.status, note: command.note },
          account.partner?.id,
        );
        await notify(
          tx,
          account.clerkUserId,
          "Application update",
          `Your ${account.role.toLowerCase()} account is ${command.status.toLowerCase()}. ${command.note}`,
          account.role,
          { targetType: "SETTINGS" },
        );
        return { message: "Account review saved." };
      }
      case "register":
        return createParcels(
          tx,
          actor,
          partnerScope(actor, command.partnerId),
          [command.parcel],
        );
      case "assign": {
        requireRole(actor, "ADMIN");
        const driver = await tx.deliveryAccount.findFirst({
          where: { id: command.driverId, role: "DRIVER", status: "APPROVED" },
        });
        if (!driver) throw new DeliveryError("Choose an approved driver.");
        const changed = await tx.deliveryParcel.updateMany({
          where: { id: { in: command.parcelIds }, state: "REGISTERED" },
          data: { driverId: driver.id },
        });
        if (changed.count !== command.parcelIds.length)
          throw new DeliveryError(
            "Only registered packages can be assigned. Refresh the list.",
            409,
          );
        await audit(tx, actor, "DRIVER_ASSIGNED", driver.id, {
          parcelIds: command.parcelIds,
        });
        await notify(
          tx,
          driver.clerkUserId,
          "Collection assigned",
          `${changed.count} packages are ready for your collection list. Confirm pickup only after physical receipt.`,
          "DRIVER",
          { targetType: "COLLECTION" },
        );
        return {
          message: `${changed.count} packages assigned. No pickup has been recorded.`,
        };
      }
      case "claim": {
        requireRole(actor, "DRIVER");
        const parcel = await tx.deliveryParcel.findFirst({
          where: {
            id: command.parcelId,
            state: "REGISTERED",
            driverId: null,
            partner: { account: { status: "APPROVED" } },
          },
          include: {
            partner: { select: { account: { select: { clerkUserId: true } } } },
          },
        });
        if (!parcel)
          throw new DeliveryError(
            "This delivery has already been taken or is no longer available. Refresh available jobs.",
            409,
          );
        const changed = await tx.deliveryParcel.updateMany({
          where: { id: parcel.id, state: "REGISTERED", driverId: null },
          data: { driverId: actor.id! },
        });
        if (changed.count !== 1)
          throw new DeliveryError(
            "Another rider has taken this delivery. Refresh available jobs.",
            409,
          );
        await audit(
          tx,
          actor,
          "RIDER_SELF_ASSIGNED",
          parcel.id,
          { publicId: parcel.publicId, driverId: actor.id! },
          parcel.partnerId,
        );
        await notify(
          tx,
          parcel.partner.account.clerkUserId,
          "Rider assigned",
          `${actor.name} will collect ${parcel.publicId}. Pickup has not yet been confirmed.`,
          "PARTNER",
          { targetType: "PACKAGE", targetId: parcel.id },
        );
        await notify(
          tx,
          actor.userId,
          "Delivery added to your collections",
          `${parcel.publicId} is assigned to you. Confirm pickup only after physically receiving it.`,
          "DRIVER",
          { targetType: "PACKAGE", targetId: parcel.id },
        );
        return {
          message:
            "Delivery added to your collection list. Confirm pickup after physical receipt.",
        };
      }
      case "pickup": {
        requireRole(actor, "DRIVER");
        const parcels = await tx.deliveryParcel.findMany({
          where: {
            id: { in: command.parcelIds },
            driverId: actor.id,
            state: "REGISTERED",
          },
          include: { partner: { include: { account: true } } },
        });
        if (parcels.length !== command.parcelIds.length)
          throw new DeliveryError(
            "Packages must be registered and assigned to you. Refresh the list.",
            409,
          );
        const changed = await tx.deliveryParcel.updateMany({
          where: {
            id: { in: command.parcelIds },
            driverId: actor.id,
            state: "REGISTERED",
          },
          data: {
            state: "PICKED_UP",
            pickedUpAt: new Date(),
            pickedUpBy: actor.userId,
          },
        });
        if (changed.count !== parcels.length)
          throw new DeliveryError(
            "Pickup changed during confirmation. Retry.",
            409,
          );
        for (const p of parcels) {
          await audit(
            tx,
            actor,
            "PICKUP_CONFIRMED",
            p.id,
            { publicId: p.publicId },
            p.partnerId,
          );
          await notify(
            tx,
            p.partner.account.clerkUserId,
            "Package picked up",
            `${p.publicId} was physically received by ${actor.name}.`,
            "PARTNER",
            { targetType: "PACKAGE", targetId: p.id },
          );
        }
        return { message: `${parcels.length} physical pickups confirmed.` };
      }
      case "deliver": {
        requireRole(actor, "DRIVER");
        const p = await tx.deliveryParcel.findFirst({
          where: {
            id: command.parcelId,
            driverId: actor.id,
            state: "PICKED_UP",
          },
          include: { partner: { include: { account: true } } },
        });
        if (!p)
          throw new DeliveryError(
            "This package is not picked up and assigned to you.",
            409,
          );
        const now = new Date();
        await tx.deliveryParcel.update({
          where: { id: p.id },
          data: {
            state: "DELIVERED",
            deliveredAt: now,
            deliveredBy: actor.userId,
          },
        });
        await audit(
          tx,
          actor,
          "DELIVERY_COMPLETED",
          p.id,
          { publicId: p.publicId },
          p.partnerId,
        );
        await notify(
          tx,
          p.partner.account.clerkUserId,
          "Package delivered",
          `${p.publicId} delivered by ${actor.name}. Delivery fees enter the next eligible invoice cycle.`,
          "PARTNER",
          { targetType: "PACKAGE", targetId: p.id },
        );
        return {
          message:
            "Delivery recorded with your identity and the server timestamp.",
        };
      }
      case "cancel": {
        requireRole(actor, "ADMIN", "PARTNER");
        const changed = await tx.deliveryParcel.updateMany({
          where: {
            id: command.parcelId,
            state: "REGISTERED",
            ...(actor.role === "PARTNER"
              ? { partnerId: actor.partnerId! }
              : {}),
          },
          data: { state: "CANCELLED" },
        });
        if (changed.count !== 1)
          throw new DeliveryError(
            "Only your unpicked packages can be cancelled.",
            409,
          );
        await audit(
          tx,
          actor,
          "PACKAGE_CANCELLED",
          command.parcelId,
          { reason: command.reason },
          actor.partnerId ?? undefined,
        );
        return { message: "Unpicked package cancelled." };
      }
      case "submitPayment": {
        requireRole(actor, "PARTNER");
        const invoice = await tx.deliveryInvoice.findFirst({
          where: { id: command.invoiceId, partnerId: actor.partnerId! },
        });
        const receipt = await tx.deliveryReceipt.findFirst({
          where: {
            id: command.receiptId,
            partnerId: actor.partnerId!,
            ready: true,
            payment: null,
          },
        });
        if (!invoice || !receipt)
          throw new DeliveryError(
            "Choose your invoice and an unused uploaded receipt.",
            404,
          );
        if (
          command.amount <= 0 ||
          command.amount > invoice.total - invoice.paid
        )
          throw new DeliveryError(
            "Submission must be positive and no greater than the outstanding invoice balance.",
          );
        const payment = await tx.deliveryPayment.create({
          data: {
            partnerId: actor.partnerId!,
            invoiceId: invoice.id,
            receiptId: receipt.id,
            bankReference: command.bankReference,
            amount: command.amount,
          },
        });
        await audit(
          tx,
          actor,
          "PAYMENT_SUBMITTED",
          payment.id,
          { invoiceId: invoice.id, amount: command.amount },
          actor.partnerId!,
        );
        await notifyAdmins(
          tx,
          "Bank transfer awaiting review",
          `Evidence for ${invoice.publicId} is ready for bank verification. The invoice balance has not changed.`,
          { targetType: "PAYMENT", targetId: payment.id },
        );
        return {
          message:
            "Receipt submitted for admin verification. The invoice balance has not changed.",
          invoiceId: invoice.id,
        };
      }
      case "reviewPayment": {
        requireRole(actor, "ADMIN");
        const payment = await tx.deliveryPayment.findUnique({
          where: { id: command.paymentId },
          include: { invoice: true, partner: { include: { account: true } } },
        });
        if (!payment || payment.status !== "PENDING")
          throw new DeliveryError("This payment is no longer pending.", 409);
        if (command.decision === "REJECT") {
          if (command.confirmedAmount !== 0)
            throw new DeliveryError(
              "Rejected payments must have zero confirmed amount.",
            );
          await tx.deliveryPayment.update({
            where: { id: payment.id },
            data: {
              status: "REJECTED",
              reviewedBy: actor.userId,
              reviewedAt: new Date(),
              reviewNote: command.note,
            },
          });
        } else {
          const status = reviewAmount(
            payment.amount,
            command.confirmedAmount,
            payment.invoice.total - payment.invoice.paid,
          );
          await tx.deliveryPayment.update({
            where: { id: payment.id },
            data: {
              status,
              confirmedAmount: command.confirmedAmount,
              reviewedBy: actor.userId,
              reviewedAt: new Date(),
              reviewNote: command.note,
            },
          });
          await tx.deliveryPaymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: payment.invoiceId,
              amount: command.confirmedAmount,
            },
          });
          await tx.deliveryInvoice.update({
            where: { id: payment.invoiceId },
            data: { paid: { increment: command.confirmedAmount } },
          });
        }
        await audit(
          tx,
          actor,
          "BANK_TRANSFER_REVIEWED",
          payment.id,
          {
            decision: command.decision,
            confirmedAmount: command.confirmedAmount,
            note: command.note,
          },
          payment.partnerId,
        );
        await notify(
          tx,
          payment.partner.account.clerkUserId,
          "Bank transfer reviewed",
          `Your transfer for ${payment.invoice.publicId} was ${command.decision === "REJECT" ? "rejected" : "verified"}. ${command.note}`,
          "PARTNER",
          { targetType: "PAYMENT", targetId: payment.id },
        );
        return {
          message:
            command.decision === "REJECT"
              ? "Payment rejected. Invoice balance unchanged."
              : "Only the verified amount was credited. If fully paid, the paid invoice is ready to send.",
          invoiceId: payment.invoiceId,
        };
      }
      case "cutoff": {
        requireRole(actor, "ADMIN");
        await tx.deliveryPartner.update({
          where: { id: command.partnerId },
          data: {
            cutoffMinutes: command.minutes,
            nextInvoiceAt: nextCutoff(new Date(), command.minutes),
          },
        });
        await audit(
          tx,
          actor,
          "INVOICE_CUTOFF_CHANGED",
          command.partnerId,
          { minutes: command.minutes, timezone: "Indian/Maldives" },
          command.partnerId,
        );
        return {
          message:
            "Daily cutoff updated. Uninvoiced deliveries carry forward; existing invoices stay unchanged.",
        };
      }
      case "rate": {
        requireRole(actor, "ADMIN");
        if (
          !(await tx.deliveryDestination.findUnique({
            where: { code: command.zone },
          }))
        )
          throw new DeliveryError(
            "Add this destination before configuring its route price.",
            404,
          );
        const old = await tx.deliveryRate.findUnique({
          where: {
            origin_zone: { origin: command.origin, zone: command.zone },
          },
        });
        await tx.deliveryRate.upsert({
          where: {
            origin_zone: { origin: command.origin, zone: command.zone },
          },
          create: {
            origin: command.origin,
            zone: command.zone,
            fee: command.fee,
          },
          update: { fee: command.fee },
        });
        await audit(tx, actor, "DELIVERY_RATE_CHANGED", command.zone, {
          origin: command.origin,
          previous: old?.fee ?? null,
          fee: command.fee,
        });
        return {
          message:
            "Rate saved for new packages. Registered package fees are unchanged.",
        };
      }
      case "operatingLocation": {
        requireRole(actor, "ADMIN");
        const old = await tx.deliveryPartner.findUnique({
          where: { id: command.partnerId },
        });
        if (!old) throw new DeliveryError("Partner not found.", 404);
        await tx.deliveryPartner.update({
          where: { id: old.id },
          data: {
            operatingLocation: command.location,
            pickupArea: operatingLocationLabels[command.location],
          },
        });
        await audit(
          tx,
          actor,
          "PARTNER_OPERATING_LOCATION_CHANGED",
          old.id,
          {
            previous: old.operatingLocation,
            location: command.location,
            reason: command.reason,
          },
          old.id,
        );
        await notify(
          tx,
          (
            await tx.deliveryAccount.findUniqueOrThrow({
              where: { id: old.accountId },
            })
          ).clerkUserId,
          "Operating location updated",
          `Your business now operates from ${operatingLocationLabels[command.location]}. This affects new packages only.`,
          "PARTNER",
          { targetType: "SETTINGS" },
        );
        return {
          message:
            "Operating location updated. Existing package routes and fees are unchanged.",
        };
      }
      case "destination": {
        requireRole(actor, "ADMIN");
        const old = await tx.deliveryDestination.findUnique({
          where: { code: command.code },
        });
        await tx.deliveryDestination.upsert({
          where: { code: command.code },
          create: {
            code: command.code,
            label: command.label,
            active: command.active,
          },
          update: { label: command.label, active: command.active },
        });
        await audit(tx, actor, "DELIVERY_DESTINATION_CHANGED", command.code, {
          previous: old ? { label: old.label, active: old.active } : null,
          label: command.label,
          active: command.active,
        });
        return {
          message:
            "Destination saved. Configure a rate for each operating location before using it.",
        };
      }
      case "clearNotices": {
        requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
        const removed = await tx.deliveryNotification.deleteMany({
          where: {
            recipient: actor.userId,
            workspace: { in: ["ACCOUNT", actor.role] },
            createdAt: { lte: clearThrough },
          },
        });
        if (removed.count)
          await audit(
            tx,
            actor,
            "NOTIFICATIONS_CLEARED",
            actor.userId,
            {
              workspace: actor.role,
              count: removed.count,
              through: clearThrough.toISOString(),
            },
            actor.partnerId ?? undefined,
          );
        return {
          message: removed.count
            ? "All notifications marked read and cleared."
            : "Your notifications are already clear.",
          count: removed.count,
        };
      }
      case "sendPartnerMessage": {
        requireRole(actor, "ADMIN");
        const partner = await tx.deliveryPartner.findUnique({ where: { id: command.partnerId }, include: { account: true } });
        if (!partner || partner.account.status !== "APPROVED")
          throw new DeliveryError("Choose an approved partner.", 409);
        let title = command.title, message = command.message;
        let target: NoticeTarget | undefined;
        if (command.invoiceId) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"invoice-reminder:" + command.invoiceId},0))`;
          const invoice = await tx.deliveryInvoice.findFirst({ where: { id: command.invoiceId, partnerId: partner.id } });
          if (!invoice || invoice.paid >= invoice.total)
            throw new DeliveryError("This invoice has no outstanding balance. Refresh finance before sending a reminder.", 409);
          title = `Payment reminder · ${invoice.publicId}`;
          message = `${invoice.publicId} has ${money(invoice.total - invoice.paid)} outstanding. Pending bank transfers are credited after verification.${message ? "\n\n" + message : ""}`;
          target = { targetType: "INVOICE", targetId: invoice.id };
        }
        const notice = await notify(tx, partner.account.clerkUserId, title, message, "PARTNER", target);
        await audit(tx, actor, "PARTNER_MESSAGE_SENT", notice.id,
          { title, message, invoiceId: command.invoiceId ?? null, businessName: partner.businessName }, partner.id);
        return { message: "Message sent to the partner inbox.", notificationId: notice.id };
      }
      case "testPush": {
        requireRole(actor, "PARTNER", "DRIVER");
        if (!pushSettings()) throw new DeliveryError("Browser alerts need server configuration.", 503);
        const subscriptions = await tx.deliveryPushSubscription.count({ where: { driverId: actor.id! } });
        if (!subscriptions) throw new DeliveryError("Enable browser alerts on this device first.", 409);
        await notify(tx, actor.userId, "Browser alerts test", "Browser alerts are connected to your iGO workspace.", actor.role as "PARTNER" | "DRIVER");
        return { message: "Test alert queued. Check this device’s notifications." };
      }
      case "openNotice": {
        requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
        const notice = await tx.deliveryNotification.findFirst({ where: {
          id: command.id, recipient: actor.userId, workspace: { in: ["ACCOUNT", actor.role] },
        } });
        if (!notice) throw new DeliveryError("This notification has been cleared or is unavailable.", 404);
        const href = await notificationDestination(tx, actor, notice);
        await tx.deliveryNotification.update({ where: { id: notice.id }, data: { readAt: notice.readAt ?? new Date() } });
        return { message: "Notification opened.", href };
      }
      case "readNotice": {
        const changed = await tx.deliveryNotification.updateMany({
          where: {
            id: command.id,
            recipient: actor.userId,
            workspace: { in: ["ACCOUNT", actor.role] },
          },
          data: { readAt: new Date() },
        });
        if (!changed.count)
          throw new DeliveryError("Notification not found.", 404);
        return { message: "Notification marked read." };
      }
      case "settings": {
        requireRole(actor, "ADMIN");
        const { type: _, ...values } = command;
        void _;
        await tx.deliverySettings.upsert({
          where: { id: "default" },
          create: values,
          update: values,
        });
        await audit(tx, actor, "SETTINGS_CHANGED", "default", {
          fields: Object.keys(values),
        });
        return { message: "Business and bank details saved." };
      }
    }
  });
}
