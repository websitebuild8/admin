import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { database } from "../db";
import { DeliveryError, type Actor } from "./domain";
import { isAllowedDeliveryOrigin } from "./request-origin";
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof DeliveryError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
          .slice(0, 1500),
      },
      400,
    );
  console.error(
    "Delivery operation failed",
    error instanceof Error ? error.name : "unknown",
  );
  return json(
    {
      error:
        "The operation could not be completed. Check the connection and retry. No successful financial change should be assumed.",
    },
    503,
  );
}
export function originCheck(request: Request) {
  if (
    !isAllowedDeliveryOrigin(request, [
      process.env.DELIVERY_PUBLIC_URL,
      // Netlify supplies URL to the running function as its public site URL.
      process.env.URL,
    ])
  )
    throw new DeliveryError("Request origin is not allowed.", 403);
}
export async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new DeliveryError("Request body required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > limit) {
      await reader.cancel();
      throw new DeliveryError("The upload is too large.", 413);
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
export async function formUpload(request: Request, limit: number) {
  const bytes = await boundedBody(request, limit);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
export async function limitRequests(
  actor: Actor,
  operation: string,
  max: number,
  minutes = 1,
) {
  const bucket = Math.floor(Date.now() / (minutes * 60000));
  const key = `delivery:${createHash("sha256").update(actor.userId).digest("hex")}:${operation}:${bucket}`;
  const entry = await database().deliveryRequestBucket.upsert({
    where: { key },
    create: {
      key,
      count: 1,
      expiresAt: new Date((bucket + 1) * minutes * 60000),
    },
    update: { count: { increment: 1 } },
  });
  if (entry.count > max)
    throw new DeliveryError(
      "Too many requests. Please wait before retrying.",
      429,
    );
}
