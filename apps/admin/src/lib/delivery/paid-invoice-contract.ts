import { z } from "zod";
const amount = z.number().int().nonnegative().max(2147483647);
const time = z.iso.datetime({ offset: true });
export const paidInvoiceSnapshot = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    publicId: z.string().min(1),
    createdAt: time,
    cutoffAt: time,
    cycleDate: z.string().nullable(),
    currency: z.literal("MVR"),
    total: amount.positive(),
    paid: amount,
    partner: z.object({
      businessName: z.string(),
      pickupAddress: z.string(),
      account: z.object({ name: z.string(), phone: z.string() }),
    }),
    settings: z.object({
      businessLegalName: z.string(),
      registrationNumber: z.string(),
      supportEmail: z.string(),
      supportPhone: z.string(),
      bankName: z.string(),
      bankAccount: z.string(),
      beneficiary: z.string(),
    }),
    lines: z
      .array(
        z.object({
          id: z.uuid(),
          amount,
          parcel: z.object({
            publicId: z.string(),
            externalReference: z.string(),
            recipientName: z.string(),
            deliveredAt: time,
          }),
        }),
      )
      .min(1),
    payments: z
      .array(
        z.object({
          id: z.uuid(),
          bankReference: z.string(),
          amount: amount.positive(),
          reviewedAt: time,
        }),
      )
      .min(1),
  })
  .superRefine((document, ctx) => {
    if (
      document.paid !== document.total ||
      document.lines.reduce((sum, line) => sum + line.amount, 0) !==
        document.total ||
      document.payments.reduce((sum, payment) => sum + payment.amount, 0) !==
        document.total ||
      new Set(document.lines.map((line) => line.id)).size !==
        document.lines.length ||
      new Set(document.payments.map((payment) => payment.id)).size !==
        document.payments.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Paid invoices must reconcile exactly to unique package lines and verified payments.",
      });
  });
export type PaidInvoiceProof = {
  paidAt: string;
  issuedAt: string;
  payments: z.infer<typeof paidInvoiceSnapshot>["payments"];
};
