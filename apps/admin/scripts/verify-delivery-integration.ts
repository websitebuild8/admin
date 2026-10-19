import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { databaseUrl } from "../src/lib/database-url";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { packageImport } from "../src/lib/delivery/import-service";
import { importColumns } from "../src/lib/delivery/import";
import { verifyPartnerApplications } from "./verify-partner-applications";
import { verifyRiderWorkflows } from "./verify-rider-workflows";
import { verifyPartnerInvoices } from "./verify-partner-invoices";
import {
  verifyAdminAccess,
  verifyOptionalPartnerAssets,
} from "./verify-admin-access";
import { verifyOriginPricing } from "./verify-origin-pricing";
import { verifyPaidInvoices } from "./verify-paid-invoices";
import { verifyEarnings } from "./verify-earnings";
import { verifyDeletion } from "./verify-deletion";
import { verifyAdminWorkspaces } from "./verify-admin-workspaces";
import { verifyDashboardNavigation } from "./verify-dashboard-navigation";
import { verifyReportingPeriods } from "./verify-reporting-periods";
import { verifyPaidInvoiceMigration } from "./verify-paid-invoice-migration";
import { limitRequests } from "../src/lib/delivery/http";
import { verifyPerformance } from "./verify-performance";
import { verifyNotificationClearing } from "./verify-notification-clearing";
import { verifyRiderCollect } from "./verify-rider-collect";
import { verifyWorkspaceNotifications } from "./verify-workspace-notifications";
import { verifyFinance } from "./verify-finance";
import {
  nextCutoff,
  type Actor,
  type DeliveryCommandInput,
} from "../src/lib/delivery/domain";

