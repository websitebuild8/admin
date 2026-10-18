import { config } from "dotenv";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { databaseUrl } from "../src/lib/database-url";
import {
  actorForIdentity,
  superAdminIds,
} from "../src/lib/delivery/admin-policy";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { deliveryIdentity } from "../src/lib/delivery/identity-data";
import { portalInitialData } from "../src/lib/delivery/initial-data";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const userId = superAdminIds()[0];
  if (!userId)
    throw new Error("Configure the existing super admin before measuring.");
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(process.env.DATABASE_URL),
      max: 5,
    }),
    log: [{ emit: "event", level: "query" }],
  });
  (globalThis as unknown as { igoPrisma: PrismaClient }).igoPrisma = db;
  let queries = 0,
    queryMs = 0;
  db.$on("query", (event) => {
    queries++;
    queryMs += event.duration;
  });
  // Only SELECT queries are used. No Clerk requests, writes or identity values
  // are printed. This measures server database work, not a user's browser speed.
  async function identity() {
    return actorForIdentity(await deliveryIdentity(userId), "ADMIN");
  }
  async function request(resource: string) {
    return deliveryQuery(await identity(), resource, new URLSearchParams());
  }
  async function measure(label: string, work: () => Promise<unknown>) {
    queries = 0;
    queryMs = 0;
    const start = performance.now();
    await work();
    console.log(
      JSON.stringify({
        label,
        elapsedMs: Math.round(performance.now() - start),
        queries,
        cumulativeQueryMs: Math.round(queryMs),
      }),
    );
  }
  try {
    await measure("identity-first", identity);
    await measure("identity-warm", identity);
    await measure("overview", () => request("overview"));
    await measure("notifications", () => request("notifications"));
    await measure("choices", () => request("choices"));
    const initial = async () =>
      portalInitialData(await identity(), "overview", new URLSearchParams());
    await measure("admin-initial-data", initial);
    await measure("admin-initial-data-warm", initial);
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: Error & { code?: string }) => {
  console.error(
    error.code ? `Measurement failed (${error.code}).` : error.name,
  );
  process.exitCode = 1;
});
