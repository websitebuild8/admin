import "server-only";
import { z } from "zod";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
export async function invoiceRecords(
  actor: Actor,
  resource: string,
  search: URLSearchParams,
  page: number,
) {
  requireRole(actor, "ADMIN", "PARTNER");
  const id = z.uuid().parse(search.get("id"));
  const db = database();
  const invoice = await db.deliveryInvoice.findFirst({
    where: {
      id,
      ...(actor.role === "PARTNER" ? { partnerId: actor.partnerId! } : {}),
    },
    select: { id: true },
  });
  if (!invoice) throw new DeliveryError("Invoice not found.", 404);
  const where = { invoiceId: id };
  if (resource === "invoice-history") {
    const [items, total] = await Promise.all([
      db.deliveryInvoiceEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 10,
        skip: (page - 1) * 10,
        select: {
          id: true,
          kind: true,
          occurredAt: true,
          amount: true,
          reference: true,
          note: true,
          receiptId: true,
        },
      }),
      db.deliveryInvoiceEvent.count({ where }),
    ]);
    return { items, total, page, pageSize: 10 };
  }
  const [items, total] = await Promise.all([
    db.deliveryPayment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      skip: (page - 1) * 10,
      select: {
        id: true,
        amount: true,
        confirmedAmount: true,
        status: true,
        bankReference: true,
        receiptId: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        invoice: { select: { publicId: true, total: true, paid: true } },
        partner: { select: { businessName: true } },
      },
    }),
    db.deliveryPayment.count({ where }),
  ]);
  // Reviewer identities stay in the administrator audit log rather than the partner response.
  return { items, total, page, pageSize: 10 };
}
