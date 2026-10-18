import type { Prisma } from "@/generated/prisma/client";
import { localDate } from "./domain";

export const packageFilters = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending deliveries" },
  { value: "REGISTERED", label: "Registered" },
  { value: "PICKED_UP", label: "Picked up" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "UNINVOICED", label: "Awaiting billing" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;
export function packageFilter(value: string | null) {
  return packageFilters.find((filter) => filter.value === value)?.value ?? "";
}
export function invoiceFilter(value: string | null) {
  return value === "OUTSTANDING" ? value : "";
}
export function packageFilterWhere(
  value: string | null,
): Prisma.DeliveryParcelWhereInput {
  const filter = packageFilter(value);
  if (filter === "PENDING")
    return { state: { in: ["REGISTERED", "PICKED_UP"] } };
  if (filter === "UNINVOICED") return { state: "DELIVERED", invoiceLine: null };
  return filter ? { state: filter } : {};
}
export function maldivesToday(now = new Date()) {
  const start = new Date(`${localDate(now)}T00:00:00+05:00`);
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}
