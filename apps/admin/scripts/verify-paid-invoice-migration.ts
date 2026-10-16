import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { paidInvoiceDocument } from "../src/lib/delivery/invoice-document";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";
export async function verifyPaidInvoiceMigration(
  db: PrismaClient,
  admin: Actor,
  driver: Actor,
  migrate: () => Promise<void>,
  ok: (label: string) => void,
) {
  const account = await db.deliveryAccount.create({
    data: {
      clerkUserId: `qa_historic_${randomUUID()}`,
      role: "PARTNER",
      status: "APPROVED",
      name: "Historic QA",
      phone: "7771234",
      partner: {
        create: {
          businessName: "Historic QA",
          pageUrl: "https://example.com/qa",
          pickupAddress: "QA address",
          pickupArea: "Malé",
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
  const cmd = (who: Actor, value: DeliveryCommandInput) =>
    deliveryCommand(who, randomUUID(), value);
  async function issue() {
    const parcel = await db.deliveryParcel.create({
      data: {
        publicId: `HIST-${randomUUID()}`,
        partnerId: partner.partnerId!,
        externalReference: randomUUID(),
        recipientName: "QA recipient",
        recipientPhone: "7771234",
        destination: "QA address",
        zone: "MALE",
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
      codReceived: false,
    });
    const invoice = await cmd(admin, {
      type: "createPartnerInvoice",
      partnerId: partner.partnerId!,
      expectedCount: 1,
      expectedTotal: 2500,
    });
    assert("invoiceId" in invoice && invoice.invoiceId);
    return invoice.invoiceId;
  }
  const paidId = await issue(),
    unpaidId = await issue();
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
    invoiceId: paidId,
    receiptId: receipt.id,
    bankReference: "QA-HISTORICAL-BANK",
    amount: 2500,
  });
  const payment = await db.deliveryPayment.findUniqueOrThrow({
    where: { receiptId: receipt.id },
  });
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: payment.id,
    decision: "CONFIRM",
    confirmedAmount: 2500,
    note: "QA payment before migration",
  });
  const settled = await db.deliveryPayment.findUniqueOrThrow({
    where: { id: payment.id },
  });
  const started = new Date();
  await migrate();
  const document = await paidInvoiceDocument(partner, paidId);
  assert.equal(document.proof.paidAt, settled.reviewedAt!.toISOString());
  assert(new Date(document.proof.issuedAt) >= started);
  assert.equal(document.proof.payments[0].bankReference, payment.bankReference);
  assert.equal(document.document.total, 2500);
  assert.equal(await db.deliveryPaidInvoice.count(), 1);
  assert.equal(
    await db.deliveryPaidInvoice.count({ where: { invoiceId: unpaidId } }),
    0,
  );
  assert.equal(
    await db.deliveryInvoiceEvent.count({ where: { invoiceId: paidId } }),
    4,
  );
  assert.equal(
    await db.deliveryActivity.count({
      where: { kind: "PAID_INVOICE_ISSUED", entityId: paidId },
    }),
    1,
  );
  ok(
    "migration backfills only previously settled invoices, preserving original payment times and references with a new issuance audit",
  );
  assert.equal(
    (await db.deliveryInvoice.findUniqueOrThrow({ where: { id: paidId } }))
      .paid,
    2500,
  );
  assert.equal(
    (await db.deliveryInvoice.findUniqueOrThrow({ where: { id: unpaidId } }))
      .paid,
    0,
  );
  assert.equal(await db.deliveryPayment.count(), 1);
  assert.equal(
    await db.deliveryNotification.count({
      where: { title: "Paid invoice received" },
    }),
    0,
  );
  ok(
    "historical backfill creates no payments, debt changes or paid-invoice notifications",
  );
}
