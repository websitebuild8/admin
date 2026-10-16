import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { readFile, writeFile, chmod } from "node:fs/promises";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import pg from "pg";
import { databaseUrl } from "../src/lib/database-url";
import { pushSchedulerHeaders } from "../src/lib/delivery/push-scheduler";

async function main() {
  const mode = process.argv[2] ?? "status";
  if (mode === "keys") {
    const updates: Record<string, string> = {};
    if (
      !!process.env.WEB_PUSH_PUBLIC_KEY !== !!process.env.WEB_PUSH_PRIVATE_KEY
    )
      throw new Error(
        "Both VAPID keys must be set together. Existing values were preserved.",
      );
    if (!process.env.WEB_PUSH_PUBLIC_KEY) {
      const keys = webpush.generateVAPIDKeys();
      updates.WEB_PUSH_PUBLIC_KEY = keys.publicKey;
      updates.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
    } else {
      const pair = createECDH("prime256v1");
      pair.setPrivateKey(
        Buffer.from(process.env.WEB_PUSH_PRIVATE_KEY!, "base64url"),
      );
      if (
        pair.getPublicKey().toString("base64url") !==
        process.env.WEB_PUSH_PUBLIC_KEY
      )
        throw new Error(
          "The existing VAPID keys do not match. They were not replaced.",
        );
    }
    if (!process.env.WEB_PUSH_SUBJECT)
      updates.WEB_PUSH_SUBJECT = "https://igodelivery.netlify.app";
    if (!process.env.PUSH_CRON_SECRET)
      updates.PUSH_CRON_SECRET = randomBytes(32).toString("hex");
    if (Object.keys(updates).length) {
      const file = await readFile(".env.local", "utf8").catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") return "";
          throw e;
        },
      );
      await writeFile(
        ".env.local",
        `${file.trimEnd()}\n\n# Rider web push — server configuration; never commit this file.\n${Object.entries(
          updates,
        )
          .map(([name, value]) => `${name}=${value}`)
          .join("\n")}\n`,
        { mode: 0o600 },
      );
      await chmod(".env.local", 0o600);
    }
    console.log(
      "Rider push keys are ready in the ignored .env.local file. Existing keys were preserved. Values were not printed.",
    );
    return;
  }
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required.");
  const db = new pg.Client({
    connectionString: databaseUrl(process.env.DIRECT_URL),
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    if (mode === "enable-network") {
      await db.query("CREATE EXTENSION IF NOT EXISTS pg_net");
      console.log(
        "Supabase pg_net is enabled. No HTTP request or scheduled job was created.",
      );
      return;
    }
    if (mode === "cron" || mode === "verify-cron") {
      const dryRun = mode === "verify-cron";
      const secret = process.env.PUSH_CRON_SECRET;
      if (!secret || secret.length < 32)
        throw new Error(
          "Run rider:keys and configure the same PUSH_CRON_SECRET on your hosting first.",
        );
      const url = new URL(
        process.env.DELIVERY_PUBLIC_URL ??
          (dryRun ? "https://example.com" : ""),
      );
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "DELIVERY_PUBLIC_URL must be the production HTTPS origin.",
        );
      if (!dryRun) {
        const check = await fetch(`${url.origin}/api/push/dispatch`, {
          method: "POST",
          headers: pushSchedulerHeaders(secret),
          signal: AbortSignal.timeout(60000),
          redirect: "error",
        });
        const result = await check.json().catch(() => null);
        if (!check.ok || result?.configured !== true)
          throw new Error(
            `Deployed push endpoint is not ready (${check.status}). Deploy the rider code and all push variables before installing the schedule.`,
          );
      }
      const extensions = await db.query(
        "SELECT e.extname,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN ('pg_cron','pg_net','supabase_vault','pgcrypto')",
      );
      const missing = [
        "pg_cron",
        "pg_net",
        "supabase_vault",
        "pgcrypto",
      ].filter((name) => !extensions.rows.some((r) => r.extname === name));
      if (missing.length)
        throw new Error(
          `Enable these Supabase extensions, then rerun setup: ${missing.join(", ")}.`,
        );
      const cryptoSchema = extensions.rows.find((r) => r.extname === "pgcrypto")
        .nspname as string;
      if (!/^[a-z_][a-z0-9_]*$/.test(cryptoSchema))
        throw new Error("Unexpected pgcrypto schema.");
      await db.query("BEGIN");
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('igo-rider-push-setup',0))",
      );
      for (const [name, value] of [
        ["igo_rider_push_origin", url.origin],
        ["igo_rider_push_secret", secret],
      ]) {
        const existing = await db.query(
          "SELECT id FROM vault.secrets WHERE name=$1",
          [name],
        );
        if (existing.rowCount)
          await db.query("SELECT vault.update_secret($1::uuid,$2,$3)", [
            existing.rows[0].id,
            value,
            name,
          ]);
        else await db.query("SELECT vault.create_secret($1,$2)", [value, name]);
      }
      // Only a short-lived signature reaches pg_net's request queue, never the signing secret.
      const command = `SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='igo_rider_push_origin') || '/api/push/dispatch',
        headers := jsonb_build_object('Content-Type','application/json','x-igo-time',tick.stamp,'x-igo-signature',encode("${cryptoSchema}".hmac('igo-rider-push:' || tick.stamp,(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='igo_rider_push_secret'),'sha256'),'hex')),
        body := '{}'::jsonb, timeout_milliseconds := 60000
      ) FROM (SELECT floor(extract(epoch FROM now()))::bigint::text AS stamp) tick`;
      // Plan the statement without performing its HTTP side effect.
      await db.query(`EXPLAIN ${command}`);
      const headers = pushSchedulerHeaders(secret);
      const signature = await db.query(
        `SELECT encode("${cryptoSchema}".hmac($1::text,$2::text,'sha256'),'hex') AS value`,
        [`igo-rider-push:${headers["x-igo-time"]}`, secret],
      );
      if (signature.rows[0].value !== headers["x-igo-signature"])
        throw new Error(
          "Database scheduler signature did not match server verification.",
        );
      await db.query("SELECT cron.schedule('igo-rider-push','* * * * *',$1)", [
        command,
      ]);
      await db.query(dryRun ? "ROLLBACK" : "COMMIT");
      console.log(
        dryRun
          ? "Verified scheduler SQL, Vault and matching HMAC signatures. Test job and secrets were rolled back; no HTTP request was sent."
          : "Installed the named rider push retry schedule. Other jobs were preserved.",
      );
    } else if (mode !== "status")
      throw new Error(
        "Choose keys, cron, verify-cron, enable-network or status.",
      );
    const counts = await db.query(
      'SELECT "state",count(*)::int AS count FROM public."DeliveryPushMessage" GROUP BY "state" ORDER BY "state"',
    );
    console.log("Push queue totals:", counts.rows);
    const cron = await db.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS enabled",
    );
    if (cron.rows[0].enabled) {
      const schedule = await db.query(
        "SELECT jobid,schedule,active FROM cron.job WHERE jobname='igo-rider-push'",
      );
      console.log("Rider retry schedule:", schedule.rows);
      if (schedule.rowCount)
        console.log(
          "Latest scheduler runs:",
          (
            await db.query(
              "SELECT status,start_time,end_time FROM cron.job_run_details WHERE jobid=$1 ORDER BY start_time DESC LIMIT 3",
              [schedule.rows[0].jobid],
            )
          ).rows,
        );
    }
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Rider push setup failed.",
  );
  process.exitCode = 1;
});
