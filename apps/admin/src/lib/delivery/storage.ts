import "server-only";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { database } from "../db";
import { storageSettings } from "./storage-client";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { audit } from "./commands";
export const receiptBucket = "igo-delivery-receipts";
export async function prepareReceipt(input: Buffer) {
  if (!input.length || input.length > 5 * 1024 * 1024)
    throw new DeliveryError(
      "Upload a JPG, PNG or WebP bank receipt up to 5 MB.",
    );
  try {
    const pipeline = sharp(input, {
      limitInputPixels: 16000000,
      animated: false,
    });
    const meta = await pipeline.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1 ||
      (meta.width ?? 0) < 100 ||
      (meta.height ?? 0) < 100
    )
      throw new Error("Invalid receipt image");
    return await pipeline
      .rotate()
      .resize({
        width: 1800,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new DeliveryError(
      "Use a readable, single-page JPG, PNG or WebP bank receipt.",
    );
  }
}
export async function uploadReceipt(actor: Actor, input: Buffer) {
  requireRole(actor, "PARTNER");
  const bytes = await prepareReceipt(input),
    hash = createHash("sha256").update(bytes).digest("hex");
  const existing = await database().deliveryReceipt.findUnique({
    where: { partnerId_sha256: { partnerId: actor.partnerId!, sha256: hash } },
    include: { payment: { select: { id: true } } },
  });
  if (existing?.payment)
    throw new DeliveryError("This receipt has already been submitted.", 409);
  const id = existing?.id ?? randomUUID(),
    path = `${actor.partnerId}/${id}.webp`;
  const { origin, headers } = storageSettings();
  if (!existing)
    await database().deliveryReceipt.create({
      data: {
        id,
        partnerId: actor.partnerId!,
        path,
        sha256: hash,
        bytes: bytes.length,
      },
    });
  if (!existing?.ready) {
    const uploaded = await fetch(
      `${origin}/storage/v1/object/${receiptBucket}/${path}`,
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
    if (!uploaded.ok)
      throw new DeliveryError(
        "Private receipt storage is not ready. Please retry after configuration.",
        503,
      );
    await database().$transaction(async (tx) => {
      await tx.deliveryReceipt.update({ where: { id }, data: { ready: true } });
      await audit(
        tx,
        actor,
        "BANK_RECEIPT_UPLOADED",
        id,
        { bytes: bytes.length },
        actor.partnerId!,
      );
    });
  }
  return {
    receiptId: id,
    message:
      "Receipt uploaded privately. Submit it for review to create a payment record.",
  };
}
export async function receiptUrl(actor: Actor, id: string) {
  requireRole(actor, "ADMIN", "PARTNER");
  const receipt = await database().deliveryReceipt.findFirst({
    where: {
      id,
      ready: true,
      ...(actor.role === "PARTNER" ? { partnerId: actor.partnerId! } : {}),
    },
  });
  if (!receipt) throw new DeliveryError("Receipt not found.", 404);
  const { origin, headers } = storageSettings();
  const response = await fetch(
    `${origin}/storage/v1/object/sign/${receiptBucket}/${receipt.path}`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new DeliveryError(
      "Receipt download is temporarily unavailable.",
      503,
    );
  const result = await response.json();
  if (
    typeof result.signedURL !== "string" ||
    !result.signedURL.startsWith(`/object/sign/${receiptBucket}/`)
  )
    throw new DeliveryError("Invalid storage download response.", 503);
  return `${origin}/storage/v1${result.signedURL}`;
}
