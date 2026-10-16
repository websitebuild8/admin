import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  partnerLogoBucket,
  partnerLogoStorage,
  preparePartnerLogo,
  uploadPartnerLogo,
} from "../src/lib/delivery/partner-logos";

async function main() {
  const { origin, headers } = partnerLogoStorage();
  const base = `${origin}/storage/v1`;
  let response = await fetch(`${base}/bucket/${partnerLogoBucket}`, {
    headers,
  });
  if (!response.ok) {
    const info = await response.json().catch(() => null);
    if (
      response.status !== 404 &&
      info?.statusCode !== "404" &&
      info?.error !== "Bucket not found"
    )
      throw new Error(`Logo storage lookup failed (${response.status}).`);
    response = await fetch(`${base}/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: partnerLogoBucket,
        name: partnerLogoBucket,
        public: false,
        file_size_limit: 3145728,
        allowed_mime_types: ["image/webp"],
      }),
    });
    if (!response.ok)
      throw new Error(
        `Private logo bucket creation failed (${response.status}).`,
      );
  }
  const info = await (
    await fetch(`${base}/bucket/${partnerLogoBucket}`, { headers })
  ).json();
  if (info.public !== false)
    throw new Error("The business-logo bucket must be private.");
  const bytes = await preparePartnerLogo(
    await sharp({
      create: { width: 96, height: 72, channels: 3, background: "#ffea00" },
    })
      .png()
      .toBuffer(),
  );
  const path = `${randomUUID()}/logo.webp`;
  let uploaded = false;
  try {
    await uploadPartnerLogo(path, bytes);
    uploaded = true;
    const anonymous = await fetch(
      `${base}/object/public/${partnerLogoBucket}/${path}`,
    );
    if (![400, 401, 403, 404].includes(anonymous.status))
      throw new Error("Expected anonymous logo access to be denied.");
    const privateRead = await fetch(
      `${base}/object/authenticated/${partnerLogoBucket}/${path}`,
      { headers },
    );
    if (
      !privateRead.ok ||
      !Buffer.from(await privateRead.arrayBuffer()).equals(bytes)
    )
      throw new Error("Private logo read did not match the resized image.");
    console.log(
      "Verified private logo upload, 512 × 512 image conversion, anonymous denial and authenticated read.",
    );
  } finally {
    if (uploaded) {
      const removal = await fetch(`${base}/object/${partnerLogoBucket}`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!removal.ok) throw new Error("Temporary logo probe cleanup failed.");
      console.log("Temporary logo probe removed.");
    }
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Logo setup failed.");
  process.exitCode = 1;
});
