import { z } from "zod";
import { partnerApplicationInput } from "@/lib/delivery/partner-application-input";
import {
  reservePartnerApplication,
  completePartnerApplication,
} from "@/lib/delivery/partner-applications";
import {
  partnerLogoStorage,
  preparePartnerLogo,
  uploadPartnerLogo,
} from "@/lib/delivery/partner-logos";
import {
  json,
  failure,
  formUpload,
  originCheck,
  limitRequests,
} from "@/lib/delivery/http";
import { DeliveryError, type Actor } from "@/lib/delivery/domain";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    originCheck(request);
    // Reject a missing deployment configuration before reserving an email or
    // spending database/image-processing work on an upload that cannot succeed.
    partnerLogoStorage();
    const ip =
      process.env.NETLIFY === "true"
        ? request.headers.get("x-nf-client-connection-ip") || "unknown"
        : process.env.VERCEL
          ? request.headers.get("x-vercel-forwarded-for") || "unknown"
          : "shared-local-or-proxy";
    const anonymous: Actor = {
      userId: `public-partner:${ip}`,
      id: null,
      partnerId: null,
      role: "APPLICANT",
      name: "Applicant",
      status: "UNREGISTERED",
    };
    await limitRequests(anonymous, "submit-application", 20, 60);
    await limitRequests(
      { ...anonymous, userId: "public-partner:all" },
      "submit-application",
      100,
      1440,
    );
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    const form = await formUpload(request, 3 * 1024 * 1024 + 16000);
    if (form.get("website"))
      throw new DeliveryError("The application could not be submitted.");
    const file = form.get("logo");
    if (!(file instanceof File))
      throw new DeliveryError("Upload your business logo.");
    const names = [
      "businessName",
      "businessType",
      "pageUrl",
      "ownerName",
      "email",
      "phone",
      "pickupAddress",
      "pickupArea",
      "dailyDeliveries",
    ];
    const input = partnerApplicationInput.parse({
      ...Object.fromEntries(
        names.map((name) => [name, String(form.get(name) ?? "")]),
      ),
      contactConsent: form.get("contactConsent") === "true",
    });
    const logo = await preparePartnerLogo(
      Buffer.from(await file.arrayBuffer()),
    );
    const application = await reservePartnerApplication(key, input, logo);
    if (!application.logoReady)
      await uploadPartnerLogo(application.logoPath, logo);
    return json(
      await completePartnerApplication(application.id, application.digest),
      201,
    );
  } catch (error) {
    if (error instanceof DeliveryError || error instanceof z.ZodError)
      return failure(error);
    console.error(
      "Partner application failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json(
      {
        error:
          "Your application could not be confirmed. Keep this form open and retry.",
      },
      503,
    );
  }
}
