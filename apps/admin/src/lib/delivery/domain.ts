import { z } from "zod";

export class DeliveryError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const zones = ["BOAT", "MALE", "HULHUMALE_1", "HULHUMALE_2"] as const;
export const zoneLabels: Record<string, string> = {
  BOAT: "Boat",
  MALE: "Within Malé",
  HULHUMALE_1: "Hulhumalé Phase 1",
  HULHUMALE_2: "Hulhumalé Phase 2",
};
export const defaultRates = {
  BOAT: 2500,
  MALE: 2500,
  HULHUMALE_1: 3500,
  HULHUMALE_2: 4500,
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-MV", { style: "currency", currency: "MVR" }).format(
    value / 100,
  );
export const localDate = (date: Date) =>
  new Date(date.getTime() + 5 * 3600000).toISOString().slice(0, 10);
export function nextCutoff(now: Date, minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439)
    throw new DeliveryError("Choose a valid daily cutoff.");
  const today = new Date(`${localDate(now)}T00:00:00+05:00`);
  const candidate = new Date(today.getTime() + minutes * 60000);
  return candidate > now ? candidate : new Date(candidate.getTime() + 86400000);
}
export function parseMoney(value: string | number) {
  const text = String(value).trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text))
    throw new DeliveryError(
      "Enter an MVR amount with at most two decimal places.",
    );
  const [whole, decimals = ""] = text.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const uuid = z.uuid();
const ids = z
  .array(uuid)
  .min(1)
  .max(100)
  .refine((v) => new Set(v).size === v.length, "Select each package once.");
const amount = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return parseMoney(value);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "Enter a valid MVR amount with at most two decimal places.",
    });
    return z.NEVER;
  }
});
export const parcelInput = z.object({
  externalReference: text(1, 80).transform((v) => v.toUpperCase()),
  recipientName: text(2, 120),
  recipientPhone: text(7, 12).regex(
    /^(?:\+960)?[379]\d{6}$/,
    "Use a seven-digit Maldives phone number.",
  ),
  destination: text(5, 500),
  zone: z.enum(zones),
  description: text(0, 500).default(""),
  codAmount: amount.default(0),
});
export const applicationInput = z
  .object({
    role: z.enum(["PARTNER", "DRIVER"]),
    name: text(2, 100),
    phone: text(7, 12).regex(/^(?:\+960)?[379]\d{6}$/),
    businessName: text(2, 120).optional(),
    pageUrl: z.url().max(500).optional(),
    pickupAddress: text(5, 500).optional(),
    pickupArea: z.enum(["Malé", "Hulhumalé"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pageUrl && !["https:", "http:"].includes(new URL(v.pageUrl).protocol))
      ctx.addIssue({
        code: "custom",
        message: "Use a public http or https page URL.",
        path: ["pageUrl"],
      });
    if (v.role === "PARTNER")
      for (const k of [
        "businessName",
        "pageUrl",
        "pickupAddress",
        "pickupArea",
      ] as const)
        if (!v[k])
          ctx.addIssue({
            code: "custom",
            message: "Required for partner applications.",
            path: [k],
          });
  });
export const commandInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("apply"), application: applicationInput }),
  z.object({
    type: z.literal("reviewAccount"),
    accountId: uuid,
    status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
    note: text(3, 500),
  }),
  z.object({
    type: z.literal("register"),
    partnerId: uuid.optional(),
    parcel: parcelInput,
  }),
  z.object({ type: z.literal("assign"), parcelIds: ids, driverId: uuid }),
  z.object({ type: z.literal("pickup"), parcelIds: ids }),
  z.object({
    type: z.literal("deliver"),
    parcelId: uuid,
    codReceived: z.boolean(),
  }),
  z.object({ type: z.literal("cancel"), parcelId: uuid, reason: text(3, 500) }),
  z.object({
    type: z.literal("submitPayment"),
    invoiceId: uuid,
    receiptId: uuid,
    bankReference: text(4, 80).transform((v) => v.toUpperCase()),
    amount,
  }),
  z.object({
    type: z.literal("reviewPayment"),
    paymentId: uuid,
    decision: z.enum(["CONFIRM", "REJECT"]),
    confirmedAmount: amount,
    note: text(3, 500),
  }),
  z.object({
    type: z.literal("cutoff"),
    partnerId: uuid,
    minutes: z.number().int().min(0).max(1439),
  }),
  z.object({
    type: z.literal("rate"),
    zone: z.enum(zones),
    fee: amount.refine(
      (v) => v > 0 && v <= 1000000,
      "Fee must be greater than zero and at most MVR 10,000.",
    ),
  }),
  z.object({
    type: z.literal("handover"),
    driverId: uuid,
    parcelIds: ids,
    reference: text(4, 100).transform((v) => v.toUpperCase()),
  }),
  z.object({
    type: z.literal("remit"),
    partnerId: uuid,
    parcelIds: ids,
    reference: text(4, 100).transform((v) => v.toUpperCase()),
  }),
  z.object({ type: z.literal("readNotice"), id: uuid }),
  z.object({
    type: z.literal("createPartnerInvoice"),
    partnerId: uuid,
    expectedCount: z.number().int().min(1).max(1000000),
    expectedTotal: z.number().int().min(1).max(2147483647),
  }),
  z.object({ type: z.literal("sendInvoice"), invoiceId: uuid }),
  z.object({ type: z.literal("sendPaidInvoice"), invoiceId: uuid }),
  z.object({
    type: z.literal("settings"),
    bankName: text(0, 100),
    bankAccount: text(0, 100),
    beneficiary: text(0, 150),
    businessLegalName: text(0, 150),
    registrationNumber: text(0, 100),
    supportPhone: text(0, 30),
    supportEmail: z.union([z.literal(""), z.email()]),
  }),
]);
export type DeliveryCommandInput = z.output<typeof commandInput>;
export type ParcelInput = z.output<typeof parcelInput>;
export type Actor = {
  userId: string;
  role: "ADMIN" | "PARTNER" | "DRIVER" | "APPLICANT";
  id: string | null;
  partnerId: string | null;
  status: string;
  name: string;
  businessName?: string;
  logoAvailable?: boolean;
};
export function requireRole(actor: Actor, ...roles: Actor["role"][]) {
  if (!roles.includes(actor.role) || actor.status !== "APPROVED")
    throw new DeliveryError(
      "This action requires approved access for your role.",
      403,
    );
  if (
    (actor.role === "PARTNER" && (!actor.id || !actor.partnerId)) ||
    (actor.role === "DRIVER" && !actor.id)
  )
    throw new DeliveryError(
      "Your account is missing its approved business or driver record. Contact iGO support.",
      403,
    );
}
export function partnerScope(actor: Actor, requested?: string) {
  requireRole(actor, "ADMIN", "PARTNER");
  if (actor.role === "PARTNER") {
    if (!actor.partnerId || (requested && requested !== actor.partnerId))
      throw new DeliveryError("Partner access denied.", 403);
    return actor.partnerId;
  }
  if (!requested) throw new DeliveryError("Choose a partner.");
  return requested;
}
export function reviewAmount(
  submitted: number,
  confirmed: number,
  outstanding: number,
) {
  if (
    !Number.isSafeInteger(confirmed) ||
    confirmed <= 0 ||
    confirmed > submitted ||
    confirmed > outstanding
  )
    throw new DeliveryError(
      "Confirmed amount must be positive and cannot exceed the submission or invoice balance.",
    );
  return confirmed < submitted ? ("PARTIAL" as const) : ("CONFIRMED" as const);
}
