import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import {
  codPayoutReceipt,
  fullCodPayoutReceipt,
} from "../src/lib/delivery/cod-receipts";
import { codReceiptSnapshot } from "../src/lib/delivery/cod-receipt-contract";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";
export async function verifyCodReceipts(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  other: Actor,
  driver: Actor,
  receiptId: string,
  ok: (label: string) => void,
) {
  const first = await codPayoutReceipt(admin, receiptId);
  assert.deepEqual(await codPayoutReceipt(partner, receiptId), first);
  assert.equal(first.receipt.id, receiptId);
  assert.equal(first.receipt.amount, 10000);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].amount, 10000);
  const issued = await db.deliveryCodReceipt.count({
    where: { id: receiptId },
  });
  assert.equal(issued, 1);
  ok(
    "payout commit atomically issues one matching receipt readable by admin and its partner",
  );
  await assert.rejects(codPayoutReceipt(other, receiptId), { status: 404 });
  await assert.rejects(fullCodPayoutReceipt(other, receiptId), { status: 404 });
  await assert.rejects(codPayoutReceipt(driver, receiptId), { status: 403 });
  await assert.rejects(
    codPayoutReceipt({ ...partner, status: "SUSPENDED" }, receiptId),
    { status: 403 },
  );
  await assert.rejects(codPayoutReceipt(admin, randomUUID()), { status: 404 });
  await assert.rejects(
    deliveryQuery(other, "cod-receipt", new URLSearchParams({ id: receiptId })),
    { status: 404 },
  );
  ok(
    "receipt API and full print document reject foreign partners, riders and suspended access",
  );
  await assert.rejects(
    db.deliveryCodReceipt.update({
      where: { id: receiptId },
      data: { snapshot: { amount: 1 } },
    }),
  );
  await assert.rejects(
    db.deliveryCodReceipt.delete({ where: { id: receiptId } }),
  );
  await assert.rejects(
    db.deliveryCodReceipt.create({ data: { id: receiptId, snapshot: {} } }),
  );
  const oldProfile = await db.deliveryPartner.findUniqueOrThrow({
    where: { id: partner.partnerId! },
  });
  await db.deliveryPartner.update({
    where: { id: partner.partnerId! },
    data: {
      businessName: "Changed after payout",
      pickupAddress: "Changed address",
    },
  });
  assert.deepEqual(await codPayoutReceipt(partner, receiptId), first);
  await db.deliveryPartner.update({
    where: { id: partner.partnerId! },
    data: {
      businessName: oldProfile.businessName,
      pickupAddress: oldProfile.pickupAddress,
    },
  });
  ok(
    "issued payout receipts are append-only and remain stable after partner profile edits",
  );
  const cmd = (who: Actor, value: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(who, key, value);
  const fixtures = Array.from({ length: 12 }, (_, n) => ({
    id: randomUUID(),
    publicId: `COD-QA-${String(n).padStart(2, "0")}-${randomUUID()}`,
    partnerId: partner.partnerId!,
    externalReference: `COD-QA-${n}`,
    recipientName: `QA Recipient ${n}`,
    recipientPhone: "7771234",
    destination: "Disposable receipt QA address",
    zone: "MALE" as const,
    fee: 2500,
    codAmount: 101 + n,
  }));
  await db.deliveryParcel.createMany({ data: fixtures });
  const ids = fixtures.map((p) => p.id);
  await cmd(admin, { type: "assign", driverId: driver.id!, parcelIds: ids });
  await cmd(driver, { type: "pickup", parcelIds: ids });
  for (const id of ids)
    await cmd(driver, { type: "deliver", parcelId: id, codReceived: true });
  await cmd(admin, {
    type: "handover",
    driverId: driver.id!,
    parcelIds: ids,
    reference: "QA-RECEIPT-HANDOVER",
  });
  const payout = {
      type: "remit" as const,
      partnerId: partner.partnerId!,
      parcelIds: ids,
      reference: "QA-RECEIPT-PAYOUT",
    },
    key = randomUUID();
  const results = await Promise.all([
    cmd(admin, payout, key),
    cmd(admin, payout, key),
  ]);
  assert.deepEqual(results[0], results[1]);
  const transfer = await db.deliveryCodRemittance.findUniqueOrThrow({
    where: { reference: payout.reference },
  });
  assert.equal(
    await db.deliveryCodReceipt.count({ where: { id: transfer.id } }),
    1,
  );
  assert.equal(
    await db.deliveryActivity.count({
      where: { kind: "COD_RECEIPT_ISSUED", entityId: transfer.id },
    }),
    1,
  );
  await assert.rejects(
    cmd(admin, { ...payout, reference: "QA-DUPLICATE-PAYOUT" }),
  );
  assert.equal(
    await db.deliveryCodRemittance.count({
      where: { reference: "QA-DUPLICATE-PAYOUT" },
    }),
    0,
  );
  ok(
    "concurrent payout retries return one transfer, one receipt and one document audit event",
  );
  const pageOne = await codPayoutReceipt(partner, transfer.id),
    pageTwo = await codPayoutReceipt(partner, transfer.id, 2);
  assert.equal(pageOne.items.length, 10);
  assert.equal(pageTwo.items.length, 2);
  assert.equal(
    new Set([...pageOne.items, ...pageTwo.items].map((line) => line.id)).size,
    12,
  );
  const full = await fullCodPayoutReceipt(partner, transfer.id);
  assert.equal(full.items.length, 12);
  assert.equal(
    full.receipt.amount,
    fixtures.reduce((sum, row) => sum + row.codAmount, 0),
  );
  assert.equal(
    full.items.reduce((sum, row) => sum + row.amount, 0),
    full.receipt.amount,
  );
  assert(
    codReceiptSnapshot.safeParse({ ...full.receipt, lines: full.items })
      .success,
  );
  ok(
    "receipt tables paginate at ten while the full print document reconciles every package",
  );
}
