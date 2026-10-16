import test from "node:test";
import assert from "node:assert/strict";
import { commandInput } from "./delivery/domain";

const partnerId = "123e4567-e89b-42d3-a456-426614174000";
test("manual invoice preview requires a valid partner and positive integer count and laari total", () => {
  const value = {
    type: "createPartnerInvoice",
    partnerId,
    expectedCount: 12,
    expectedTotal: 36600,
  };
  assert.deepEqual(commandInput.parse(value), value);
  for (const patch of [
    { partnerId: "other" },
    { expectedCount: 0 },
    { expectedCount: 1.5 },
    { expectedCount: 1000001 },
    { expectedTotal: 0 },
    { expectedTotal: 25.25 },
    { expectedTotal: "36600" },
    { expectedTotal: 2147483648 },
  ]) {
    assert.equal(commandInput.safeParse({ ...value, ...patch }).success, false);
  }
});
test("sending an invoice identifies the existing invoice rather than accepting recipient or amount fields", () => {
  assert.deepEqual(
    commandInput.parse({
      type: "sendInvoice",
      invoiceId: partnerId,
      recipient: "attacker",
      total: 1,
    }),
    { type: "sendInvoice", invoiceId: partnerId },
  );
  assert.equal(
    commandInput.safeParse({ type: "sendInvoice", invoiceId: "invalid" })
      .success,
    false,
  );
});
