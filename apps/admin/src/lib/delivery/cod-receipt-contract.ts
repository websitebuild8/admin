import { z } from "zod";
import type { Actor } from "./domain";
export function codCashLabel(
  role: Actor["role"],
  remittanceId: string | null,
  handoverId: string | null,
) {
  return remittanceId
    ? role === "PARTNER"
      ? "Received"
      : "Remitted to partner"
    : handoverId
      ? "Held by iGO"
      : "Held by driver";
}
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const codReceiptSnapshot = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    number: z.string(),
    reference: z.string(),
    amount,
    recordedAt: z.iso.datetime({ offset: true }),
    currency: z.literal("MVR"),
    issuer: z.object({
      brand: z.string(),
      legalName: z.string(),
      registrationNumber: z.string(),
      supportPhone: z.string(),
      supportEmail: z.string(),
    }),
    partner: z.object({
      id: z.uuid(),
      businessName: z.string(),
      address: z.string(),
      area: z.string(),
      contactName: z.string(),
      phone: z.string(),
    }),
    lines: z
      .array(
        z.object({
          id: z.uuid(),
          publicId: z.string(),
          externalReference: z.string(),
          recipientName: z.string(),
          zone: z.string(),
          amount,
          deliveredAt: z.iso.datetime({ offset: true }),
        }),
      )
      .min(1),
  })
  .superRefine((receipt, ctx) => {
    if (
      receipt.lines.reduce((sum, line) => sum + line.amount, 0) !==
        receipt.amount ||
      new Set(receipt.lines.map((line) => line.id)).size !==
        receipt.lines.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Receipt lines must reconcile exactly once to the payout total.",
      });
  });
export type CodReceiptSnapshot = z.infer<typeof codReceiptSnapshot>;
export type CodReceiptDocument = {
  receipt: Omit<CodReceiptSnapshot, "lines"> & {
    issuedAt: string;
    packageCount: number;
  };
  items: CodReceiptSnapshot["lines"];
  total: number;
  page: number;
  pageSize: number;
};
