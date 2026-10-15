import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import {
  applicationInput,
  commandInput,
  defaultRates,
  localDate,
  nextCutoff,
  parcelInput,
  parseMoney,
  partnerScope,
  requireRole,
  reviewAmount,
  type Actor,
} from "./delivery/domain";
import {
  importColumns,
  inspectWorkbookArchive,
  parsePackagesWorkbook,
} from "./delivery/import";

const partner: Actor = {
  userId: "test",
  id: "a",
  partnerId: "partner-a",
  role: "PARTNER",
  status: "APPROVED",
  name: "Test",
};
const row = [
  "REF-1",
  "Customer",
  "7771234",
  "Building, street, Malé",
  "MALE",
  "120.25",
  "Fragile",
];
async function workbook(rows: unknown[][], headings = importColumns) {
  const w = new ExcelJS.Workbook();
  const s = w.addWorksheet("Packages");
  s.addRow(headings);
  rows.forEach((r) => s.addRow(r));
  return Buffer.from(await w.xlsx.writeBuffer());
}

test("MVR uses exact integer laari and rejects unsafe or fractional input", () => {
  assert.equal(parseMoney("25.01"), 2501);
  assert.equal(parseMoney("0.1"), 10);
  assert.equal(parseMoney(35), 3500);
  for (const v of [
    "-1",
    "1.001",
    "1e3",
    "Infinity",
    "NaN",
    "",
    "1,000",
    "1000000",
  ])
    assert.throws(() => parseMoney(v));
  assert.deepEqual(defaultRates, {
    BOAT: 2500,
    MALE: 2500,
    HULHUMALE_1: 3500,
    HULHUMALE_2: 4500,
  });
});
test("Maldives date and cutoff do not depend on machine timezone", () => {
  assert.equal(localDate(new Date("2026-10-15T19:01:00Z")), "2026-10-16");
  assert.equal(
    nextCutoff(new Date("2026-10-16T12:59:59Z"), 1080).toISOString(),
    "2026-10-16T13:00:00.000Z",
  );
  assert.equal(
    nextCutoff(new Date("2026-10-16T13:00:00Z"), 1080).toISOString(),
    "2026-10-17T13:00:00.000Z",
  );
  assert.equal(
    nextCutoff(new Date("2026-10-16T18:59:59Z"), 0).toISOString(),
    "2026-10-16T19:00:00.000Z",
  );
  for (const v of [-1, 1440, 1.5])
    assert.throws(() => nextCutoff(new Date(), v));
});
test("approval and tenant identity are enforced independently from requested role", () => {
  assert.equal(partnerScope(partner), "partner-a");
  assert.throws(() => partnerScope(partner, "partner-b"));
  assert.throws(() => requireRole({ ...partner, partnerId: null }, "PARTNER"));
  assert.throws(() =>
    requireRole({ ...partner, role: "DRIVER", id: null }, "DRIVER"),
  );
  assert.throws(() =>
    requireRole({ ...partner, status: "SUSPENDED" }, "PARTNER"),
  );
  assert.throws(() => partnerScope({ ...partner, role: "DRIVER" }));
  assert.throws(() => partnerScope({ ...partner, role: "ADMIN" }));
  assert.equal(
    partnerScope({ ...partner, role: "ADMIN" }, "partner-b"),
    "partner-b",
  );
});
test("application and parcel validation cannot grant roles or accept arbitrary payment amounts", () => {
  assert.equal(
    applicationInput.safeParse({
      role: "ADMIN",
      name: "A User",
      phone: "7771234",
    }).success,
    false,
  );
  assert.equal(
    applicationInput.safeParse({
      role: "PARTNER",
      name: "A User",
      phone: "7771234",
    }).success,
    false,
  );
  assert.equal(
    applicationInput.safeParse({
      role: "PARTNER",
      name: "A User",
      phone: "7771234",
      businessName: "Shop",
      pageUrl: "javascript:alert(1)",
      pickupAddress: "Building",
      pickupArea: "Malé",
    }).success,
    false,
  );
  const input = {
    externalReference: " ref-1 ",
    recipientName: "Customer",
    recipientPhone: "+9607771234",
    destination: "Building Malé",
    zone: "MALE",
    codAmount: "12.50",
  };
  assert.equal(parcelInput.parse(input).codAmount, 1250);
  assert.equal(parcelInput.parse(input).externalReference, "REF-1");
  assert.equal(
    parcelInput.safeParse({ ...input, codAmount: "-3" }).success,
    false,
  );
  assert.equal(
    commandInput.safeParse({
      type: "pickup",
      parcelIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000001",
      ],
    }).success,
    false,
  );
});
test("partial bank verification credits only verified money and never overpays", () => {
  assert.equal(reviewAmount(5000, 2000, 6000), "PARTIAL");
  assert.equal(reviewAmount(5000, 5000, 6000), "CONFIRMED");
  for (const args of [
    [5000, 0, 6000],
    [5000, 5001, 6000],
    [5000, 4000, 3999],
    [5000, 1.2, 6000],
  ])
    assert.throws(() => reviewAmount(...(args as [number, number, number])));
});
test("shipped Excel template has exact headers, no example orders and supported limits", async () => {
  const data = await parsePackagesWorkbook(
    await readFile("public/templates/igo-packages.xlsx"),
  );
  assert.equal(data.rows.length, 0);
  assert.match(data.errors[0].message, /at least one/);
});
test("Excel import parses plain values, normalizes references, and detects duplicate rows", async () => {
  const data = await parsePackagesWorkbook(
    await workbook([
      row,
      [...row.slice(0, 1).map((v) => String(v).toLowerCase()), ...row.slice(1)],
    ]),
  );
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].codAmount, 12025);
  assert.equal(data.errors[0].row, 3);
  assert.match(data.errors[0].message, /Duplicate/);
});
test("Excel import rejects formulas, headers, excessive rows and non-Excel input", async () => {
  const formula = [...row];
  formula[0] = { formula: "1+1", result: 2 } as unknown as string;
  assert.match(
    (await parsePackagesWorkbook(await workbook([formula]))).errors[0].message,
    /Formulas/,
  );
  await assert.rejects(
    parsePackagesWorkbook(
      await workbook([row], ["Wrong", ...importColumns.slice(1)]),
    ),
    /headings/,
  );
  await assert.rejects(
    parsePackagesWorkbook(
      await workbook(
        Array.from({ length: 501 }, (_, i) => [`${i}`, ...row.slice(1)]),
      ),
    ),
    /500 packages/,
  );
  await assert.rejects(
    inspectWorkbookArchive(Buffer.from("not an xlsx workbook at all")),
    /xlsx/,
  );
  await assert.rejects(
    inspectWorkbookArchive(Buffer.alloc(1024 * 1024 + 1)),
    /1 MB/,
  );
});
test("Excel archive validation reads streams and rejects forged expanded sizes", async () => {
  const bytes = await workbook([row]);
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert(central >= 0);
  bytes.writeUInt32LE(1, central + 24);
  await assert.rejects(inspectWorkbookArchive(bytes), /archive/);
});
