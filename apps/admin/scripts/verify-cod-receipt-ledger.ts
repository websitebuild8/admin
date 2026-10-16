import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import pg from "pg";
import { databaseUrl } from "../src/lib/database-url";
async function main() {
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required.");
  const db = new pg.Client({
    connectionString: databaseUrl(process.env.DIRECT_URL),
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    await db.query("BEGIN READ ONLY");
    const ledger = await db.query(`SELECT count(*)::int AS payouts,
      count(*) FILTER (WHERE c.id IS NULL)::int AS missing,
      count(*) FILTER (WHERE c.id IS NOT NULL AND (
        (c.snapshot->>'amount')::bigint<>r.amount OR c.snapshot->>'reference'<>r.reference OR
        c.snapshot->'partner'->>'id'<>r."partnerId"::text OR (c.snapshot->>'recordedAt')::timestamptz<>r."createdAt" OR
        (SELECT coalesce(sum((line->>'amount')::bigint),0) FROM jsonb_array_elements(c.snapshot->'lines') line)<>r.amount OR
        jsonb_array_length(c.snapshot->'lines')<>(SELECT count(*) FROM public."DeliveryParcel" p WHERE p."remittanceId"=r.id)
      ))::int AS mismatched
      FROM public."DeliveryCodRemittance" r LEFT JOIN public."DeliveryCodReceipt" c ON c.id=r.id`);
    const result = ledger.rows[0];
    if (result.missing || result.mismatched)
      throw new Error(
        "Payout receipt reconciliation failed. No records were changed.",
      );
    const security = await db.query(`SELECT c.relrowsecurity AS rls,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS exposed
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='DeliveryCodReceipt'`);
    if (!security.rows[0]?.rls || security.rows[0].exposed)
      throw new Error("Payout receipt table access is not private.");
    const functions =
      await db.query(`SELECT bool_or(has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')) AS exposed
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('igo_cod_receipt_snapshot','igo_cod_receipt_issue')`);
    if (functions.rows[0].exposed !== false)
      throw new Error("Receipt helper functions must be private.");
    await db.query("COMMIT");
    console.log(
      `Verified ${result.payouts} recorded payouts: each has a reconciled receipt; receipt table and helper functions are private. Read-only check.`,
    );
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Receipt ledger verification failed.",
  );
  process.exitCode = 1;
});
