import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import pg from "pg";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { databaseUrl } from "../src/lib/database-url";
async function main() {
  const mode = process.argv[2] ?? "verify";
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required.");
  const db = new pg.Client({
    connectionString: databaseUrl(process.env.DIRECT_URL),
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    const result = await db.query(
      `SELECT count(*)::int AS tables,bool_and(rowsecurity) AS all_rls FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Delivery%'`,
    );
    console.log("Delivery database security:", result.rows[0]);
    const privileges = await db.query(
      `SELECT count(*)::int AS exposed_tables FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Delivery%' AND (has_table_privilege('anon',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',format('%I.%I',schemaname,tablename),'SELECT,INSERT,UPDATE,DELETE'))`,
    );
    if (privileges.rows[0].exposed_tables !== 0)
      throw new Error("Delivery tables are exposed to a public API role.");
    const functions = await db.query(
      "SELECT has_function_privilege('anon','public.igo_invoice_due(timestamptz)','EXECUTE') OR has_function_privilege('authenticated','public.igo_invoice_due(timestamptz)','EXECUTE') AS exposed",
    );
    if (functions.rows[0].exposed)
      throw new Error("Invoice scheduler is executable by a public API role.");
    console.log(
      "Verified public API roles cannot access delivery tables or execute billing.",
    );
    const cron = await db.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS enabled",
    );
    if (mode === "cron") {
      if (!cron.rows[0].enabled)
        throw new Error(
          "Enable Supabase Cron (pg_cron) in the dashboard, then run setup again.",
        );
      await db.query(
        "SELECT cron.schedule('igo-delivery-invoices','*/5 * * * *','SELECT public.igo_invoice_due();')",
      );
      await db.query(
        "SELECT cron.schedule('igo-delivery-request-prune','17 * * * *','SELECT public.igo_prune_delivery_requests();')",
      );
      console.log(
        "Installed named invoice and expired-request cleanup jobs; other jobs preserved.",
      );
    }
    console.log(
      "Invoice function check:",
      (await db.query("SELECT public.igo_invoice_due() AS result")).rows[0]
        .result,
    );
    if (cron.rows[0].enabled) {
      const job = await db.query(
        "SELECT jobid,schedule,active FROM cron.job WHERE jobname='igo-delivery-invoices'",
      );
      console.log("Invoice schedule:", job.rows);
      if (job.rows[0])
        console.log(
          "Latest schedule runs:",
          (
            await db.query(
              "SELECT status,start_time,end_time FROM cron.job_run_details WHERE jobid=$1 ORDER BY start_time DESC LIMIT 3",
              [job.rows[0].jobid],
            )
          ).rows,
        );
    }
    if (mode === "storage") {
      const origin = new URL(process.env.SUPABASE_URL ?? "");
      if (
        origin.protocol !== "https:" ||
        !origin.hostname.endsWith(".supabase.co")
      )
        throw new Error("Configure the Supabase project URL.");
      const key =
        process.env.SUPABASE_SECRET_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key) throw new Error("Configure the server-only Supabase secret.");
      const headers: Record<string, string> = { apikey: key };
      if (!key.startsWith("sb_secret_"))
        headers.Authorization = `Bearer ${key}`;
      const base = `${origin.origin}/storage/v1`,
        bucket = "igo-delivery-receipts";
      let response = await fetch(`${base}/bucket/${bucket}`, { headers });
      const lookup = response.ok
        ? null
        : await response.json().catch(() => null);
      if (
        response.status === 404 ||
        (response.status === 400 &&
          (lookup?.statusCode === "404" ||
            lookup?.error === "Bucket not found" ||
            lookup?.message === "Bucket not found"))
      ) {
        response = await fetch(`${base}/bucket`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: bucket,
            name: bucket,
            public: false,
            file_size_limit: 5242880,
            allowed_mime_types: ["image/webp"],
          }),
        });
        if (!response.ok)
          throw new Error(
            `Private bucket creation failed (${response.status}).`,
          );
      } else if (!response.ok)
        throw new Error(`Private bucket lookup failed (${response.status}).`);
      const info = await (
        await fetch(`${base}/bucket/${bucket}`, { headers })
      ).json();
      if (info.public !== false)
        throw new Error("Receipt bucket must be private.");
      const path = `${randomUUID()}/${randomUUID()}.webp`,
        bytes = await sharp({
          create: {
            width: 120,
            height: 120,
            channels: 3,
            background: "#ffea00",
          },
        })
          .webp()
          .toBuffer();
      let uploaded = false;
      try {
        const upload = await fetch(`${base}/object/${bucket}/${path}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "image/webp" },
          body: new Uint8Array(bytes),
        });
        if (!upload.ok)
          throw new Error(`Storage probe upload failed (${upload.status}).`);
        uploaded = true;
        const anonymous = await fetch(
          `${base}/object/public/${bucket}/${path}`,
        );
        if (anonymous.ok)
          throw new Error("Private receipt became publicly readable.");
        const sign = await fetch(`${base}/object/sign/${bucket}/${path}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: 60 }),
        });
        const signed = await sign.json();
        if (!sign.ok || typeof signed.signedURL !== "string")
          throw new Error("Signed receipt URL failed.");
        const download = await fetch(`${base}${signed.signedURL}`);
        if (!download.ok || !(await download.arrayBuffer()).byteLength)
          throw new Error("Signed receipt download failed.");
        console.log(
          "Verified private receipt upload, anonymous denial and signed read.",
        );
      } finally {
        if (uploaded) {
          const deleted = await fetch(`${base}/object/${bucket}`, {
            method: "DELETE",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ prefixes: [path] }),
          });
          if (!deleted.ok) throw new Error("Storage probe cleanup failed.");
          console.log("Storage probe object removed.");
        }
      }
    }
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
