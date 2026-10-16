import { config } from "dotenv";
import { createClerkClient } from "@clerk/backend";
config({ path: ".env.local", quiet: true });
async function main() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const encoded = key.replace(/^pk_(test|live)_/, "");
  const host = Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/\$$/, "");
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !process.env.CLERK_SECRET_KEY)
    throw new Error("Configure matching Clerk browser and server credentials.");
  const response = await fetch(`https://${host}/v1/environment`, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Clerk environment check failed (${response.status}).`);
  const environment = await response.json();
  const attributes = environment.user_settings?.attributes;
  console.log("Partner sign-in configuration:", {
    emailEnabled: attributes?.email_address?.enabled ?? "not exposed",
    passwordEnabled: attributes?.password?.enabled ?? "not exposed",
    passwordRequired: attributes?.password?.required ?? "not exposed",
  });
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  await client.invitations.getInvitationList({ limit: 1 });
  console.log(
    "Clerk invitation API credentials verified using a read-only request. No invitations or accounts were created.",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Clerk check failed.");
  process.exitCode = 1;
});
