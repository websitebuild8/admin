import { z } from "zod";

export const partnerApplicationInput = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    businessType: z.enum(["FACEBOOK", "INSTAGRAM", "BUSINESS"]),
    pageUrl: z.string().trim().max(500).default(""),
    ownerName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    phone: z
      .string()
      .trim()
      .regex(
        /^(?:\+960)?[379]\d{6}$/,
        "Use a seven-digit Maldives phone number.",
      ),
    pickupAddress: z.string().trim().min(5).max(500),
    pickupArea: z.enum(["Malé", "Hulhumalé"]),
    dailyDeliveries: z
      .union([z.number(), z.string().regex(/^\d+$/)])
      .transform(Number)
      .pipe(z.number().int().min(1).max(10000)),
    contactConsent: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.pageUrl && value.businessType === "BUSINESS") return;
    let url: URL;
    try {
      url = new URL(value.pageUrl);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["pageUrl"],
        message: "Enter your full page link, starting with https://.",
      });
      return;
    }
    const host = url.hostname.replace(/^(www\.|m\.)/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (value.businessType === "FACEBOOK" &&
        !["facebook.com", "fb.com"].includes(host)) ||
      (value.businessType === "INSTAGRAM" && host !== "instagram.com")
    )
      ctx.addIssue({
        code: "custom",
        path: ["pageUrl"],
        message: "Use an https link to your selected business page.",
      });
  });

export type PartnerApplicationInput = z.output<typeof partnerApplicationInput>;

export function verifiedPrimaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
}) {
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  return primary?.verification?.status === "verified"
    ? primary.emailAddress.trim().toLowerCase()
    : null;
}
