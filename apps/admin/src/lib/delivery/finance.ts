import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { requireRole, type Actor } from "./domain";
import { assertOperationalActor } from "./role-authorization";
import { assertAdministrator } from "./admin-authorization";
import { financeFilters } from "./finance-contract";
import { dateFilter } from "./reporting-period";

export const financeInvoiceSelection = {
  id: true,
  publicId: true,
  partnerId: true,
  total: true,
  paid: true,
  createdAt: true,
  manualCutoffAt: true,
  cycle: { select: { localDate: true, cutoffAt: true } },
  partner: { select: { businessName: true, pickupAddress: true } },
  dispatch: { select: { sentAt: true } },
  paidInvoice: {
    select: { paidAt: true, dispatch: { select: { sentAt: true } } },
  },
  _count: {
    select: { lines: true, payments: { where: { status: "PENDING" } } },
  },
} satisfies Prisma.DeliveryInvoiceSelect;
export const financeTransferSelection = {
  id: true,
  partnerId: true,
  invoiceId: true,
  amount: true,
  confirmedAmount: true,
  status: true,
  bankReference: true,
  receiptId: true,
  reviewNote: true,
  reviewedAt: true,
  reviewedBy: true,
  createdAt: true,
  invoice: { select: { id: true, publicId: true, total: true, paid: true } },
  partner: { select: { businessName: true } },
} satisfies Prisma.DeliveryPaymentSelect;
export const financeDeliverySelection = {
  id: true,
  publicId: true,
  externalReference: true,
  recipientName: true,
  recipientPhone: true,
  destination: true,
  destinationLabel: true,
  origin: true,
  description: true,
  fee: true,
  registeredAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  deliveredBy: true,
  pickedUpBy: true,
  partner: { select: { businessName: true, pickupAddress: true } },
  driver: { select: { name: true, phone: true } },
  invoiceLine: {
    select: {
      amount: true,
      invoice: {
        select: {
          id: true,
          publicId: true,
          total: true,
          paid: true,
          _count: { select: { payments: { where: { status: "PENDING" } } } },
        },
      },
    },
  },
} satisfies Prisma.DeliveryParcelSelect;

