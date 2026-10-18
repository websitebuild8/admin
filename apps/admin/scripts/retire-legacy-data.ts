import { config } from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { databaseUrl } from "../src/lib/database-url";
import { storageProjectOrigin, storageServerKey } from "../src/lib/storage-configuration";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const retired = [
  "Profile", "RoleApplication", "Restaurant", "Rider", "Order",
  "SavedAddress", "MenuItem", "MenuImage",
  "PolicyAcceptance", "CheckoutQuote", "PaymentAttempt", "RefundReview",
  "SupportCase", "AuditEvent", "ServiceSettings", "Notification", "DemoSession",
  "DeliveryRetiredCodParcel", "DeliveryCodReceipt", "DeliveryCodRemittance", "DeliveryCashHandover",
];
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const mode = process.argv[2];
  if (!["backup", "verify", "storage"].includes(mode))
    throw new Error("Use backup, verify <backup-directory>, or storage.");
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required.");
  const db = new pg.Client({
    connectionString: databaseUrl(process.env.DIRECT_URL),
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });
  try {
    await db.connect();
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables: string[] = (await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )).rows.map(r => r.tablename);
    const current = tables.filter(t => t.startsWith("Delivery") && !retired.includes(t));
    const fingerprints: Record<string, { count: number; sha256: string }> = {};
    for (const table of current) {
      const rows = (await db.query(`SELECT to_jsonb(t)::text AS row FROM public."${table}" t ORDER BY to_jsonb(t)::text`)).rows;
      fingerprints[table] = { count: rows.length, sha256: digest(JSON.stringify(rows.map(r => r.row))) };
    }
    if (tables.includes("MapUsageBucket")) {
      const rows = (await db.query(`SELECT to_jsonb(t)::text AS row FROM public."MapUsageBucket" t WHERE key LIKE 'delivery:%' ORDER BY to_jsonb(t)::text`)).rows;
      fingerprints.MapUsageBucket = { count: rows.length, sha256: digest(JSON.stringify(rows.map(r => r.row))) };
    }
    if (mode === "backup") {
      const directory = resolve(tmpdir(), `igo-legacy-backup-${Date.now()}`);
      await mkdir(directory, { mode: 0o700 });
      const data: Record<string, unknown[]> = {};
      for (const table of retired.filter(t => tables.includes(t)))
        data[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM public."${table}" t`)).rows.map(r => r.row);
      const payload = JSON.stringify({ createdAt: new Date().toISOString(), data, current: fingerprints }, null, 2);
      await writeFile(`${directory}/records.json`, payload, { mode: 0o600 });
      await writeFile(`${directory}/records.sha256`, digest(payload), { mode: 0o600 });
      if (digest(await readFile(`${directory}/records.json`, "utf8")) !== digest(payload))
        throw new Error("Backup verification failed.");
      console.log(`Verified private data snapshot: ${directory}`);
      console.log(`Saved ${Object.values(data).reduce((n, rows) => n + rows.length, 0)} retired rows; fingerprinted ${current.length} current tables. This is a data snapshot, not a full database recovery backup.`);
    } else {
      const remaining = retired.filter(t => tables.includes(t));
      if (remaining.length) throw new Error(`Retired tables remain: ${remaining.join(", ")}`);
      if (mode === "verify") {
        if (!process.argv[3]) throw new Error("Supply the private backup directory.");
        const directory = resolve(process.argv[3]);
        const payload = await readFile(`${directory}/records.json`, "utf8");
        if (digest(payload) !== (await readFile(`${directory}/records.sha256`, "utf8")).trim())
          throw new Error("Data snapshot checksum mismatch.");
        const before = JSON.parse(payload).current;
        const sorted = (value: Record<string, unknown>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
        if (sorted(before) !== sorted(fingerprints))
          throw new Error("Current records changed since the snapshot; inspect concurrent activity before claiming preservation.");
        const jobs = await db.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS enabled");
        if (jobs.rows[0].enabled && (await db.query("SELECT 1 FROM cron.job WHERE jobname='igo-google-content-prune'")).rowCount)
          throw new Error("The retired map cleanup is still scheduled.");
        console.log(`PASS all ${current.length} current-table contents match the snapshot exactly; all ${retired.length} retired tables are absent; old map job is absent.`);
      } else {
        const count = await db.query("SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id='igo-menu-images'");
        if (count.rows[0].n) throw new Error("Old image bucket is not empty. Back up its files before deleting it.");
        const origin = storageProjectOrigin(process.env), key = storageServerKey(process.env);
        const headers: Record<string, string> = { apikey: key };
        if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
        const response = await fetch(`${origin}/storage/v1/bucket/igo-menu-images`, {
          method: "DELETE", headers, redirect: "error", signal: AbortSignal.timeout(15000),
        });
        // Check the database instead of treating arbitrary API errors as success.
        if (!response.ok && response.status !== 404)
          throw new Error(`Empty old bucket removal failed (HTTP ${response.status}).`);
        await db.query("COMMIT");
        const bucket = await db.query("SELECT 1 FROM storage.buckets WHERE id='igo-menu-images'");
        if (bucket.rowCount) throw new Error("Old bucket still exists.");
        const kept = await db.query("SELECT id,public FROM storage.buckets WHERE id IN ('igo-delivery-receipts','igo-partner-logos') ORDER BY id");
        if (kept.rowCount !== 2 || kept.rows.some(r => r.public))
          throw new Error("Current private buckets need review.");
        console.log("PASS old empty food-image bucket removed; current private logo and receipt buckets preserved.");
      }
    }
    await db.query("COMMIT");
  } finally {
    await db.query("ROLLBACK").catch(() => {});
    await db.end();
  }
}
main().catch((error: Error & { code?: string }) => {
  // Database/network errors may contain credentials or query parameters.
  console.error(error.code ? `Retirement check failed (${error.code}).` : error.message);
  process.exitCode = 1;
});
