import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  commandSubjects,
  deletionInput,
  deletionTarget,
} from "./delivery/deletion-contract";

test("deletion accepts only the four explicit resources and UUID targets", () => {
  for (const kind of ["RIDER", "PARTNER", "PACKAGE", "INVOICE"])
    assert(deletionTarget.safeParse({ kind, id: randomUUID() }).success);
  assert(!deletionTarget.safeParse({ kind: "ALL", id: randomUUID() }).success);
  assert(!deletionTarget.safeParse({ kind: "RIDER", id: "all" }).success);
});
test("destructive requests require a preview, exact confirmation and meaningful reason", () => {
  const valid = {
    kind: "INVOICE",
    id: randomUUID(),
    fingerprint: "a".repeat(64),
    confirmation: "IGO-INV-123",
    reason: "Removing test records",
  };
  assert(deletionInput.safeParse(valid).success);
  for (const change of [
    { reason: "     " },
    { reason: "no" },
    { fingerprint: "" },
    { confirmation: "" },
    { cascade: true },
  ])
    assert(!deletionInput.safeParse({ ...valid, ...change }).success);
});
test("request cache subjects include nested request, actor and response references", () => {
  assert.deepEqual(
    commandSubjects(
      "user_a",
      { parcelIds: ["p2", "p1"], nested: { partnerId: "partner" } },
      { invoiceId: "invoice", duplicates: ["p1"] },
    ),
    ["invoice", "p1", "p2", "partner", "user_a"],
  );
  assert.deepEqual(commandSubjects(null, undefined, 4, false), []);
});
