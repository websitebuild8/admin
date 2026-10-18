import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { databaseUrl } from "../src/lib/database-url";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required.");
  const schema = `igo_qa_${randomBytes(8).toString("hex")}`;
  const db = new pg.Client({ connectionString: databaseUrl(process.env.DIRECT_URL), connectionTimeoutMillis: 10000, query_timeout: 30000 });
  let created = false;
  const final = "20261019000000_remove_legacy_platform";
  const apply = async (folder: string) => {
    let sql = (await readFile(`prisma/migrations/${folder}/migration.sql`, "utf8"))
      .replaceAll("public.", `${schema}.`)
      .replaceAll("'public'", `'${schema}'`);
    // The historical Places migration installs a global pg_cron job. Exercise
    // its tables/functions in isolation, never its production scheduler setup.
    if (folder === "20261005000000_google_places")
      sql = sql.slice(0, sql.indexOf("-- Supabase Cron"));
    if (folder === "20261007020000_menu_images")
      sql = sql.slice(0, sql.indexOf("-- Food photography")) + "\nCOMMIT;";
    try {
      await db.query(sql);
    } catch (error) {
      const detail = error as Error & { code?: string };
      throw new Error(`Migration ${folder}: ${detail.code ?? "error"} ${detail.message}`);
    }
  };
  try {
    await db.connect();
    const cronExists = (await db.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS enabled")).rows[0].enabled;
    const jobsBefore = cronExists ? (await db.query("SELECT jobid,jobname,schedule,active,command FROM cron.job ORDER BY jobid")).rows : [];
    await db.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await db.query(`SET search_path TO "${schema}"`);
    const folders = (await readdir("prisma/migrations")).filter(f => /^\d{14}_/.test(f)).sort();
    for (const folder of folders.filter(f => f < final)) await apply(folder);
    await db.query(`INSERT INTO "Profile"(id,"clerkUserId",name) VALUES('retired-profile','qa-old-customer','Retired customer')`);
    await db.query(`INSERT INTO "MapUsageBucket"(key,count,"expiresAt") VALUES('delivery:qa:submit:1',3,now()+interval '1 hour'),('google:retired:1',9,now()+interval '1 hour')`);
    await db.query(`INSERT INTO "Restaurant"(id,name,initials,cuisine,area,contact) VALUES('retired-restaurant','Retired kitchen','RK','Food','Malé','7771234')`);
    await db.query(`INSERT INTO "Order"(id,"customerId",customer,"restaurantId",items,amount,area,address,"paymentRef") VALUES('retired-order','retired-profile','Retired customer','retired-restaurant','Old food order',2500,'Malé','Retired address','retired-payment')`);
    const [account, rider, partner, parcel] = Array.from({ length: 4 }, () => randomUUID());
    await db.query(`INSERT INTO "DeliveryAccount"(id,"clerkUserId",role,status,name,phone) VALUES($1,'qa-current-partner','PARTNER','APPROVED','Current business','7771234'),($2,'qa-current-rider','DRIVER','APPROVED','Current rider','7771234')`, [account, rider]);
    await db.query(`INSERT INTO "DeliveryPartner"(id,"accountId","businessName","pageUrl","pickupAddress","pickupArea","operatingLocation","nextInvoiceAt") VALUES($1,$2,'Current business','','Current pickup','Malé','MALE',now()-interval '1 day')`, [partner, account]);
    await db.query(`INSERT INTO "DeliveryParcel"(id,"publicId","partnerId","externalReference","recipientName","recipientPhone",destination,zone,origin,"destinationLabel",fee,"registeredAt") VALUES($1,'CURRENT-PARCEL',$2,'KEEP','Recipient','7771234','Current destination','MALE','MALE','Malé',2500,now()-interval '2 days')`, [parcel, partner]);
    await db.query(`UPDATE "DeliveryParcel" SET "driverId"=$2,state='PICKED_UP',"pickedUpBy"='qa-current-rider',"pickedUpAt"=now()-interval '1 day 2 hours' WHERE id=$1`, [parcel, rider]);
    await db.query(`UPDATE "DeliveryParcel" SET state='DELIVERED',"deliveredBy"='qa-current-rider',"deliveredAt"=now()-interval '1 day 1 hour' WHERE id=$1`, [parcel]);
    await db.query(`SELECT ${schema}.igo_invoice_due(now())`);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "DeliveryInvoice"')).rows[0].n, 1);
    const names = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename LIKE 'Delivery%' AND tablename NOT IN ('DeliveryRetiredCodParcel','DeliveryCodReceipt','DeliveryCodRemittance','DeliveryCashHandover') ORDER BY tablename", [schema])).rows.map(r => r.tablename);
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const t of names) result[t] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${schema}"."${t}" t ORDER BY to_jsonb(t)::text`)).rows;
      return result;
    };
    const before = await snapshot();
    await apply(final);
    assert.deepEqual(await snapshot(), before);
    const tablesAfter = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename", [schema])).rows.map(r => r.tablename);
    assert.deepEqual(tablesAfter, [...names, "MapUsageBucket"].sort());
    assert.deepEqual((await db.query('SELECT key,count FROM "MapUsageBucket"')).rows, [{ key: "delivery:qa:submit:1", count: 3 }]);
    for (const name of ["igo_prune_google_content", "igo_expired_google_address", "igo_retired_money_guard"])
      assert.equal((await db.query("SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2", [schema, name])).rowCount, 0);
    for (const table of tablesAfter) {
      const permissions = (await db.query("SELECT c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2", [schema, table])).rows[0];
      assert.equal(permissions.relrowsecurity, true);
      assert.equal(permissions.anon, false);
      assert.equal(permissions.authenticated, false);
    }
    // Re-running the SQL is safe even when every old table is already absent.
    await apply(final);
    assert.deepEqual(await snapshot(), before);
    if (cronExists) assert.deepEqual((await db.query("SELECT jobid,jobname,schedule,active,command FROM cron.job ORDER BY jobid")).rows, jobsBefore);
    console.log(`PASS complete migration chain removes all retired tables/functions, preserves all ${names.length} active-table contents including a delivered/invoiced package, maintains RLS and tenant-role denial, supports replay, and leaves real scheduler jobs unchanged.`);
  } finally {
    if (created) {
      await db.query("ROLLBACK");
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      console.log("Disposable retirement QA schema removed.");
    }
    await db.end();
  }
}
main().catch((error: Error & { code?: string }) => {
  console.error(`Retirement migration verification failed${error.code ? ` (${error.code})` : ""}: ${error.message}`);
  process.exitCode = 1;
});
