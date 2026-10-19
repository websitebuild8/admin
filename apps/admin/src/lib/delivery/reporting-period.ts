import type { Prisma } from "@/generated/prisma/client";
import {
  earningsRange,
  earningsPeriods,
  type EarningsPeriod,
} from "./earnings-period";
import { localDate } from "./domain";

export const reportingPeriods = earningsPeriods;
export type PeriodSelection = { period: EarningsPeriod; value: string };
export const allTime: PeriodSelection = { period: "ALL_TIME", value: "" };

export function reportingRange(search: URLSearchParams, now = new Date()) {
  const params = new URLSearchParams(search);
  if (!params.get("period")) params.set("period", "ALL_TIME");
  // Preserve links saved before the shared date selector was introduced.
  if (params.get("period") === "TODAY") {
    params.set("period", "DAILY");
    params.set("value", localDate(now));
  }
  return earningsRange(params, now);
}
export function periodSelection(
  search: Pick<URLSearchParams, "get">,
  now = new Date(),
): PeriodSelection {
  const range = reportingRange(
    new URLSearchParams({
      period: search.get("period") || "ALL_TIME",
      ...(search.get("value") ? { value: search.get("value")! } : {}),
    }),
    now,
  );
  return { period: range.period, value: range.value };
}
export function periodQuery(selection: PeriodSelection) {
  return new URLSearchParams({
    period: selection.period,
    ...(selection.value ? { value: selection.value } : {}),
  }).toString();
}
export function withPeriod(href: string, selection: PeriodSelection) {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("period", selection.period);
  params.delete("value");
  if (selection.value) params.set("value", selection.value);
  return `${path}?${params}`;
}
export function dateFilter(search: URLSearchParams, now = new Date()) {
  const range = reportingRange(search, now);
  return range.start ? { gte: range.start, lt: range.end! } : undefined;
}
export function parcelPeriodWhere(
  state: string | null,
  search: URLSearchParams,
): Prisma.DeliveryParcelWhereInput {
  const range = dateFilter(search);
  if (!range) return {};
  if (state === "DELIVERED" || state === "UNINVOICED")
    return { deliveredAt: range };
  if (state === "PICKED_UP") return { pickedUpAt: range };
  return { registeredAt: range };
}
export const parcelDateLabel = (state: string | null) =>
  state === "DELIVERED" || state === "UNINVOICED"
    ? "Delivery completion date"
    : state === "PICKED_UP"
      ? "Pickup date"
      : "Package registration date";
export const datedScreens: Record<string, string> = {
  finance:
    "Invoices: issue date · transfers: submission date · deliveries: completion date",
  overview:
    "Pending: registration date · completed: delivery date · balance due: all time",
  reports:
    "Pending: registration date · completed: delivery date · balance due: all time",
  packages: "Package registration date",
  collections: "Package registration date",
  deliveries: "Pickup date",
  invoices: "Invoice issue date · earlier unpaid invoices remain due",
  payments: "Transfer submission date · amounts reflect current verification",
  partners: "Partner account registration date",
  drivers: "Rider account registration date",
  applications: "Application submission date",
  administrators: "Admin access grant date",
  notifications: "Notification date",
  audit: "Activity date",
};