async function main() {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Run this isolated check with NODE_ENV=test.");
  if (!process.env.DIRECT_URL)
    throw new Error("DIRECT_URL is required for isolated schema verification.");
  const originalAdminIds = process.env.ADMIN_CLERK_USER_IDS;
  const originalSuperIds = process.env.SUPER_ADMIN_CLERK_USER_IDS;
  const schema = `igo_qa_${randomBytes(8).toString("hex")}`;
  process.env.IGO_DELIVERY_TEST_SCHEMA = schema;
  const connectionString = databaseUrl(process.env.DIRECT_URL),
    owner = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
      application_name: `${schema}_owner`,
    });
  let db: PrismaClient | undefined,
    created = false,
    checks = 0;
  const ok = (label: string) => {
    checks++;
    console.log(`PASS ${label}`);
  };
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
      "20261017000000_origin_pricing_retire_cod",
      "20261017010000_admin_access_optional_partner_assets",
      "20261018000000_super_admin_deletion",
      "20261018010000_admin_multiple_operational_roles",
      "20261019000000_remove_legacy_platform",
      "20261019010000_clear_notifications",
      "20261020000000_workspace_notifications",
    ]) {
      if (
        [
          "20261016090000_paid_invoice_history",
          "20261019010000_clear_notifications",
        ].includes(folder) &&
        process.argv.includes("--paid-migration")
      )
        continue;
      let sql = await readFile(
        `prisma/migrations/${folder}/migration.sql`,
        "utf8",
      );
      sql = sql
        .replaceAll("public.", `${schema}.`)
        .replaceAll("'public'", `'${schema}'`)
        .replaceAll(
          "819201016",
          String(100000000 + parseInt(schema.slice(-6), 16)),
        );
      await owner.query(sql);
    }
    db = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString,
          max: 5,
          connectionTimeoutMillis: 10000,
          query_timeout: 30000,
          statement_timeout: 30000,
          application_name: schema,
        },
        { schema },
      ),
    });
    (globalThis as unknown as { igoPrisma: PrismaClient }).igoPrisma = db;
    const cutoff = nextCutoff(new Date(), 1080);
    const account = async (name: string, role: "PARTNER" | "DRIVER") =>
      db!.deliveryAccount.create({
        data: {
          clerkUserId: `qa_${name}_${schema}`,
          role,
          status: "APPROVED",
          name,
          phone: "7771234",
          ...(role === "PARTNER"
            ? {
                partner: {
                  create: {
                    businessName: name,
                    pageUrl: "https://example.com/qa",
                    pickupAddress: "Disposable QA pickup",
                    pickupArea: "Malé",
                    operatingLocation: "MALE",
                    nextInvoiceAt: cutoff,
                  },
                },
              }
            : {}),
        },
        include: { partner: true },
      });
    const [a, b, d, d2] = await Promise.all([
      account("partner_a", "PARTNER"),
      account("partner_b", "PARTNER"),
      account("driver_a", "DRIVER"),
      account("driver_b", "DRIVER"),
    ]);
    const actor = (v: typeof a): Actor => ({
      userId: v.clerkUserId,
      id: v.id,
      role: v.role,
      partnerId: v.partner?.id ?? null,
      status: "APPROVED",
      name: v.name,
    });
    const partner = actor(a),
      other = actor(b),
      driver = actor(d),
      otherDriver = actor(d2),
      admin: Actor = {
        userId: `qa_admin_${schema}`,
        id: null,
        partnerId: null,
        role: "ADMIN",
        status: "APPROVED",
        name: "QA Admin",
      };
    process.env.ADMIN_CLERK_USER_IDS = admin.userId;
    delete process.env.SUPER_ADMIN_CLERK_USER_IDS;
    const cmd = (
      who: Actor,
      command: DeliveryCommandInput,
      key = randomUUID(),
    ) => deliveryCommand(who, key, command);
    const make = (
      ref: string,
      zone: "MALE" | "HULHUMALE_1" | "HULHUMALE_2" = "MALE",
    ) => ({
      type: "register" as const,
      parcel: {
        externalReference: ref,
        recipientName: "QA recipient",
        recipientPhone: "7771234",
        destination: "Disposable QA destination",
        zone,
        description: "Not a real delivery",
      },
    });
    if (process.argv.includes("--notification-targets")) {
      await verifyWorkspaceNotifications(db, admin, partner, other, driver, ok);
      console.log(`Verified ${checks} notification target and scheduled-invoice checks in a disposable schema.`);
      return;
    }
    if (process.argv.includes("--workspace-notifications")) {
      await verifyWorkspaceNotifications(db, admin, partner, other, driver, ok);
      await verifyNotificationClearing(db, admin, partner, driver, ok);
      await verifyRiderWorkflows(db, admin, other, ok);
      await verifyFinance(db, admin, driver, ok);
      console.log(`Verified ${checks} notification, push and partner finance checks in a disposable schema.`);
      return;
    }
    if (process.argv.includes("--finance")) {
      await verifyFinance(db, admin, driver, ok);
      await verifyPaidInvoices(db, admin, other, driver, ok);
      console.log(
        `Verified ${checks} finance and paid-invoice checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--rider-collect")) {
      await verifyPerformance(db, admin, partner, other, driver, ok);
      await verifyRiderCollect(db, admin, ok);
      await verifyRiderWorkflows(db, admin, partner, ok);
      await verifyDashboardNavigation(db, admin, ok);
      console.log(
        `Verified ${checks} Collect and related workflow checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--performance")) {
      await verifyPerformance(db, admin, partner, other, driver, ok);
      console.log(
        `Verified ${checks} performance correctness checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--notifications")) {
      await verifyNotificationClearing(db, admin, partner, driver, ok);
      await verifyPartnerInvoices(db, admin, other, driver, ok);
      await verifyPaidInvoices(db, admin, other, driver, ok);
      console.log(
        `Verified ${checks} notification and invoice-history checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--request-limits")) {
      const attempts = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          limitRequests(partner, "retirement-qa", 2),
        ),
      );
      assert.equal(attempts.filter((v) => v.status === "fulfilled").length, 2);
      assert.equal(
        attempts.filter(
          (v) => v.status === "rejected" && v.reason.status === 429,
        ).length,
        4,
      );
      assert.equal(
        (await db.deliveryRequestBucket.findFirstOrThrow()).count,
        6,
      );
      ok(
        "delivery request limits remain atomic through the mapped shared table",
      );
      await limitRequests(other, "retirement-qa", 2);
      assert.equal(await db.deliveryRequestBucket.count(), 2);
      ok("rate counters isolate partner identities after legacy retirement");
      return;
    }
    if (process.argv.includes("--dashboard-and-periods")) {
      await verifyDashboardNavigation(db, admin, ok);
      await verifyReportingPeriods(db, admin, ok);
      console.log(
        `Verified ${checks} dashboard and reporting-period checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--reporting-periods")) {
      await verifyReportingPeriods(db, admin, ok);
      console.log(
        `Verified ${checks} reporting-period checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--dashboard-navigation")) {
      await verifyDashboardNavigation(db, admin, ok);
      console.log(
        `Verified ${checks} dashboard navigation checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--admin-workspaces")) {
      await verifyAdminWorkspaces(db, admin, partner, driver, ok);
      console.log(
        `Verified ${checks} automatic admin workspace checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--deletion")) {
      await verifyDeletion(db, admin, partner, ok);
      console.log(`Verified ${checks} deletion checks in a disposable schema.`);
      return;
    }
    if (process.argv.includes("--earnings")) {
      await verifyEarnings(db, admin, partner, driver, ok);
      console.log(`Verified ${checks} earnings checks in a disposable schema.`);
      return;
    }
    if (process.argv.includes("--admin-access")) {
      await verifyAdminAccess(db, admin, partner, driver, ok);
      await verifyOptionalPartnerAssets(db, admin, ok);
      console.log(
        `Verified ${checks} administrator and optional-application checks in a disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--paid-migration")) {
      await verifyPaidInvoiceMigration(
        db,
        admin,
        driver,
        async () => {
          const sql = await readFile(
            "prisma/migrations/20261016090000_paid_invoice_history/migration.sql",
            "utf8",
          );
          await owner.query(
            sql
              .replaceAll("public.", `${schema}.`)
              .replaceAll("'public'", `'${schema}'`),
          );
        },
        ok,
      );
      console.log(
        `Verified ${checks} historical paid invoice migration checks in an isolated disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--paid-invoices")) {
      await verifyPaidInvoices(db, admin, other, driver, ok);
      console.log(
        `Verified ${checks} paid invoice checks in an isolated disposable schema.`,
      );
      return;
    }
    if (process.argv.includes("--partner-invoices")) {
      await verifyPartnerInvoices(db, admin, other, driver, ok);
      console.log(
        `Verified ${checks} partner invoice checks in an isolated disposable schema.`,
      );
      return;
    }
    const key = randomUUID(),
      first = await cmd(partner, make("QA-ONE", "MALE"), key);
    assert.deepEqual(await cmd(partner, make("QA-ONE", "MALE"), key), first);
    ok("registration replay is idempotent");
    await assert.rejects(cmd(partner, make("DIFFERENT"), key));
    ok("same key rejects changed request");
    await assert.rejects(cmd(partner, make("QA-ONE")));
    ok("unique partner parcel reference prevents duplicate registration");
    await cmd(partner, make("QA-TWO", "HULHUMALE_1"));
    await cmd(partner, make("QA-UNPICKED", "HULHUMALE_2"));
    const parcels = await db.deliveryParcel.findMany({
      where: { partnerId: a.partner!.id },
      orderBy: { externalReference: "asc" },
    });
    const p1 = parcels.find((p) => p.externalReference === "QA-ONE")!,
      p2 = parcels.find((p) => p.externalReference === "QA-TWO")!,
      p3 = parcels.find((p) => p.externalReference === "QA-UNPICKED")!;
    assert(parcels.every((p) => p.state === "REGISTERED" && !p.pickedUpAt));
    ok("registration is never pickup");
    await assert.rejects(
      cmd(partner, { ...make("ESCAPE"), partnerId: b.partner!.id }),
    );
    ok("partner cannot register into another tenant");
    await cmd(admin, {
      type: "assign",
      driverId: d.id,
      parcelIds: [p1.id, p2.id],
    });
    await deliveryQuery(driver, "collections", new URLSearchParams());
    assert.equal(
      (await db.deliveryParcel.findUniqueOrThrow({ where: { id: p1.id } }))
        .state,
      "REGISTERED",
    );
    ok("assignment and opening collection list do not record receipt");
    await assert.rejects(
      cmd(otherDriver, { type: "pickup", parcelIds: [p1.id] }),
    );
    ok("unassigned driver cannot confirm pickup");
    const pickup = await Promise.allSettled([
      cmd(driver, { type: "pickup", parcelIds: [p1.id] }),
      cmd(driver, { type: "pickup", parcelIds: [p1.id] }),
    ]);
    assert.equal(pickup.filter((r) => r.status === "fulfilled").length, 1);
    ok("concurrent pickup executes once");
    assert.equal(
      (await db.deliveryParcel.findUniqueOrThrow({ where: { id: p2.id } }))
        .state,
      "REGISTERED",
    );
    ok("unselected collection packages remain registered");
    await cmd(driver, { type: "deliver", parcelId: p1.id });
    await cmd(driver, { type: "pickup", parcelIds: [p2.id] });
    await cmd(driver, { type: "deliver", parcelId: p2.id });
    const delivered = await db.deliveryParcel.findUniqueOrThrow({
      where: { id: p1.id },
    });
    assert.equal(delivered.deliveredBy, d.clerkUserId);
    assert(delivered.deliveredAt);
    ok("delivery records driver and server timestamp");
    const run = () =>
      db!.$queryRawUnsafe(
        `SELECT ${schema}.igo_invoice_due($1::timestamptz) AS result`,
        new Date(cutoff.getTime() + 1000),
      );
    await Promise.all([run(), run()]);
    await run();
    const invoices = await db.deliveryInvoice.findMany({
      include: { lines: true },
    });
    assert.equal(invoices.length, 1);
    const invoice = invoices[0];
    assert.equal(invoice.total, 6000);
    assert.equal(invoice.lines.length, 2);
    assert(!invoice.lines.some((l) => l.parcelId === p3.id));
    ok("concurrent and repeated invoice runs bill delivered packages once");
    assert.equal(
      await db.deliveryInvoice.count({ where: { partnerId: b.partner!.id } }),
      0,
    );
    ok("empty partner cycles create no invoice");
    await assert.rejects(
      deliveryQuery(other, "invoice", new URLSearchParams({ id: invoice.id })),
    );
    ok("invoice details are tenant isolated");
    await assert.rejects(
      db.deliveryInvoiceLine.create({
        data: { invoiceId: invoice.id, parcelId: p3.id, amount: p3.fee },
      }),
    );
    ok("SQL rejects invoice lines for unpicked packages");
    await cmd(admin, { type: "assign", driverId: d.id, parcelIds: [p3.id] });
    await cmd(driver, { type: "pickup", parcelIds: [p3.id] });
    await cmd(driver, { type: "deliver", parcelId: p3.id });
    await db.$queryRawUnsafe(
      `SELECT ${schema}.igo_invoice_due($1::timestamptz) AS result`,
      new Date(cutoff.getTime() + 86401000),
    );
    const carry = (await deliveryQuery(
      partner,
      "overview",
      new URLSearchParams(),
    )) as { outstanding: number };
    assert.equal(await db.deliveryInvoice.count(), 2);
    assert.equal(carry.outstanding, 10500);
    assert.equal(
      (
        await db.deliveryInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).paid,
      0,
    );
    ok("new daily invoices preserve all older unpaid invoice balances");
    const receipt = () =>
      db!.deliveryReceipt.create({
        data: {
          partnerId: a.partner!.id,
          path: `${a.partner!.id}/${randomUUID()}.webp`,
          sha256: randomBytes(32).toString("hex"),
          bytes: 100,
          ready: true,
        },
      });
    const r1 = await receipt();
    await cmd(partner, {
      type: "submitPayment",
      invoiceId: invoice.id,
      receiptId: r1.id,
      bankReference: "QA-BANK-ONE",
      amount: 4000,
    });
    const payment = await db.deliveryPayment.findFirstOrThrow({
      where: { receiptId: r1.id },
    });
    assert.equal(
      (
        await db.deliveryInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).paid,
      0,
    );
    ok("pending receipt does not reduce debt");
    await assert.rejects(
      cmd(other, {
        type: "submitPayment",
        invoiceId: invoice.id,
        receiptId: r1.id,
        bankReference: "QA-ESCAPE",
        amount: 1,
      }),
    );
    await assert.rejects(
      cmd(partner, {
        type: "reviewPayment",
        paymentId: payment.id,
        decision: "CONFIRM",
        confirmedAmount: 2000,
        note: "Not authorized",
      }),
    );
    ok("cross-tenant receipts and partner verification are denied");
    const reviewKey = randomUUID(),
      partial = {
        type: "reviewPayment" as const,
        paymentId: payment.id,
        decision: "CONFIRM" as const,
        confirmedAmount: 2000,
        note: "QA bank verified part",
      };
    await cmd(admin, partial, reviewKey);
    await cmd(admin, partial, reviewKey);
    assert.equal(
      (
        await db.deliveryInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).paid,
      2000,
    );
    assert.equal(
      (
        await db.deliveryPayment.findUniqueOrThrow({
          where: { id: payment.id },
        })
      ).status,
      "PARTIAL",
    );
    ok("partial verification credits only confirmed amount once");
    const pending = [];
    for (let n = 0; n < 3; n++) {
      const r = await receipt();
      await cmd(partner, {
        type: "submitPayment",
        invoiceId: invoice.id,
        receiptId: r.id,
        bankReference: `QA-BANK-${n + 2}`,
        amount: 4000,
      });
      pending.push(
        await db.deliveryPayment.findFirstOrThrow({
          where: { receiptId: r.id },
        }),
      );
    }
    const race = await Promise.allSettled(
      pending.slice(0, 2).map((p) =>
        cmd(admin, {
          type: "reviewPayment",
          paymentId: p.id,
          decision: "CONFIRM",
          confirmedAmount: 4000,
          note: "QA actual bank credit",
        }),
      ),
    );
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (
        await db.deliveryInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).paid,
      6000,
    );
    ok("concurrent confirmations cannot over-credit an invoice");
    await cmd(admin, {
      type: "reviewPayment",
      paymentId: pending[2].id,
      decision: "REJECT",
      confirmedAmount: 0,
      note: "QA rejected evidence",
    });
    assert.equal(
      (
        await db.deliveryInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).paid,
      6000,
    );
    ok("rejection never changes confirmed debt");
    await assert.rejects(
      db.deliveryInvoice.update({
        where: { id: invoice.id },
        data: { paid: 0 },
      }),
    );
    ok("database rejects balances that do not reconcile to allocations");
    const activity = await db.deliveryActivity.findFirstOrThrow();
    await assert.rejects(
      db.deliveryActivity.update({
        where: { id: activity.id },
        data: { kind: "TAMPER" },
      }),
    );
    ok("audit history is append-only");
    await assert.rejects(
      db.deliveryInvoice.update({
        where: { id: invoice.id },
        data: { partnerId: b.partner!.id },
      }),
    );
    ok("invoice ownership cannot be rewritten");
    const wb = new ExcelJS.Workbook(),
      sheet = wb.addWorksheet("Packages");
    sheet.addRow(importColumns);
    for (let n = 0; n < 12; n++)
      sheet.addRow([
        `BULK-${n}`,
        "QA recipient",
        "7771234",
        "Disposable QA address",
        "MALE",
        "",
      ]);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer()),
      importKey = randomUUID();
    await packageImport(other, bytes, "preview", randomUUID());
    assert.equal(
      await db.deliveryParcel.count({ where: { partnerId: other.partnerId! } }),
      0,
    );
    ok("Excel preview creates no packages");
    await packageImport(other, bytes, "commit", importKey);
    await packageImport(other, bytes, "commit", importKey);
    assert.equal(
      await db.deliveryParcel.count({ where: { partnerId: other.partnerId! } }),
      12,
    );
    ok("bulk import and replay create exactly one batch");
    await assert.rejects(packageImport(other, bytes, "commit", randomUUID()));
    ok("repeated file cannot create a second batch");
    const list = (await deliveryQuery(
      other,
      "packages",
      new URLSearchParams({ page: "1" }),
    )) as { items: { id: string; partnerId: string }[]; total: number };
    assert.equal(list.items.length, 10);
    assert.equal(list.total, 12);
    assert(list.items.every((p) => p.partnerId === other.partnerId));
    ok("package lists paginate at ten and exclude other partners");
    const secondPage = (await deliveryQuery(
      other,
      "packages",
      new URLSearchParams({ page: "2" }),
    )) as typeof list;
    assert.equal(secondPage.items.length, 2);
    assert.equal(
      new Set([...list.items, ...secondPage.items].map((item) => item.id)).size,
      12,
    );
    const repeatPage = (await deliveryQuery(
      other,
      "packages",
      new URLSearchParams({ page: "1" }),
    )) as typeof list;
    assert.deepEqual(
      repeatPage.items.map((item) => item.id),
      list.items.map((item) => item.id),
    );
    ok("bulk packages with equal timestamps keep stable, disjoint pages");
    const unpicked = await db.deliveryParcel.findFirstOrThrow({
      where: { partnerId: other.partnerId! },
    });
    await assert.rejects(
      db.deliveryParcel.delete({ where: { id: unpicked.id } }),
    );
    ok("even uninvoiced parcel history cannot be deleted");
    await assert.rejects(
      cmd(other, { type: "cancel", parcelId: p1.id, reason: "Foreign parcel" }),
    );
    ok("cross-partner operational changes are denied");
    const notices = (await deliveryQuery(
      other,
      "notifications",
      new URLSearchParams(),
    )) as { total: number };
    assert.equal(notices.total, 0);
    ok("notifications are recipient scoped");
    await verifyPartnerApplications(db, admin, other, ok);
    await verifyRiderWorkflows(db, admin, partner, ok);
    await verifyPartnerInvoices(db, admin, other, driver, ok);
    await verifyPaidInvoices(db, admin, other, driver, ok);
    await verifyEarnings(db, admin, partner, driver, ok);
    await verifyOriginPricing(db, admin, driver, otherDriver, ok);
    await verifyAdminAccess(db, admin, partner, driver, ok);
    await verifyOptionalPartnerAssets(db, admin, ok);
    await verifyDeletion(db, admin, partner, ok);
    await verifyAdminWorkspaces(db, admin, partner, driver, ok);
    await verifyDashboardNavigation(db, admin, ok);
    await verifyReportingPeriods(db, admin, ok);
    await verifyNotificationClearing(db, admin, partner, driver, ok);
    await verifyRiderCollect(db, admin, ok);
    await verifyFinance(db, admin, driver, ok);
    await verifyWorkspaceNotifications(db, admin, partner, other, driver, ok);
    console.log(
      `Verified ${checks} database integration checks in an isolated disposable schema.`,
    );
  } finally {
    await db?.$disconnect();
    if (created) {
      await owner.query("ROLLBACK");
      assert(/^igo_qa_[a-f0-9]+$/.test(schema));
      await owner.query(`DROP SCHEMA "${schema}" CASCADE`);
      console.log("Disposable QA schema removed.");
    }
    await owner.end();
    delete process.env.IGO_DELIVERY_TEST_SCHEMA;
    if (originalAdminIds === undefined) delete process.env.ADMIN_CLERK_USER_IDS;
    else process.env.ADMIN_CLERK_USER_IDS = originalAdminIds;
    if (originalSuperIds === undefined)
      delete process.env.SUPER_ADMIN_CLERK_USER_IDS;
    else process.env.SUPER_ADMIN_CLERK_USER_IDS = originalSuperIds;
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
