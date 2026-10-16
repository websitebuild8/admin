import "server-only";
import { createECDH } from "node:crypto";
export function pushSettings() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  try {
    if (
      !/^[A-Za-z0-9_-]{87}$/.test(publicKey) ||
      !/^[A-Za-z0-9_-]{43}$/.test(privateKey)
    )
      return null;
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (pair.getPublicKey().toString("base64url") !== publicKey) return null;
    const url = new URL(subject);
    if (
      !["https:", "mailto:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}
export function riderClientConfig() {
  const key = process.env.GOOGLE_MAPS_EMBED_API_KEY?.trim();
  return {
    mapsEmbedKey: key && /^AIza[A-Za-z0-9_-]{20,}$/.test(key) ? key : null,
    pushPublicKey: pushSettings()?.publicKey ?? null,
  };
}
