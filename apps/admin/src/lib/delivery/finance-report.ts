import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { assertAdministrator } from "./admin-authorization";
import {
  financeDeliveryWhere,
  financeDeliverySelection,
  financeInvoiceSelection,
  financeTransferSelection,
} from "./finance";
import { financeFilters } from "./finance-contract";
import { reportingRange } from "./reporting-period";
import type { FinanceReport } from "./finance-export";

export async function financeReport(
  actor: Actor,
  search: URLSearchParams,
): Promise<FinanceReport> {
  requireRole(actor, "ADMIN");
  // Reports always include every completed delivery in the chosen partner/date scope.
  const filters = new URLSearchParams(search);
  filters.set("tab", "deliveries");
  filters.set("status", "ALL");
  filters.delete("q");
  const { partnerId } = financeFilters(filters),
    period = reportingRange(filters);
  const snapshot = await database().$transaction(
    async (tx) => {
      await assertAdministrator(tx, actor);
      const deliveries = await tx.deliveryParcel.findMany({
        where: financeDeliveryWhere(filters),
        select: financeDeliverySelection,
        orderBy: [{ deliveredAt: "asc" }, { id: "asc" }],
        take: 10001,
      });
      if (deliveries.length > 10000)
        throw new DeliveryError(
          "This report exceeds 10,000 deliveries. Choose a smaller date period or one partner.",
          413,
        );
      const ids = [
        ...new Set(
          deliveries.flatMap((p) =>
            p.invoiceLine ? [p.invoiceLine.invoice.id] : [],
          ),
        ),
      ];
      const [invoices, transfers, partner] = await Promise.all([
        tx.deliveryInvoice.findMany({
          where: { id: { in: ids } },
          select: financeInvoiceSelection,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        tx.deliveryPayment.findMany({
          where: { invoiceId: { in: ids } },
          select: financeTransferSelection,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 20001,
        }),
        partnerId
          ? tx.deliveryPartner.findUnique({
              where: { id: partnerId },
              select: { businessName: true },
            })
          : null,
      ]);
      if (transfers.length > 20000)
        throw new DeliveryError(
          "This report exceeds 20,000 transfers. Choose a smaller date period or one partner.",
          413,
        );
      return {
        deliveries,
        invoices,
        transfers,
        partnerLabel: partner?.businessName ?? "All partners",
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30000,
    },
  );
  return JSON.parse(
    JSON.stringify({
      ...snapshot,
      periodLabel: period.label,
      generatedAt: new Date().toISOString(),
    }),
  );
}
