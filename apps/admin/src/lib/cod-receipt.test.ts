import assert from "node:assert/strict";
import test from "node:test";
import {
  codCashLabel,
  codReceiptSnapshot,
} from "./delivery/cod-receipt-contract";
test("cash labels reflect the partner's receipt of the same admin-recorded payout", () => {
  assert.equal(codCashLabel("PARTNER", "payout", "handover"), "Received");
  assert.equal(
    codCashLabel("ADMIN", "payout", "handover"),
    "Remitted to partner",
  );
  assert.equal(codCashLabel("PARTNER", null, "handover"), "Held by iGO");
  assert.equal(codCashLabel("PARTNER", null, null), "Held by driver");
});
const line = {
  id: "10000000-0000-4000-8000-000000000001",
  publicId: "IGO-QA-1",
  externalReference: "QA-ONE",
  recipientName: "QA recipient",
  zone: "MALE",
  amount: 12345,
  deliveredAt: "2026-10-16T10:20:00+00:00",
};
const fixture = {
  version: 1,
  id: "10000000-0000-4000-8000-000000000002",
  number: "COD-QA",
  reference: "BANK-REFERENCE",
  amount: 12345,
  recordedAt: "2026-10-16T12:00:00+00:00",
  currency: "MVR",
  issuer: {
    brand: "iGO Delivery",
    legalName: "",
    registrationNumber: "",
    supportPhone: "",
    supportEmail: "",
  },
  partner: {
    id: "10000000-0000-4000-8000-000000000003",
    businessName: "QA Partner",
    address: "QA address",
    area: "Malé",
    contactName: "Owner",
    phone: "7771234",
  },
  lines: [line],
};
test("payout documents preserve exact laari, timezone offsets and ledger references", () => {
  const parsed = codReceiptSnapshot.parse(fixture);
  assert.equal(parsed.amount, 12345);
  assert.equal(parsed.lines[0].amount, 12345);
  assert.equal(parsed.reference, fixture.reference);
});
test("payout documents reject mismatched totals, duplicate packages and invented currency", () => {
  assert.equal(
    codReceiptSnapshot.safeParse({ ...fixture, amount: 12000 }).success,
    false,
  );
  assert.equal(
    codReceiptSnapshot.safeParse({
      ...fixture,
      lines: [line, line],
      amount: line.amount * 2,
    }).success,
    false,
  );
  assert.equal(
    codReceiptSnapshot.safeParse({ ...fixture, currency: "USD" }).success,
    false,
  );
  assert.equal(
    codReceiptSnapshot.safeParse({ ...fixture, recordedAt: "2026-10-16" })
      .success,
    false,
  );
});
