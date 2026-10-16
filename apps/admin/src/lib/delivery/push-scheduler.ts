import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export function pushSchedulerHeaders(secret: string, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "x-igo-time": timestamp,
    "x-igo-signature": createHmac("sha256", secret)
      .update(`igo-rider-push:${timestamp}`)
      .digest("hex"),
  };
}
export function validPushScheduler(
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 32) return false;
  const timestamp = headers.get("x-igo-time") ?? "",
    signature = headers.get("x-igo-signature") ?? "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Math.abs(now / 1000 - Number(timestamp)) > 90
  )
    return false;
  const expected = pushSchedulerHeaders(secret, Number(timestamp) * 1000)[
    "x-igo-signature"
  ];
  return timingSafeEqual(
    createHash("sha256").update(signature).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
