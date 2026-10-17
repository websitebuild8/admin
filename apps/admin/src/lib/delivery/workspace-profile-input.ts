import { z } from "zod";
import { operatingLocations } from "./domain";
import { normalizePartnerPageUrl } from "./partner-application-input";
const common = {
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+960)?[379]\d{6}$/,
      "Use a seven-digit Maldives phone number.",
    ),
};
export const workspaceProfileInput = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("DRIVER"), ...common }),
  z.strictObject({
    role: z.literal("PARTNER"),
    ...common,
    businessName: z.string().trim().min(2).max(120),
    pickupAddress: z.string().trim().min(5).max(500),
    operatingLocation: z.enum(operatingLocations),
    pageUrl: z
      .string()
      .trim()
      .max(500)
      .transform(normalizePartnerPageUrl)
      .refine((url) => {
        if (!url) return true;
        try {
          const parsed = new URL(url);
          return (
            parsed.protocol === "https:" && !parsed.username && !parsed.password
          );
        } catch {
          return false;
        }
      }, "Enter a public website or social page address.")
      .default(""),
  }),
]);
export type WorkspaceProfileInput = z.infer<typeof workspaceProfileInput>;
