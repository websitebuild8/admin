import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import {
  DeliveryError,
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
) {
  const notification = await tx.deliveryNotification.create({
    data: { recipient, title, message },
  });
  const subscriptions = await tx.deliveryPushSubscription.findMany({
    where: {
      driver: { clerkUserId: recipient, role: "DRIVER", status: "APPROVED" },
    },
    select: { id: true },
  });
  if (subscriptions.length)
    await tx.deliveryPushMessage.createMany({
      data: subscriptions.map((subscription) => ({
        notificationId: notification.id,
        subscriptionId: subscription.id,
      })),
      skipDuplicates: true,
    });
  return notification;
}
export async function notifyAdmins(tx: Tx, title: string, message: string) {
  for (const recipient of (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean))
    await notify(tx, recipient, title, message);
}
export async function serialized<T extends Prisma.InputJsonValue>(
  actor: Actor,
  key: string,
  payload: unknown,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const id = `${actor.userId}:${key}`,
    hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await database().$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
          const old = await tx.deliveryCommand.findUnique({ where: { id } });
          if (old) {
            if (old.hash !== hash)
              throw new DeliveryError(
                "This request key was used for a different action.",
                409,
              );
            return old.response as T;
          }
          if (actor.role !== "ADMIN" && actor.role !== "APPLICANT") {
            const current = await tx.deliveryAccount.findUnique({
              where: { clerkUserId: actor.userId },
              include: { partner: { select: { id: true } } },
            });
            if (
              !current ||
              current.id !== actor.id ||
              current.role !== actor.role ||
              current.status !== "APPROVED" ||
              (current.partner?.id ?? null) !== actor.partnerId
            )
              throw new DeliveryError(
                "Your approved access has changed. Sign in again.",
                403,
              );
          }
          const response = await work(tx);
          await tx.deliveryCommand.create({ data: { id, hash, response } });
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
  const rates = await tx.deliveryRate.findMany();
  const values = [];
  const counters = await tx.$queryRaw<
    { n: bigint }[]
  >`SELECT nextval(${`${sequenceSchema()}.igo_delivery_parcel_number`}::regclass) AS n FROM generate_series(1, ${parcels.length})`;
  for (const [index, parcel] of parcels.entries()) {
    const fee = rates.find((r) => r.zone === parcel.zone)?.fee;
    if (!fee)
      throw new DeliveryError("Delivery rates have not been configured.", 503);
    const counter = counters[index];
    values.push({
      ...parcel,
      id: randomUUID(),
      publicId: `IGO-${localDate(new Date()).replaceAll("-", "")}-${String(counter.n).padStart(6, "0")}`,
      partnerId,
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
      case "apply": {
        if (actor.role !== "APPLICANT")
          throw new DeliveryError("An application already exists.", 409);
        const a = command.application;
        if (a.role === "PARTNER")
          throw new DeliveryError(
            "Submit your business application at /join. Partner access is granted after review.",
            403,
          );
        const account = await tx.deliveryAccount.create({
          data: {
            clerkUserId: actor.userId,
            role: a.role,
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
        );
        return {
          message: `${changed.count} packages assigned. No pickup has been recorded.`,
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
        if (p.codAmount > 0 && !command.codReceived)
          throw new DeliveryError(
            "Confirm receipt of the full cash-on-delivery amount before completing delivery.",
          );
        const now = new Date();
        await tx.deliveryParcel.update({
          where: { id: p.id },
          data: {
            state: "DELIVERED",
            deliveredAt: now,
            deliveredBy: actor.userId,
            codCollectedAt: p.codAmount > 0 ? now : null,
          },
        });
        await audit(
          tx,
          actor,
          "DELIVERY_COMPLETED",
          p.id,
          { codCollected: p.codAmount, publicId: p.publicId },
          p.partnerId,
        );
        await notify(
          tx,
          p.partner.account.clerkUserId,
          "Package delivered",
          `${p.publicId} delivered by ${actor.name}. Delivery fees enter the next eligible invoice cycle.`,
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
        );
        return {
          message:
            "Receipt submitted for admin verification. The invoice balance has not changed.",
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
        );
        return {
          message:
            command.decision === "REJECT"
              ? "Payment rejected. Invoice balance unchanged."
              : "Only the verified amount was credited.",
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
        const old = await tx.deliveryRate.findUnique({
          where: { zone: command.zone },
        });
        await tx.deliveryRate.upsert({
          where: { zone: command.zone },
          create: { zone: command.zone, fee: command.fee },
          update: { fee: command.fee },
        });
        await audit(tx, actor, "DELIVERY_RATE_CHANGED", command.zone, {
          previous: old?.fee ?? null,
          fee: command.fee,
        });
        return {
          message:
            "Rate saved for new packages. Registered package fees are unchanged.",
        };
      }
      case "handover":
      case "remit": {
        requireRole(actor, "ADMIN");
        const handingOver = command.type === "handover";
        const parcels = await tx.deliveryParcel.findMany({
          where: {
            id: { in: command.parcelIds },
            state: "DELIVERED",
            codAmount: { gt: 0 },
            ...(handingOver
              ? { driverId: command.driverId, handoverId: null }
              : {
                  partnerId: command.partnerId,
                  handoverId: { not: null },
                  remittanceId: null,
                }),
          },
        });
        if (parcels.length !== command.parcelIds.length)
          throw new DeliveryError(
            "Selected COD packages are not eligible. Refresh before recording the transfer.",
            409,
          );
        const total = parcels.reduce((sum, p) => sum + p.codAmount, 0);
        const transfer = handingOver
          ? await tx.deliveryCashHandover.create({
              data: {
                driverId: command.driverId,
                amount: total,
                reference: command.reference,
                verifiedBy: actor.userId,
              },
            })
          : await tx.deliveryCodRemittance.create({
              data: {
                partnerId: command.partnerId,
                amount: total,
                reference: command.reference,
                verifiedBy: actor.userId,
              },
            });
        await tx.deliveryParcel.updateMany({
          where: { id: { in: parcels.map((p) => p.id) } },
          data: handingOver
            ? { handoverId: transfer.id }
            : { remittanceId: transfer.id },
        });
        await audit(
          tx,
          actor,
          handingOver ? "DRIVER_CASH_RECEIVED" : "COD_SENT_TO_PARTNER",
          transfer.id,
          {
            amount: total,
            parcelIds: command.parcelIds,
            reference: command.reference,
          },
          handingOver ? undefined : command.partnerId,
        );
        if (!handingOver) {
          const partner = await tx.deliveryPartner.findUniqueOrThrow({
            where: { id: command.partnerId },
            select: { account: { select: { clerkUserId: true } } },
          });
          await notify(
            tx,
            partner.account.clerkUserId,
            "COD payout received",
            `${money(total)} recorded as received. Reference: ${command.reference}. Your payout receipt is available in Cash on delivery.`,
          );
          return {
            message:
              "COD payout and receipt recorded. Delivery invoices remain separate.",
            remittanceId: transfer.id,
          };
        }
        return {
          message: handingOver
            ? "Driver cash handover verified."
            : "COD remittance recorded. Delivery invoice balances remain separate.",
        };
      }
      case "readNotice": {
        const changed = await tx.deliveryNotification.updateMany({
          where: { id: command.id, recipient: actor.userId },
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
