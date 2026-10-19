import { z } from "zod";

export const financeTabs = ["invoices", "transfers", "deliveries"] as const;
export type FinanceTab = (typeof financeTabs)[number];
export const financeStatuses = {
  invoices: [
    "ALL",
    "OUTSTANDING",
    "AWAITING_VERIFICATION",
    "UNPAID",
    "PARTIALLY_PAID",
    "PAID",
  ],
  transfers: ["ALL", "PENDING", "CONFIRMED", "PARTIAL", "REJECTED"],
  deliveries: ["ALL", "UNINVOICED", "INVOICED"],
} as const;
export function financeFilters(search: URLSearchParams) {
  const tab = z.enum(financeTabs).parse(search.get("tab") ?? "invoices");
  const status = z
    .string()
    .refine(
      (v) => (financeStatuses[tab] as readonly string[]).includes(v),
      "Choose a valid finance status.",
    )
    .parse(search.get("status") ?? "ALL");
  return {
    tab,
    status,
    partnerId: search.get("partnerId")
      ? z.uuid().parse(search.get("partnerId"))
      : undefined,
    q: z
      .string()
      .max(100)
      .parse(search.get("q")?.trim() ?? ""),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000000)
      .parse(search.get("page") ?? 1),
  };
}
export type FinanceSummary = {
  outstanding: number;
  pendingCount: number;
  pendingAmount: number;
  deliveredCount: number;
  deliveredFees: number;
  confirmed: number;
};
export type FinanceInvoice = {
  id: string;
  publicId: string;
  partnerId: string;
  total: number;
  paid: number;
  createdAt: string;
  manualCutoffAt: string | null;
  cycle: { localDate: string; cutoffAt: string } | null;
  partner: { businessName: string; pickupAddress: string };
  dispatch: { sentAt: string } | null;
  paidInvoice: { paidAt: string; dispatch: { sentAt: string } | null } | null;
  _count: { lines: number; payments: number };
};
export type FinanceTransfer = {
  id: string;
  partnerId: string;
  invoiceId: string;
  amount: number;
  confirmedAmount: number;
  status: string;
  bankReference: string;
  receiptId: string;
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  invoice: { id: string; publicId: string; total: number; paid: number };
  partner: { businessName: string };
};
export type FinanceDelivery = {
  id: string;
  publicId: string;
  externalReference: string;
  recipientName: string;
  recipientPhone: string;
  destination: string;
  destinationLabel: string;
  origin: string | null;
  description: string;
  fee: number;
  registeredAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  deliveredBy: string | null;
  pickedUpBy: string | null;
  partner: { businessName: string; pickupAddress: string };
  driver: { name: string; phone: string } | null;
  invoiceLine: {
    amount: number;
    invoice: {
      id: string;
      publicId: string;
      total: number;
      paid: number;
      _count: { payments: number };
    };
  } | null;
};
export type FinanceList = {
  items: FinanceInvoice[] | FinanceTransfer[] | FinanceDelivery[];
  total: number;
  page: number;
  pageSize: number;
  partner: { id: string; businessName: string } | null;
};
