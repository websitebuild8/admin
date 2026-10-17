import { z } from "zod";
import { localDate } from "./domain";

export const earningsPeriods = [
  { value: "ALL_TIME", label: "All time" },
  { value: "DAILY", label: "Daily" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
] as const;
export type EarningsPeriod = (typeof earningsPeriods)[number]["value"];
export type EarningsResult = {
  amount: number;
  period: EarningsPeriod;
  value: string;
  label: string;
  today: string;
  firstActivity: string | null;
  years: string[];
  asOf: string;
};

/** Calendar boundaries are midnight in Maldives, independently of host timezone. */
export function earningsRange(search: URLSearchParams, now = new Date()) {
  const period = z
    .enum(["ALL_TIME", "DAILY", "MONTHLY", "YEARLY"])
    .parse(search.get("period") ?? "ALL_TIME");
  const today = localDate(now);
  if (period === "ALL_TIME")
    return {
      period,
      value: "",
      label: "All time · since operations began",
      today,
      start: undefined,
      end: undefined,
    };
  const fallback =
    period === "DAILY"
      ? today
      : period === "MONTHLY"
        ? today.slice(0, 7)
        : today.slice(0, 4);
  const value = search.get("value") ?? fallback;
  const iso =
    period === "DAILY"
      ? value
      : period === "MONTHLY"
        ? `${value}-01`
        : `${value}-01-01`;
  z.iso.date().parse(iso);
  if (period === "MONTHLY")
    z.string()
      .regex(/^\d{4}-\d{2}$/)
      .parse(value);
  if (period === "YEARLY")
    z.string()
      .regex(/^\d{4}$/)
      .parse(value);
  // Future periods have no earned income and should not be selectable.
  if (value > fallback)
    throw new z.ZodError([
      {
        code: "custom",
        path: ["value"],
        message: "Choose a current or past period.",
      },
    ]);
  const start = new Date(`${iso}T00:00:00+05:00`);
  // Increment a calendar representing the local date, then apply UTC+5.
  const calendar = new Date(`${iso}T00:00:00Z`);
  if (period === "DAILY") calendar.setUTCDate(calendar.getUTCDate() + 1);
  else if (period === "MONTHLY")
    calendar.setUTCMonth(calendar.getUTCMonth() + 1);
  else calendar.setUTCFullYear(calendar.getUTCFullYear() + 1);
  const end = new Date(calendar.getTime() - 5 * 3600000);
  const label =
    period === "YEARLY"
      ? value
      : new Intl.DateTimeFormat("en-GB", {
          timeZone: "Indian/Maldives",
          ...(period === "DAILY" ? { day: "numeric" as const } : {}),
          month: "long",
          year: "numeric",
        }).format(start);
  return { period, value, label, today, start, end };
}
