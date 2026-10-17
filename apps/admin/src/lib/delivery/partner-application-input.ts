import { z } from "zod";
import { operatingLocations } from "./domain";

/** Normalize the address locally; never fetch or expand a submitted short link. */
export function normalizePartnerPageUrl(input: string) {
  const value = input.trim();
  if (!value) return "";
  const address = value.startsWith("//")
    ? `https:${value}`
    : /^[a-z][a-z\d+.-]*:/i.test(value)
      ? value
      : `https://${value}`;
  try {
    const url = new URL(address);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    // Leave invalid input for the shared validator to explain to the applicant.
    return value;
  }
}

export const partnerApplicationInput = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    businessType: z.enum(["FACEBOOK", "INSTAGRAM", "BUSINESS"]),
    pageUrl: z
      .string()
      .trim()
      .max(500)
      .default("")
      .transform(normalizePartnerPageUrl)
      .pipe(z.string().max(500)),
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
    operatingLocation: z.enum(operatingLocations),
    dailyDeliveries: z
      .union([z.number(), z.string().regex(/^\d+$/)])
      .transform(Number)
      .pipe(z.number().int().min(1).max(10000)),
    contactConsent: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.pageUrl) return;
    let url: URL;
    try {
      url = new URL(value.pageUrl);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["pageUrl"],
        message: "Enter a valid website or page link.",
      });
      return;
    }
    const host = url.hostname.replace(/^(www\.|m\.)/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (value.businessType === "FACEBOOK" &&
        !["facebook.com", "fb.com", "fb.me", "on.fb.me"].includes(host)) ||
      (value.businessType === "INSTAGRAM" && host !== "instagram.com")
    )
      ctx.addIssue({
        code: "custom",
        path: ["pageUrl"],
        message: "Enter a valid link to your selected business page.",
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
