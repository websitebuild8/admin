import test from "node:test";
import assert from "node:assert/strict";
import { invoicePaymentStatus } from "./delivery/invoice-lifecycle";
import { paidInvoiceSnapshot } from "./delivery/paid-invoice-contract";
import { commandInput } from "./delivery/domain";
const id = "123e4567-e89b-42d3-a456-426614174000";
const stamp = "2026-10-16T18:00:00+05:00";
const snapshot = {
  version: 1,
  id,
  publicId: "INV-QA-001",
  createdAt: stamp,
  cutoffAt: stamp,
  cycleDate: null,
  currency: "MVR",
  total: 2500,
  paid: 2500,
  partner: {
    businessName: "QA business",
    pickupAddress: "QA address",
    account: { name: "QA owner", phone: "7771234" },
  },
  settings: {
    businessLegalName: "",
    registrationNumber: "",
    supportEmail: "",
    supportPhone: "",
    bankName: "",
    bankAccount: "",
    beneficiary: "",
  },
  lines: [
    {
      id,
      amount: 2500,
      parcel: {
        publicId: "IGO-QA-001",
        externalReference: "FB-001",
        recipientName: "QA recipient",
        deliveredAt: stamp,
      },
    },
  ],
  payments: [
    { id, bankReference: "BML-QA-001", amount: 2500, reviewedAt: stamp },
  ],
};
test("invoice status distinguishes unpaid, verification pending, partial and fully verified payment", () => {
  assert.equal(invoicePaymentStatus({ total: 2500, paid: 0 }), "UNPAID");
  assert.equal(
    invoicePaymentStatus({ total: 2500, paid: 0, _count: { payments: 1 } }),
    "AWAITING_VERIFICATION",
  );
  assert.equal(
    invoicePaymentStatus({ total: 2500, paid: 1000 }),
    "PARTIALLY_PAID",
  );
  assert.equal(
    invoicePaymentStatus({ total: 2500, paid: 1000, _count: { payments: 1 } }),
    "AWAITING_VERIFICATION",
  );
  assert.equal(
    invoicePaymentStatus({ total: 2500, paid: 2500, _count: { payments: 1 } }),
    "PAID",
  );
});
test("paid invoice snapshots retain exact laari, references and Maldives timestamps", () => {
  const parsed = paidInvoiceSnapshot.parse(snapshot);
  assert.equal(parsed.payments[0].amount, 2500);
  assert.equal(parsed.payments[0].reviewedAt, stamp);
  assert.equal(parsed.publicId, "INV-QA-001");
});
test("paid snapshots reject partial or mismatched payments and duplicate bank allocations", () => {
  for (const value of [
    { ...snapshot, paid: 2499 },
    { ...snapshot, currency: "USD" },
    { ...snapshot, payments: [{ ...snapshot.payments[0], amount: 2499 }] },
    { ...snapshot, lines: [snapshot.lines[0], snapshot.lines[0]] },
    {
      ...snapshot,
      payments: [
        { ...snapshot.payments[0], amount: 1250 },
        { ...snapshot.payments[0], amount: 1250 },
      ],
    },
  ])
    assert.equal(paidInvoiceSnapshot.safeParse(value).success, false);
});
test("paid invoice send requests cannot choose a different recipient or invent a paid balance", () => {
  assert.deepEqual(
    commandInput.parse({
      type: "sendPaidInvoice",
      invoiceId: id,
      recipient: "someone",
      paid: 2500,
    }),
    { type: "sendPaidInvoice", invoiceId: id },
  );
  assert.equal(
    commandInput.safeParse({ type: "sendPaidInvoice", invoiceId: "wrong" })
      .success,
    false,
  );
});
