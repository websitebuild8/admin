import "server-only";
import { database } from "../db";
import { requireRole, localDate, type Actor } from "./domain";
import { earningsRange, type EarningsResult } from "./earnings-period";

export async function deliveryEarnings(
  actor: Actor,
  search: URLSearchParams,
  now = new Date(),
): Promise<EarningsResult> {
  requireRole(actor, "ADMIN");
  const range = earningsRange(search, now),
    db = database();
  const [income, parcels, invoices, payments] = await Promise.all([
    db.deliveryPaymentAllocation.aggregate({
      where: {
        payment: {
          status: { in: ["PARTIAL", "CONFIRMED"] },
          reviewedAt: {
            ...(range.start ? { gte: range.start, lt: range.end } : {}),
            lte: now,
          },
        },
      },
      _sum: { amount: true },
    }),
    db.deliveryParcel.aggregate({
      where: { registeredAt: { lte: now } },
      _min: { registeredAt: true },
    }),
    db.deliveryInvoice.aggregate({
      where: { createdAt: { lte: now } },
      _min: { createdAt: true },
    }),
    db.deliveryPayment.aggregate({
      where: { createdAt: { lte: now } },
      _min: { createdAt: true, reviewedAt: true },
    }),
  ]);
  const dates = [
    parcels._min.registeredAt,
    invoices._min.createdAt,
    payments._min.createdAt,
    payments._min.reviewedAt,
  ].filter((date): date is Date => !!date && date <= now);
  const firstActivity = dates.length
    ? localDate(new Date(Math.min(...dates.map((date) => date.getTime()))))
    : null;
  const currentYear = Number(range.today.slice(0, 4)),
    firstYear = firstActivity ? Number(firstActivity.slice(0, 4)) : currentYear;
  return {
    amount: income._sum.amount ?? 0,
    period: range.period,
    value: range.value,
    label: range.label,
    today: range.today,
    firstActivity,
    years: Array.from({ length: currentYear - firstYear + 1 }, (_, index) =>
      String(currentYear - index),
    ),
    asOf: now.toISOString(),
  };
}