export function financeDeliveryWhere(
  search: URLSearchParams,
): Prisma.DeliveryParcelWhereInput {
  const { partnerId, q, status, tab } = financeFilters(search);
  return {
    state: "DELIVERED",
    partnerId,
    deliveredAt: dateFilter(search),
    ...(tab === "deliveries" && status !== "ALL"
      ? { invoiceLine: status === "UNINVOICED" ? null : { isNot: null } }
      : {}),
    ...(q
      ? {
          OR: [
            { publicId: { contains: q, mode: "insensitive" } },
            { externalReference: { contains: q, mode: "insensitive" } },
            { recipientName: { contains: q, mode: "insensitive" } },
            { partner: { businessName: { contains: q, mode: "insensitive" } } },
            {
              invoiceLine: {
                invoice: { publicId: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
}
export async function financeQuery(
  actor: Actor,
  resource: string,
  search: URLSearchParams,
) {
  const partnerWorkspace = resource.startsWith("partner-");
  requireRole(actor, partnerWorkspace ? "PARTNER" : "ADMIN");
  search = new URLSearchParams(search);
  if (partnerWorkspace) search.set("partnerId", actor.partnerId!);
  const { tab, status, partnerId, q, page } = financeFilters(search),
    range = dateFilter(search);
  return database().$transaction(
    async (tx) => {
      if (partnerWorkspace) await assertOperationalActor(tx, actor);
      else await assertAdministrator(tx, actor);
      if (resource === "finance-partners") {
        return tx.deliveryPartner.findMany({
          where: q
            ? { businessName: { contains: q, mode: "insensitive" } }
            : {},
          select: { id: true, businessName: true },
          orderBy: [{ businessName: "asc" }, { id: "asc" }],
          take: 10,
        });
      }
      if (resource === "finance-summary" || resource === "partner-finance-summary") {
        const [invoices, pending, deliveries, confirmed] = await Promise.all([
          tx.deliveryInvoice.aggregate({
            where: { partnerId },
            _sum: { total: true, paid: true },
          }),
          tx.deliveryPayment.aggregate({
            where: { partnerId, status: "PENDING" },
            _sum: { amount: true },
            _count: true,
          }),
          tx.deliveryParcel.aggregate({
            where: { partnerId, state: "DELIVERED", deliveredAt: range },
            _sum: { fee: true },
            _count: true,
          }),
          tx.deliveryPayment.aggregate({
            where: {
              partnerId,
              status: { in: ["CONFIRMED", "PARTIAL"] },
              reviewedAt: range,
            },
            _sum: { confirmedAmount: true },
          }),
        ]);
        return {
          outstanding: (invoices._sum.total ?? 0) - (invoices._sum.paid ?? 0),
          pendingCount: pending._count,
          pendingAmount: pending._sum.amount ?? 0,
          deliveredCount: deliveries._count,
          deliveredFees: deliveries._sum.fee ?? 0,
          confirmed: confirmed._sum.confirmedAmount ?? 0,
        };
      }
      const partner = partnerId
        ? await tx.deliveryPartner.findUnique({
            where: { id: partnerId },
            select: { id: true, businessName: true },
          })
        : null;
      const take = 10,
        skip = (page - 1) * take;
      let items, total;
      if (tab === "invoices") {
        const where: Prisma.DeliveryInvoiceWhereInput = {
          partnerId,
          createdAt: range,
          ...(q
            ? {
                OR: [
                  { publicId: { contains: q, mode: "insensitive" } },
                  {
                    partner: {
                      businessName: { contains: q, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
          ...(status === "OUTSTANDING"
            ? { paid: { lt: tx.deliveryInvoice.fields.total } }
            : status === "PAID"
              ? { paid: { equals: tx.deliveryInvoice.fields.total } }
              : status === "AWAITING_VERIFICATION"
                ? {
                    payments: { some: { status: "PENDING" } },
                    paid: { lt: tx.deliveryInvoice.fields.total },
                  }
                : status === "UNPAID"
                  ? { paid: 0, payments: { none: { status: "PENDING" } } }
                  : status === "PARTIALLY_PAID"
                    ? {
                        paid: { gt: 0, lt: tx.deliveryInvoice.fields.total },
                        payments: { none: { status: "PENDING" } },
                      }
                    : {}),
        };
        [items, total] = await Promise.all([
          tx.deliveryInvoice.findMany({
            where,
            select: financeInvoiceSelection,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take,
            skip,
          }),
          tx.deliveryInvoice.count({ where }),
        ]);
      } else if (tab === "transfers") {
        const where: Prisma.DeliveryPaymentWhereInput = {
          partnerId,
          createdAt: range,
          ...(status === "ALL"
            ? {}
            : {
                status: status as
                  "PENDING" | "CONFIRMED" | "PARTIAL" | "REJECTED",
              }),
          ...(q
            ? {
                OR: [
                  { bankReference: { contains: q, mode: "insensitive" } },
                  {
                    invoice: { publicId: { contains: q, mode: "insensitive" } },
                  },
                  {
                    partner: {
                      businessName: { contains: q, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
        };
        [items, total] = await Promise.all([
          tx.deliveryPayment.findMany({
            where,
            select: financeTransferSelection,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take,
            skip,
          }),
          tx.deliveryPayment.count({ where }),
        ]);
      } else {
        const where = financeDeliveryWhere(search);
        [items, total] = await Promise.all([
          tx.deliveryParcel.findMany({
            where,
            select: financeDeliverySelection,
            orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
            take,
            skip,
          }),
          tx.deliveryParcel.count({ where }),
        ]);
      }
      return { items, total, page, pageSize: take, partner };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    },
  );
}
