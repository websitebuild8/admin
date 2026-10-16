import "server-only";
import sharp from "sharp";
import { database } from "../db";
import { storageSettings } from "../menu-image-storage";
import { DeliveryError, requireRole, type Actor } from "./domain";

export const partnerLogoBucket = "igo-partner-logos";
export function partnerLogoStorage() {
  try {
    return storageSettings();
  } catch {
    throw new DeliveryError(
      "Business logo storage needs server configuration.",
      503,
    );
  }
}
export async function preparePartnerLogo(input: Buffer) {
  if (!input.length || input.length > 3 * 1024 * 1024)
    throw new DeliveryError("Choose a JPG, PNG or WebP logo up to 3 MB.");
  try {
    const image = sharp(input, { limitInputPixels: 16000000, animated: false });
    const meta = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1 ||
      (meta.width ?? 0) < 64 ||
      (meta.height ?? 0) < 64
    )
      throw new Error("Invalid logo");
    return await image
      .rotate()
      .resize(512, 512, { fit: "contain", background: "#ffffff" })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    throw new DeliveryError(
      "Use a single JPG, PNG or WebP logo, at least 64 × 64 pixels. SVG and animated files are not accepted.",
    );
  }
}
function path(value: string) {
  if (!/^[a-f0-9-]{36}\/logo\.webp$/.test(value))
    throw new DeliveryError("Invalid logo reference.");
  return value;
}
export async function uploadPartnerLogo(objectPath: string, bytes: Buffer) {
  const { origin, headers } = partnerLogoStorage();
  try {
    const response = await fetch(
      `${origin}/storage/v1/object/${partnerLogoBucket}/${path(objectPath)}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "image/webp",
          "x-upsert": "true",
        },
        body: new Uint8Array(bytes),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok) throw new Error("Storage rejected logo");
  } catch {
    throw new DeliveryError(
      "The logo could not be saved. Keep this form open and retry; your application will not enter review until the upload succeeds.",
      503,
    );
  }
}
export async function partnerLogo(actor: Actor, applicationId?: string) {
  requireRole(actor, "ADMIN", "PARTNER");
  const application =
    actor.role === "ADMIN" && applicationId
      ? await database().deliveryPartnerApplication.findFirst({
          where: { id: applicationId, logoReady: true },
        })
      : actor.role === "PARTNER"
        ? await database().deliveryPartnerApplication.findFirst({
            where: { partner: { id: actor.partnerId! }, logoReady: true },
          })
        : null;
  if (
    !application ||
    (actor.role === "PARTNER" &&
      applicationId &&
      application.id !== applicationId)
  )
    throw new DeliveryError("Logo not found.", 404);
  const { origin, headers } = partnerLogoStorage();
  const result = await fetch(
    `${origin}/storage/v1/object/authenticated/${partnerLogoBucket}/${path(application.logoPath)}`,
    {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!result.ok)
    throw new DeliveryError(
      "The business logo is temporarily unavailable.",
      503,
    );
  return new Uint8Array(await result.arrayBuffer());
}
