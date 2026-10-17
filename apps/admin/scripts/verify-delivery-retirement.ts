import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { databaseUrl } from "../src/lib/database-url";
async function main() {
  const schema = `igo_qa_${randomBytes(8).toString("hex")}`;
  const owner = new pg.Client({
    connectionString: databaseUrl(process.env.DIRECT_URL!),
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    application_name: `${schema}_owner`,
  });
  const apply = async (folder: string) =>
    owner.query(
      (await readFile(`prisma/migrations/${folder}/migration.sql`, "utf8"))
        .replaceAll("public.", `${schema}.`)
        .replaceAll("'public'", `'${schema}'`)
        .replaceAll(
          "819201016",
          String(100000000 + parseInt(schema.slice(-6), 16)),
        ),
    );
  let created = false;
  try {
    await owner.connect();
    await owner.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await owner.query(`SET search_path TO "${schema}"`);
    for (const folder of [
      "20261016000000_seller_delivery",
      "20261016010000_delivery_invariants",
      "20261016020000_delivery_ledger_reconciliation",
      "20261016030000_delivery_history_guards",
      "20261016040000_delivery_function_permissions",
      "20261016050000_partner_applications",
      "20261016060000_rider_push",
      "20261016070000_cod_payout_receipts",
      "20261016080000_partner_manual_invoices",
      "20261016090000_paid_invoice_history",
    ])
      await apply(folder);
    const [account, driver, partner, parcel, handover, remittance] = Array.from(
      { length: 6 },
      () => randomUUID(),
    );
    await owner.query("BEGIN");
    await owner.query(
      `INSERT INTO "DeliveryAccount" (id,"clerkUserId",role,status,name,phone) VALUES($1,'archive-partner','PARTNER','APPROVED','Historic partner','7771234'),($2,'archive-driver','DRIVER','APPROVED','Historic rider','7771234')`,
      [account, driver],
    );
    await owner.query(
      `INSERT INTO "DeliveryPartner"(id,"accountId","businessName","pageUrl","pickupAddress","pickupArea") VALUES($1,$2,'Historic business','https://example.test','Historic address','Hulhumalé')`,
      [partner, account],
    );
    await owner.query(
      `INSERT INTO "DeliveryParcel"(id,"publicId","partnerId","externalReference","recipientName","recipientPhone",destination,zone,fee,"codAmount") VALUES($1,'HISTORIC-PARCEL',$2,'HISTORY','Recipient','7771234','Historic destination','MALE',2900,10000)`,
      [parcel, partner],
    );
    await owner.query(
      `UPDATE "DeliveryParcel" SET "driverId"=$2,state='PICKED_UP',"pickedUpBy"='archive-driver',"pickedUpAt"=clock_timestamp() WHERE id=$1`,
      [parcel, driver],
    );
    await owner.query(
      `UPDATE "DeliveryParcel" SET state='DELIVERED',"deliveredBy"='archive-driver',"deliveredAt"=clock_timestamp(),"codCollectedAt"=clock_timestamp() WHERE id=$1`,
      [parcel],
    );
    await owner.query(
      `INSERT INTO "DeliveryCashHandover"(id,"driverId",amount,reference,"verifiedBy") VALUES($1,$2,10000,'HISTORIC-HANDOVER','archive-admin')`,
      [handover, driver],
    );
    await owner.query(
      `UPDATE "DeliveryParcel" SET "handoverId"=$2 WHERE id=$1`,
      [parcel, handover],
    );
    await owner.query(
      `INSERT INTO "DeliveryCodRemittance"(id,"partnerId",amount,reference,"verifiedBy") VALUES($1,$2,10000,'HISTORIC-REMITTANCE','archive-admin')`,
      [remittance, partner],
    );
    await owner.query(
      `UPDATE "DeliveryParcel" SET "remittanceId"=$2 WHERE id=$1`,
      [parcel, remittance],
    );
    await owner.query("COMMIT");
    const before = (
      await owner.query(
        `SELECT snapshot FROM "DeliveryCodReceipt" WHERE id=$1`,
        [remittance],
      )
    ).rows[0].snapshot;
    await apply("20261017000000_origin_pricing_retire_cod");
    const after = (
      await owner.query(
        `SELECT snapshot FROM "DeliveryCodReceipt" WHERE id=$1`,
        [remittance],
      )
    ).rows[0].snapshot;
    assert.deepEqual(after, before);
    const saved = (
      await owner.query(
        `SELECT fee,state,origin,"destinationLabel" FROM "DeliveryParcel" WHERE id=$1`,
        [parcel],
      )
    ).rows[0];
    assert.equal(saved.fee, 2900);
    assert.equal(saved.state, "DELIVERED");
    assert.equal(saved.origin, null);
    assert.equal(
      (
        await owner.query(
          `SELECT "operatingLocation" FROM "DeliveryPartner" WHERE id=$1`,
          [partner],
        )
      ).rows[0].operatingLocation,
      null,
    );
    const snapshot = (
      await owner.query(
        `SELECT snapshot FROM "DeliveryRetiredCodParcel" WHERE "parcelId"=$1`,
        [parcel],
      )
    ).rows[0].snapshot;
    assert.equal(snapshot.codAmount, 10000);
    assert.equal(snapshot.handoverId, handover);
    assert.equal(snapshot.remittanceId, remittance);
    for (const table of [
      "DeliveryRetiredCodParcel",
      "DeliveryCashHandover",
      "DeliveryCodRemittance",
      "DeliveryCodReceipt",
    ]) {
      await assert.rejects(owner.query(`DELETE FROM "${table}"`));
      const access = (
        await owner.query(
          `SELECT relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,
          [schema, table],
        )
      ).rows[0];
      assert.equal(access.relrowsecurity, true);
      assert.equal(access.anon, false);
      assert.equal(access.authenticated, false);
    }
    await assert.rejects(
      owner.query(
        `INSERT INTO "DeliveryCashHandover"(id,"driverId",amount,reference,"verifiedBy") VALUES($1,$2,1,'RETIRED','admin')`,
        [randomUUID(), driver],
      ),
    );
    const fields = (
      await owner.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='DeliveryParcel'`,
        [schema],
      )
    ).rows.map((r) => r.column_name);
    for (const field of [
      "codAmount",
      "codCollectedAt",
      "handoverId",
      "remittanceId",
    ])
      assert(!fields.includes(field));
    console.log(
      "PASS historical receipt, cash links, delivery status and frozen fee survive retirement; generic Hulhumalé requires phase review.",
    );
    console.log(
      "PASS archived financial tables are private and read-only; operational cash columns are removed.",
    );
  } finally {
    if (created) {
      await owner.query("ROLLBACK");
      await owner.query(`DROP SCHEMA "${schema}" CASCADE`);
      console.log("Disposable QA schema removed.");
    }
    await owner.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
