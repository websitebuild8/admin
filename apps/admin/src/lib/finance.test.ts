import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  csvCell,
  deliveriesCsv,
  financeWorkbook,
  reportTime,
  type FinanceReport,
} from "./delivery/finance-export";
import { financeFilters } from "./delivery/finance-contract";

const report: FinanceReport = {
  generatedAt: "2026-10-20T10:00:00Z",
  periodLabel: "October 2026",
  partnerLabel: "Example partner",
  deliveries: [
    {
      id: "package-id",
      publicId: "IGO-123",
      externalReference: "0000123",
      recipientName: '=HYPERLINK("evil")',
      recipientPhone: "7771234",
      destination: "First line,\nSecond line",
      destinationLabel: "Malé",
      origin: "MALE",
      description: "Fragile",
      fee: 2501,
      registeredAt: "2026-10-19T17:00:00Z",
      pickedUpAt: "2026-10-19T18:00:00Z",
      deliveredAt: "2026-10-19T19:05:00Z",
      pickedUpBy: "rider",
      deliveredBy: "rider",
      partner: {
        businessName: "Example partner",
        pickupAddress: "Example pickup",
      },
      driver: { name: "QA rider", phone: "7771234" },
      invoiceLine: {
        amount: 2501,
        invoice: {
          id: "invoice-id",
          publicId: "INV-1",
          total: 2501,
          paid: 1000,
          _count: { payments: 1 },
        },
      },
    },
  ],
  invoices: [
    {
      id: "invoice-id",
      partnerId: "partner-id",
      publicId: "INV-1",
      total: 2501,
      paid: 1000,
      createdAt: "2026-10-20T00:00:00Z",
      manualCutoffAt: "2026-10-20T00:00:00Z",
      cycle: null,
      partner: {
        businessName: "Example partner",
        pickupAddress: "Example pickup",
      },
      dispatch: null,
      paidInvoice: null,
      _count: { lines: 1, payments: 1 },
    },
  ],
  transfers: [
    {
      id: "payment-id",
      partnerId: "partner-id",
      invoiceId: "invoice-id",
      amount: 1501,
      confirmedAmount: 0,
      status: "PENDING",
      bankReference: "0000001",
      receiptId: "receipt-id",
      reviewNote: "",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: "2026-10-20T10:00:00Z",
      invoice: { id: "invoice-id", publicId: "INV-1", total: 2501, paid: 1000 },
      partner: { businessName: "Example partner" },
    },
  ],
};
test("CSV escapes commas, quotes/newlines and spreadsheet formulas without corrupting numeric amounts", () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const v of ["=1+1", " +cmd", "-cmd", "@SUM(A1)", "\t=1"])
    assert(csvCell(v).startsWith("\"'"));
  assert.equal(csvCell(25.01), '"25.01"');
  const csv = deliveriesCsv(report);
  assert(csv.startsWith("\ufeff"));
  assert(csv.includes("Customer"));
  assert(csv.includes('"25.01"'));
  assert(csv.includes("' =") == false);
  assert(csv.includes("'=HYPERLINK"));
  assert(csv.includes("0000123"));
});
test("Report times use Maldives Time across midnight and empty timestamps remain empty", () => {
  assert.equal(reportTime("2026-10-19T19:05:00Z"), "2026-10-20 00:05:00");
  assert.equal(reportTime(null), "");
});
test("Excel report has typed finance totals, sortable local dates and separate unique invoice/payment schedules", async () => {
  const bytes = await financeWorkbook(report),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(
    bytes as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  assert.deepEqual(
    book.worksheets.map((s) => s.name),
    ["Summary", "Deliveries", "Invoices", "Transfers"],
  );
  const summary = book.getWorksheet("Summary")!,
    deliveries = book.getWorksheet("Deliveries")!;
  assert.equal(summary.getCell("B8").value, 25.01);
  assert.equal(summary.getCell("B14").value, 25.01);
  assert.equal(summary.getCell("B15").value, 10);
  assert.equal(summary.getCell("B16").value, 15.01);
  assert.equal(
    deliveries.getCell("D5").value,
    report.deliveries[0].recipientName,
  );
  assert.equal(deliveries.getCell("B5").value, "0000123");
  assert.equal(deliveries.getCell("R5").value, 25.01);
  assert(deliveries.getCell("M5").value instanceof Date);
  assert.equal(
    (deliveries.getCell("M5").value as Date).toISOString(),
    "2026-10-20T00:05:00.000Z",
  );
  assert.equal(book.getWorksheet("Invoices")!.rowCount, 5);
  assert.equal(book.getWorksheet("Invoices")!.getCell("L5").value, null);
  assert.equal(book.getWorksheet("Invoices")!.getCell("M5").value, null);
  assert.equal(book.getWorksheet("Transfers")!.getCell("I5").value, null);
  assert.equal(book.getWorksheet("Transfers")!.getCell("B5").value, "0000001");
  assert.equal(deliveries.views[0].state, "frozen");
  assert(deliveries.autoFilter);
});
test("Empty reports remain valid and finance filters reject malformed or mismatched states", async () => {
  const empty = { ...report, deliveries: [], invoices: [], transfers: [] };
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await financeWorkbook(empty)) as unknown as Parameters<
      typeof book.xlsx.load
    >[0],
  );
  assert.equal(book.getWorksheet("Summary")!.getCell("B7").value, 0);
  assert.equal(book.getWorksheet("Deliveries")!.rowCount, 4);
  assert.equal(financeFilters(new URLSearchParams()).tab, "invoices");
  for (const q of [
    "tab=other",
    "tab=transfers&status=PAID",
    "page=0",
    "partnerId=invalid",
  ])
    assert.throws(() => financeFilters(new URLSearchParams(q)));
});
