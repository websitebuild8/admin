import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { paidInvoiceDocument } from "../src/lib/delivery/invoice-document";
import { invoicePaymentStatus } from "../src/lib/delivery/invoice-lifecycle";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";

export async function verifyPaidInvoices(
  db: PrismaClient,
  admin: Actor,
  other: Actor,
  driver: Actor,
  ok: (label: string) => void,
) {
  const earned = async () =>
    (
      (await deliveryQuery(admin, "overview", new URLSearchParams())) as {
        confirmedPayments: number;
      }
    ).confirmedPayments;
  const earnedBefore = await earned();
  const account = await db.deliveryAccount.create({
    data: {
      clerkUserId: `qa_paid_${randomUUID()}`,
      role: "PARTNER",
      status: "APPROVED",
      name: "Paid invoice QA",
      phone: "7771234",
      partner: {
        create: {
          businessName: "Paid invoice QA business",
          pageUrl: "https://example.com/qa",
          pickupAddress: "QA address",
          pickupArea: "Malé",
          operatingLocation: "MALE",
        },
      },
    },
    include: { partner: true },
  });
  const partner: Actor = {
    userId: account.clerkUserId,
    id: account.id,
    partnerId: account.partner!.id,
    role: "PARTNER",
    status: "APPROVED",
    name: account.name,
  };
  const cmd = (who: Actor, command: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(who, key, command);
  const parcel = await db.deliveryParcel.create({
    data: {
      publicId: `QA-PAID-${randomUUID()}`,
      partnerId: partner.partnerId!,
      externalReference: "PAID-QA",
      recipientName: "QA recipient",
      recipientPhone: "7771234",
      destination: "QA address",
      zone: "MALE",
      origin: "MALE",
      destinationLabel: "Malé",
      fee: 2500,
    },
  });
  await cmd(admin, {
    type: "assign",
    driverId: driver.id!,
    parcelIds: [parcel.id],
  });
  await cmd(driver, { type: "pickup", parcelIds: [parcel.id] });
  await cmd(driver, {
    type: "deliver",
    parcelId: parcel.id,
  });
  const issue = await cmd(admin, {
    type: "createPartnerInvoice",
    partnerId: partner.partnerId!,
    expectedCount: 1,
    expectedTotal: 2500,
  });
  assert("invoiceId" in issue && issue.invoiceId);
  const id = issue.invoiceId;
  const detail = async (who = partner) =>
    (await deliveryQuery(who, "invoice", new URLSearchParams({ id }))) as {
      invoice: {
        total: number;
        paid: number;
        _count: { payments: number };
        paidInvoice: unknown;
      };
    };
  assert.equal(invoicePaymentStatus((await detail()).invoice), "UNPAID");
  await assert.rejects(cmd(admin, { type: "sendPaidInvoice", invoiceId: id }), {
    status: 409,
  });
  await assert.rejects(paidInvoiceDocument(partner, id), { status: 404 });
  await assert.rejects(
    db.deliveryPaidInvoice.create({
      data: { invoiceId: id, snapshot: { version: 1 }, paidAt: new Date() },
    }),
  );
  await assert.rejects(
    db.deliveryInvoice.update({ where: { id }, data: { paid: 2500 } }),
  );
  assert.equal(
    await db.deliveryPaidInvoice.count({ where: { invoiceId: id } }),
    0,
  );
  ok(
    "unpaid invoices cannot produce or send a paid copy, including direct unallocated balance writes",
  );
  await cmd(admin, { type: "sendInvoice", invoiceId: id });
  const receipts = Array.from({ length: 12 }, () => ({
    id: randomUUID(),
    partnerId: partner.partnerId!,
    path: `${partner.partnerId}/${randomUUID()}.webp`,
    sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
    bytes: 100,
    ready: true,
  }));
  await db.deliveryReceipt.createMany({ data: receipts });
  const payments = receipts.map((receipt) => ({
    id: randomUUID(),
    partnerId: partner.partnerId!,
    invoiceId: id,
    receiptId: receipt.id,
    bankReference: `QA-PENDING-${randomUUID()}`,
    amount: 100,
  }));
  await db.deliveryPayment.createMany({ data: payments });
  assert.equal(
    invoicePaymentStatus((await detail()).invoice),
    "AWAITING_VERIFICATION",
  );
  assert.equal(
    invoicePaymentStatus((await detail(admin)).invoice),
    "AWAITING_VERIFICATION",
  );
  assert.equal((await detail()).invoice.paid, 0);
  assert.equal(await earned(), earnedBefore);
  const paymentList = (await deliveryQuery(
    partner,
    "invoice-payments",
    new URLSearchParams({ id }),
  )) as { items: Record<string, unknown>[]; total: number };
  assert.equal(paymentList.items.length, 10);
  assert.equal(paymentList.total, 12);
  assert(!("reviewedBy" in paymentList.items[0]));
  const second = (await deliveryQuery(
    partner,
    "invoice-payments",
    new URLSearchParams({ id, page: "2" }),
  )) as { items: unknown[] };
  assert.equal(second.items.length, 2);
  await assert.rejects(
    cmd(partner, {
      type: "reviewPayment",
      paymentId: payments[0].id,
      decision: "CONFIRM",
      confirmedAmount: 100,
      note: "Not authorized",
    }),
    { status: 403 },
  );
  ok(
    "both roles see awaiting verification without reducing debt, and all submissions paginate at ten",
  );
  await db.deliveryPayment.updateMany({
    where: { id: { in: payments.map((p) => p.id) } },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedBy: admin.userId,
      reviewNote: "QA rejected evidence",
    },
  });
  assert.equal(invoicePaymentStatus((await detail()).invoice), "UNPAID");
  const history = (await deliveryQuery(
    partner,
    "invoice-history",
    new URLSearchParams({ id }),
  )) as { items: { id: string; kind: string }[]; total: number };
  const next = (await deliveryQuery(
    partner,
    "invoice-history",
    new URLSearchParams({ id, page: "2" }),
  )) as typeof history;
  assert.equal(history.items.length, 10);
  assert.equal(next.items.length, 10);
  assert.equal(history.total, 26);
  assert.equal(
    new Set([...history.items, ...next.items].map((e) => e.id)).size,
    20,
  );
  ok(
    "rejected receipts preserve debt and the immutable invoice history retains paginated submission and review events",
  );
  async function submit(amount: number) {
    const receipt = await db.deliveryReceipt.create({
      data: {
        partnerId: partner.partnerId!,
        path: `${partner.partnerId}/${randomUUID()}.webp`,
        sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        bytes: 100,
        ready: true,
      },
    });
    await cmd(partner, {
      type: "submitPayment",
      invoiceId: id,
      receiptId: receipt.id,
      bankReference: `QA-SETTLE-${randomUUID()}`,
      amount,
    });
    return db.deliveryPayment.findUniqueOrThrow({
      where: { receiptId: receipt.id },
    });
  }
  const partial = await submit(1200);
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: partial.id,
    decision: "CONFIRM",
    confirmedAmount: 1000,
    note: "QA confirmed only 1000 laari",
  });
  assert.equal(
    invoicePaymentStatus((await detail()).invoice),
    "PARTIALLY_PAID",
  );
  assert.equal((await detail()).invoice.paid, 1000);
  assert.equal(await earned(), earnedBefore + 1000);
  assert.equal(
    await db.deliveryPaidInvoice.count({ where: { invoiceId: id } }),
    0,
  );
  ok(
    "partial verification credits only the verified amount and keeps the paid invoice unavailable",
  );
  const final = await submit(1500);
  const extraPending = await submit(100);
  const confirmation = {
    type: "reviewPayment" as const,
    paymentId: final.id,
    decision: "CONFIRM" as const,
    confirmedAmount: 1500,
    note: "QA verified remaining balance",
  };
  const key = randomUUID();
  const [a, b] = await Promise.all([
    cmd(admin, confirmation, key),
    cmd(admin, confirmation, key),
  ]);
  assert.deepEqual(a, b);
  assert.equal(invoicePaymentStatus((await detail()).invoice), "PAID");
  assert.equal(await earned(), earnedBefore + 2500);
  assert.equal(
    await db.deliveryPaidInvoice.count({ where: { invoiceId: id } }),
    1,
  );
  const paid = await paidInvoiceDocument(partner, id);
  assert.equal(
    paid.document.publicId,
    (await db.deliveryInvoice.findUniqueOrThrow({ where: { id } })).publicId,
  );
  assert.equal(paid.document.total, 2500);
  assert.equal(paid.document.paid, 2500);
  assert.equal(paid.proof.payments.length, 2);
  assert.equal(
    paid.proof.payments.reduce((sum, p) => sum + p.amount, 0),
    2500,
  );
  assert.equal(
    paid.proof.payments.find((p) => p.id === partial.id)!.amount,
    1000,
  );
  ok(
    "concurrent final verification issues one paid copy for the original invoice with exact verified bank references",
  );
  const foreignNotice = await db.deliveryNotification.create({
    data: { recipient: other.userId, title: "QA", message: "QA" },
  });
  await assert.rejects(
    db.deliveryPaidInvoiceDispatch.create({
      data: {
        invoiceId: id,
        notificationId: foreignNotice.id,
        sentBy: admin.userId,
      },
    }),
  );
  for (const who of [partner, other, driver])
    await assert.rejects(cmd(who, { type: "sendPaidInvoice", invoiceId: id }), {
      status: 403,
    });
  await Promise.all([
    cmd(admin, { type: "sendPaidInvoice", invoiceId: id }),
    cmd(admin, { type: "sendPaidInvoice", invoiceId: id }),
  ]);
  await cmd(admin, { type: "sendPaidInvoice", invoiceId: id });
  assert.equal(
    await db.deliveryNotification.count({
      where: { recipient: partner.userId, title: "Paid invoice received" },
    }),
    1,
  );
  assert.equal(
    await db.deliveryActivity.count({
      where: { entityId: id, kind: "PAID_INVOICE_SENT_TO_DASHBOARD" },
    }),
    1,
  );
  assert.equal(
    await db.deliveryInvoiceEvent.count({
      where: { invoiceId: id, kind: "PAID_SENT" },
    }),
    1,
  );
  ok(
    "only admins can send a paid invoice, and repeated concurrent sends create one correct partner notice and audit event",
  );
  await assert.rejects(paidInvoiceDocument(other, id), { status: 404 });
  await assert.rejects(paidInvoiceDocument(driver, id), { status: 403 });
  await assert.rejects(
    paidInvoiceDocument({ ...partner, status: "SUSPENDED" }, id),
    { status: 403 },
  );
  for (const resource of ["invoice-history", "invoice-payments"]) {
    await assert.rejects(
      deliveryQuery(other, resource, new URLSearchParams({ id })),
      { status: 404 },
    );
    await assert.rejects(
      deliveryQuery(driver, resource, new URLSearchParams({ id })),
      { status: 403 },
    );
  }
  const original = paid.document.partner.businessName;
  await db.deliveryPartner.update({
    where: { id: partner.partnerId! },
    data: { businessName: "Changed after settlement" },
  });
  assert.deepEqual(await paidInvoiceDocument(partner, id), paid);
  await db.deliveryPartner.update({
    where: { id: partner.partnerId! },
    data: { businessName: original },
  });
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: extraPending.id,
    decision: "REJECT",
    confirmedAmount: 0,
    note: "QA duplicate evidence after settlement",
  });
  assert.deepEqual(await paidInvoiceDocument(partner, id), paid);
  ok(
    "paid invoices and history reject other partners and riders, while settled copies preserve their original details",
  );
  await assert.rejects(
    db.deliveryPaidInvoice.update({
      where: { invoiceId: id },
      data: { snapshot: { version: 1 } },
    }),
  );
  await assert.rejects(
    db.deliveryPaidInvoice.delete({ where: { invoiceId: id } }),
  );
  await assert.rejects(
    db.deliveryPaidInvoiceDispatch.delete({ where: { invoiceId: id } }),
  );
  const event = await db.deliveryInvoiceEvent.findFirstOrThrow({
    where: { invoiceId: id },
  });
  await assert.rejects(
    db.deliveryInvoiceEvent.update({
      where: { id: event.id },
      data: { note: "rewrite" },
    }),
  );
  await assert.rejects(
    db.deliveryInvoiceEvent.delete({ where: { id: event.id } }),
  );
  const schema = process.env.IGO_DELIVERY_TEST_SCHEMA!;
  const permissions = await db.$queryRawUnsafe<
    { name: string; rls: boolean; anon: boolean; authenticated: boolean }[]
  >(
    `SELECT c.relname AS name,c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname IN ('DeliveryPaidInvoice','DeliveryPaidInvoiceDispatch','DeliveryInvoiceEvent')`,
    schema,
  );
  assert.equal(permissions.length, 3);
  assert(permissions.every((p) => p.rls && !p.anon && !p.authenticated));
  ok(
    "paid documents, sends and timeline events are append-only and all three tables deny public client access",
  );
}
