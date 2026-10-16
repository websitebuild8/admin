export function invoicePaymentStatus(invoice: {
  total: number;
  paid: number;
  _count?: { payments?: number };
}) {
  if (invoice.total > 0 && invoice.paid === invoice.total) return "PAID";
  if ((invoice._count?.payments ?? 0) > 0) return "AWAITING_VERIFICATION";
  return invoice.paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
}
export const invoiceStatusLabels = {
  PAID: "Paid",
  AWAITING_VERIFICATION: "Awaiting verification",
  PARTIALLY_PAID: "Partially paid",
  UNPAID: "Unpaid",
};
export const invoiceEventLabels: Record<string, string> = {
  ISSUED: "Invoice issued",
  SENT: "Invoice sent to partner",
  PAYMENT_SUBMITTED: "Payment submitted · awaiting verification",
  PAYMENT_REJECTED: "Payment rejected",
  PAYMENT_PARTIAL: "Payment partially verified",
  PAYMENT_CONFIRMED: "Payment verified",
  PAID: "Fully paid · paid invoice issued",
  PAID_SENT: "Paid invoice sent to partner",
};
export type InvoiceHistoryEvent = {
  id: string;
  kind: string;
  occurredAt: string;
  amount: number | null;
  reference: string;
  note: string;
  receiptId: string | null;
};
