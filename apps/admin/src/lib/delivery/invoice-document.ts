import "server-only";
import { z } from "zod";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";

export async function invoiceDocument(actor: Actor, id: string) {
  requireRole(actor, "ADMIN", "PARTNER");
  z.uuid().parse(id);
  const db = database();
  const invoice = await db.deliveryInvoice.findFirst({
    where: {
      id,
      ...(actor.role === "PARTNER" ? { partnerId: actor.partnerId! } : {}),
    },
    include: {
      cycle: true,
      partner: {
        select: {
          businessName: true,
          pickupAddress: true,
          account: { select: { name: true, phone: true } },
        },
      },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          amount: true,
          parcel: {
            select: {
              publicId: true,
              externalReference: true,
              recipientName: true,
              deliveredAt: true,
            },
          },
        },
      },
    },
  });
  if (!invoice) throw new DeliveryError("Invoice not found.", 404);
  const settings = await db.deliverySettings.findUnique({
    where: { id: "default" },
    select: {
      businessLegalName: true,
      registrationNumber: true,
      supportEmail: true,
      supportPhone: true,
      bankName: true,
      bankAccount: true,
      beneficiary: true,
    },
  });
  return {
    generatedAt: new Date().toISOString(),
    id: invoice.id,
    publicId: invoice.publicId,
    createdAt: invoice.createdAt.toISOString(),
    cutoffAt: (invoice.cycle?.cutoffAt ??
      invoice.manualCutoffAt)!.toISOString(),
    cycleDate: invoice.cycle?.localDate ?? null,
    total: invoice.total,
    paid: invoice.paid,
    partner: invoice.partner,
    settings,
    lines: invoice.lines.map((line) => ({
      ...line,
      parcel: {
        ...line.parcel,
        deliveredAt: line.parcel.deliveredAt!.toISOString(),
      },
    })),
  };
}
export type InvoiceDocument = Awaited<ReturnType<typeof invoiceDocument>>;
