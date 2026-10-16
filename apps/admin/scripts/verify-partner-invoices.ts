import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { invoiceDocument } from "../src/lib/delivery/invoice-document";
import {
  nextCutoff,
  type Actor,
  type DeliveryCommandInput,
} from "../src/lib/delivery/domain";
import type { PartnerHistory } from "../src/lib/delivery/partner-history-contract";

export async function verifyPartnerInvoices(
  db: PrismaClient,
  admin: Actor,
  other: Actor,
  driver: Actor,
  ok: (label: string) => void,
) {
  const schema = process.env.IGO_DELIVERY_TEST_SCHEMA!;
  assert(/^igo_qa_[a-f0-9]+$/.test(schema));
  const cutoff = nextCutoff(new Date(), 1080);
  const account = await db.deliveryAccount.create({
    data: {
      clerkUserId: `qa_invoice_${randomUUID()}`,
      role: "PARTNER",
      status: "APPROVED",
      name: "Invoice QA owner",
      phone: "7771234",
      partner: {
        create: {
          businessName: "Invoice QA partner",
          pageUrl: "https://example.com/qa",
          pickupAddress: "QA address",
          pickupArea: "Malé",
          nextInvoiceAt: cutoff,
        },
      },
    },
    include: { partner: true },
  });
  const partnerId = account.partner!.id;
  const partner: Actor = {
    userId: account.clerkUserId,
    id: account.id,
    partnerId,
    role: "PARTNER",
    status: "APPROVED",
    name: account.name,
  };
  const cmd = (who: Actor, value: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(who, key, value);
  const history = (extra: Record<string, string> = {}) =>
    deliveryQuery(
      admin,
      "partner-history",
      new URLSearchParams({ partnerId, ...extra }),
    ) as Promise<PartnerHistory>;
  const fixtures = Array.from({ length: 15 }, (_, n) => ({
    id: randomUUID(),
    publicId: `MANUAL-QA-${n}-${randomUUID()}`,
    partnerId,
    externalReference: `MANUAL-QA-${n}`,
    recipientName: `Invoice QA recipient ${n}`,
    recipientPhone: "7771234",
    destination: "QA destination",
    zone: "MALE" as const,
    fee: 2500 + n * 100,
  }));
  await db.deliveryParcel.createMany({ data: fixtures });
  await cmd(admin, {
    type: "assign",
    driverId: driver.id!,
    parcelIds: fixtures.slice(0, 13).map((p) => p.id),
  });
  await cmd(driver, {
    type: "pickup",
    parcelIds: fixtures.slice(0, 13).map((p) => p.id),
  });
  await db.deliveryParcel.updateMany({
    where: { id: { in: fixtures.slice(0, 12).map((p) => p.id) } },
    data: {
      state: "DELIVERED",
      deliveredAt: new Date(),
      deliveredBy: driver.userId,
    },
  });
  await cmd(admin, {
    type: "cancel",
    parcelId: fixtures[14].id,
    reason: "Disposable cancelled QA package",
  });
  const preview = await history();
  const total = fixtures.slice(0, 12).reduce((sum, p) => sum + p.fee, 0);
  assert.equal(preview.total, 15);
  assert.equal(preview.items.length, 10);
  assert.equal((await history({ page: "2" })).items.length, 5);
  assert.equal(preview.summary.eligibleCount, 12);
  assert.equal(preview.summary.eligibleTotal, total);
  assert.equal(preview.summary.outstanding, 0);
  assert.equal((await history({ filter: "UNINVOICED" })).total, 12);
  assert.equal(
    (await history({ filter: "DELIVERED", q: fixtures[0].publicId })).total,
    1,
  );
  ok(
    "partner history paginates ten rows, filters delivery states and totals all eligible deliveries without treating estimates as debt",
  );
  for (const actor of [
    partner,
    other,
    driver,
    { ...partner, status: "SUSPENDED" } as Actor,
  ])
    await assert.rejects(
      deliveryQuery(
        actor,
        "partner-history",
        new URLSearchParams({ partnerId }),
      ),
      { status: 403 },
    );
  await assert.rejects(
    deliveryQuery(
      admin,
      "partner-history",
      new URLSearchParams({ partnerId: randomUUID() }),
    ),
    { status: 404 },
  );
  const issue = {
    type: "createPartnerInvoice" as const,
    partnerId,
    expectedCount: 12,
    expectedTotal: total,
  };
  await assert.rejects(cmd(partner, issue), { status: 403 });
  await assert.rejects(cmd(driver, issue), { status: 403 });
  await assert.rejects(cmd(admin, { ...issue, expectedTotal: total - 1 }), {
    status: 409,
  });
  assert.equal(await db.deliveryInvoice.count({ where: { partnerId } }), 0);
  ok(
    "history and invoice creation require admin access and reject stale totals before recording debt",
  );
  const noticeCount = await db.deliveryNotification.count({
    where: { recipient: partner.userId },
  });
  const key = randomUUID();
  const [first, replayed] = await Promise.all([
    cmd(admin, issue, key),
    cmd(admin, issue, key),
  ]);
  assert.deepEqual(first, replayed);
  assert("invoiceId" in first && first.invoiceId);
  const invoice = await db.deliveryInvoice.findUniqueOrThrow({
    where: { id: first.invoiceId },
    include: { lines: true },
  });
  assert.equal(invoice.total, total);
  assert.equal(invoice.lines.length, 12);
  assert.equal(invoice.cycleId, null);
  assert(invoice.manualCutoffAt);
  assert.equal(await db.deliveryInvoice.count({ where: { partnerId } }), 1);
  assert.equal(
    await db.deliveryBillingCycle.count({ where: { partnerId } }),
    0,
  );
  assert.equal(
    (
      await db.deliveryPartner.findUniqueOrThrow({ where: { id: partnerId } })
    ).nextInvoiceAt!.getTime(),
    cutoff.getTime(),
  );
  assert.equal(
    await db.deliveryNotification.count({
      where: { recipient: partner.userId },
    }),
    noticeCount,
  );
  assert.equal((await history()).summary.eligibleCount, 0);
  await assert.rejects(cmd(admin, issue), { status: 409 });
  ok(
    "manual issuance bills every completed uninvoiced package once, survives retries and leaves the automatic cutoff unchanged",
  );
  const detail = (await deliveryQuery(
    partner,
    "invoice",
    new URLSearchParams({ id: invoice.id }),
  )) as { items: unknown[]; total: number };
  assert.equal(detail.items.length, 10);
  assert.equal(detail.total, 12);
  assert.equal((await invoiceDocument(partner, invoice.id)).lines.length, 12);
  await assert.rejects(invoiceDocument(other, invoice.id), { status: 404 });
  await assert.rejects(invoiceDocument(driver, invoice.id), { status: 403 });
  await assert.rejects(
    deliveryQuery(other, "invoice", new URLSearchParams({ id: invoice.id })),
    { status: 404 },
  );
  const ownInvoices = (await deliveryQuery(
    other,
    "invoices",
    new URLSearchParams({ partnerId }),
  )) as { items: { partnerId: string }[] };
  assert(ownInvoices.items.every((i) => i.partnerId === other.partnerId));
  const filtered = (await deliveryQuery(
    admin,
    "invoices",
    new URLSearchParams({ partnerId }),
  )) as { items: { partnerId: string }[]; total: number };
  assert.equal(filtered.total, 1);
  assert(filtered.items.every((i) => i.partnerId === partnerId));
  ok(
    "invoice history, paginated details and full print documents preserve partner isolation",
  );
  const send = { type: "sendInvoice" as const, invoiceId: invoice.id };
  await assert.rejects(cmd(partner, send), { status: 403 });
  await assert.rejects(cmd(other, send), { status: 403 });
  await assert.rejects(cmd(driver, send), { status: 403 });
  await Promise.all([cmd(admin, send), cmd(admin, send)]);
  await cmd(admin, send);
  const dispatch = await db.deliveryInvoiceDispatch.findUniqueOrThrow({
    where: { invoiceId: invoice.id },
    include: { notification: true },
  });
  assert.equal(dispatch.notification.recipient, partner.userId);
  assert(dispatch.notification.message.includes(invoice.publicId));
  assert.equal(
    await db.deliveryNotification.count({
      where: { recipient: partner.userId },
    }),
    noticeCount + 1,
  );
  assert.equal(
    await db.deliveryActivity.count({
      where: { entityId: invoice.id, kind: "INVOICE_SENT_TO_DASHBOARD" },
    }),
    1,
  );
  ok(
    "Send invoice records exactly one partner notification and audit event across concurrent clicks and retries",
  );
  await assert.rejects(
    db.deliveryInvoiceDispatch.update({
      where: { invoiceId: invoice.id },
      data: { sentBy: "changed" },
    }),
  );
  await assert.rejects(
    db.deliveryInvoiceDispatch.delete({ where: { invoiceId: invoice.id } }),
  );
  await assert.rejects(
    db.deliveryInvoice.update({
      where: { id: invoice.id },
      data: { manualCutoffAt: new Date() },
    }),
  );
  await assert.rejects(
    db.deliveryInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        parcelId: fixtures[12].id,
        amount: fixtures[12].fee,
      },
    }),
  );
  await assert.rejects(
    db.deliveryInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        parcelId: fixtures[0].id,
        amount: fixtures[0].fee,
      },
    }),
  );
  const permissions = await db.$queryRawUnsafe<
    { rls: boolean; anon: boolean; authenticated: boolean }[]
  >(
    `SELECT c.relrowsecurity AS rls, has_table_privilege('anon',c.oid,'SELECT') AS anon, has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='DeliveryInvoiceDispatch'`,
    schema,
  );
  assert.deepEqual(permissions, [
    { rls: true, anon: false, authenticated: false },
  ]);
  ok(
    "database guards freeze issued invoices and sends, reject duplicate or unpicked lines and deny direct client access",
  );
  await cmd(driver, {
    type: "deliver",
    parcelId: fixtures[12].id,
    codReceived: false,
  });
  const eligible = await history();
  const nextIssue = {
    type: "createPartnerInvoice" as const,
    partnerId,
    expectedCount: eligible.summary.eligibleCount,
    expectedTotal: eligible.summary.eligibleTotal,
  };
  const parallel = await Promise.allSettled([
    cmd(admin, nextIssue),
    cmd(admin, nextIssue),
  ]);
  assert.equal(parallel.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.deliveryInvoice.count({ where: { partnerId } }), 2);
  assert.equal((await history()).summary.outstanding, total + fixtures[12].fee);
  ok(
    "concurrent requests with different keys cannot bill the same deliveries twice and preserve older unpaid balances",
  );
  await cmd(admin, {
    type: "assign",
    driverId: driver.id!,
    parcelIds: [fixtures[13].id],
  });
  await cmd(driver, { type: "pickup", parcelIds: [fixtures[13].id] });
  await cmd(driver, {
    type: "deliver",
    parcelId: fixtures[13].id,
    codReceived: false,
  });
  await db.$queryRawUnsafe(
    `SELECT ${schema}.igo_invoice_due($1::timestamptz)`,
    new Date(cutoff.getTime() + 1000),
  );
  const daily = await db.deliveryInvoice.findFirstOrThrow({
    where: { partnerId, cycleId: { not: null } },
    include: { lines: true },
  });
  assert.equal(daily.total, fixtures[13].fee);
  assert.equal(daily.lines.length, 1);
  assert.equal(daily.lines[0].parcelId, fixtures[13].id);
  assert.equal(
    (await history()).summary.outstanding,
    total + fixtures[12].fee + fixtures[13].fee,
  );
  assert.equal(
    await db.deliveryInvoiceLine.count({ where: { parcel: { partnerId } } }),
    14,
  );
  ok(
    "daily invoicing still bills later deliveries on the same day and skips all manually invoiced packages",
  );
  const foreignNotice = await db.deliveryNotification.create({
    data: { recipient: other.userId, title: "QA", message: "QA" },
  });
  await assert.rejects(
    db.deliveryInvoiceDispatch.create({
      data: {
        invoiceId: daily.id,
        notificationId: foreignNotice.id,
        sentBy: admin.userId,
      },
    }),
  );
  ok("database rejects sending an invoice notification to another partner");
  const receipt = await db.deliveryReceipt.create({
    data: {
      partnerId,
      path: `${partnerId}/${randomUUID()}.webp`,
      sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      bytes: 100,
      ready: true,
    },
  });
  await cmd(partner, {
    type: "submitPayment",
    invoiceId: invoice.id,
    receiptId: receipt.id,
    bankReference: `QA-MANUAL-${randomUUID()}`,
    amount: 1000,
  });
  assert.equal(
    (await db.deliveryInvoice.findUniqueOrThrow({ where: { id: invoice.id } }))
      .paid,
    0,
  );
  const payment = await db.deliveryPayment.findUniqueOrThrow({
    where: { receiptId: receipt.id },
  });
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: payment.id,
    decision: "CONFIRM",
    confirmedAmount: 500,
    note: "QA verified partial amount",
  });
  assert.equal((await invoiceDocument(partner, invoice.id)).paid, 500);
  assert.equal(
    (await history()).summary.outstanding,
    total + fixtures[12].fee + fixtures[13].fee - 500,
  );
  ok(
    "manual invoices use the same verified-payment ledger: pending receipts do not reduce debt and confirmed partial payments do",
  );
  const extra = {
    ...fixtures[0],
    id: randomUUID(),
    publicId: `RACE-QA-${randomUUID()}`,
    externalReference: `RACE-${randomUUID()}`,
  };
  await db.deliveryParcel.create({ data: extra });
  await cmd(admin, {
    type: "assign",
    driverId: driver.id!,
    parcelIds: [extra.id],
  });
  await cmd(driver, { type: "pickup", parcelIds: [extra.id] });
  await cmd(driver, {
    type: "deliver",
    parcelId: extra.id,
    codReceived: false,
  });
  const countBefore = await db.deliveryInvoice.count({ where: { partnerId } });
  const race = await Promise.allSettled([
    cmd(admin, {
      type: "createPartnerInvoice",
      partnerId,
      expectedCount: 1,
      expectedTotal: extra.fee,
    }),
    db.$queryRawUnsafe(
      `SELECT ${schema}.igo_invoice_due($1::timestamptz)`,
      new Date(cutoff.getTime() + 86401000),
    ),
  ]);
  if (race[0].status === "rejected") assert.equal(race[0].reason.status, 409);
  assert.equal(race[1].status, "fulfilled");
  assert.equal(
    await db.deliveryInvoice.count({ where: { partnerId } }),
    countBefore + 1,
  );
  assert.equal(
    await db.deliveryInvoiceLine.count({ where: { parcelId: extra.id } }),
    1,
  );
  ok(
    "concurrent automatic and manual invoicing share a lock and charge each delivery exactly once",
  );
}
