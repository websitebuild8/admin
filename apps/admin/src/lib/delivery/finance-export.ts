import ExcelJS from "exceljs";
import { invoicePaymentStatus, invoiceStatusLabels } from "./invoice-lifecycle";
import { operatingLocationLabels } from "./domain";
import type {
  FinanceDelivery,
  FinanceInvoice,
  FinanceTransfer,
} from "./finance-contract";

export type FinanceReport = {
  generatedAt: string;
  periodLabel: string;
  partnerLabel: string;
  deliveries: FinanceDelivery[];
  invoices: FinanceInvoice[];
  transfers: FinanceTransfer[];
};
type Value = string | number;
type ReportTable = {
  name: string;
  headings: string[];
  rows: Value[][];
  money: number[];
};
export function reportTime(value: string | null) {
  return value
    ? new Date(new Date(value).getTime() + 5 * 3600000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ")
    : "";
}
export function reportTables(report: FinanceReport): ReportTable[] {
  return [
    {
      name: "Deliveries",
      headings: [
        "Package ID",
        "Business reference",
        "Partner",
        "Customer",
        "Customer phone",
        "Pickup address",
        "Customer address",
        "Operating location",
        "Destination",
        "Handling notes",
        "Registered (MVT)",
        "Picked up (MVT)",
        "Delivered (MVT)",
        "Rider",
        "Rider phone",
        "Pickup recorded by",
        "Delivery recorded by",
        "Delivery fee (MVR)",
        "Invoiced fee (MVR)",
        "Invoice",
        "Invoice status",
      ],
      money: [18, 19],
      rows: report.deliveries.map((p) => [
        p.publicId,
        p.externalReference,
        p.partner.businessName,
        p.recipientName,
        p.recipientPhone,
        p.partner.pickupAddress,
        p.destination,
        operatingLocationLabels[p.origin ?? ""] ?? p.origin ?? "",
        p.destinationLabel,
        p.description,
        reportTime(p.registeredAt),
        reportTime(p.pickedUpAt),
        reportTime(p.deliveredAt),
        p.driver?.name ?? "",
        p.driver?.phone ?? "",
        p.pickedUpBy ?? "",
        p.deliveredBy ?? "",
        p.fee / 100,
        p.invoiceLine ? p.invoiceLine.amount / 100 : "",
        p.invoiceLine?.invoice.publicId ?? "",
        p.invoiceLine
          ? invoiceStatusLabels[invoicePaymentStatus(p.invoiceLine.invoice)]
          : "Awaiting billing",
      ]),
    },
    {
      name: "Invoices",
      headings: [
        "Invoice",
        "Partner",
        "Issued (MVT)",
        "Cutoff (MVT)",
        "Status",
        "Total (MVR)",
        "Verified paid (MVR)",
        "Outstanding (MVR)",
        "Package count",
        "Pending transfers",
        "Invoice sent (MVT)",
        "Fully paid (MVT)",
        "Paid invoice sent (MVT)",
      ],
      money: [6, 7, 8],
      rows: report.invoices.map((i) => [
        i.publicId,
        i.partner.businessName,
        reportTime(i.createdAt),
        reportTime(i.cycle?.cutoffAt ?? i.manualCutoffAt),
        invoiceStatusLabels[invoicePaymentStatus(i)],
        i.total / 100,
        i.paid / 100,
        (i.total - i.paid) / 100,
        i._count.lines,
        i._count.payments,
        reportTime(i.dispatch?.sentAt ?? null),
        reportTime(i.paidInvoice?.paidAt ?? null),
        reportTime(i.paidInvoice?.dispatch?.sentAt ?? null),
      ]),
    },
    {
      name: "Transfers",
      headings: [
        "Transfer ID",
        "Bank reference",
        "Invoice",
        "Partner",
        "Submitted (MVT)",
        "Submitted (MVR)",
        "Verified (MVR)",
        "Status",
        "Reviewed (MVT)",
        "Reviewed by",
        "Review note",
        "Receipt reference",
      ],
      money: [6, 7],
      rows: report.transfers.map((p) => [
        p.id,
        p.bankReference,
        p.invoice.publicId,
        p.partner.businessName,
        reportTime(p.createdAt),
        p.amount / 100,
        p.confirmedAmount / 100,
        p.status,
        reportTime(p.reviewedAt),
        p.reviewedBy ?? "",
        p.reviewNote,
        p.receiptId,
      ]),
    },
  ];
}
/** Quoted cells alone do not prevent spreadsheet formula execution. */
export function csvCell(value: Value) {
  const text = String(value);
  const safe =
    typeof value === "string" &&
    (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function deliveriesCsv(report: FinanceReport) {
  const table = reportTables(report)[0];
  return (
    "\ufeff" +
    [table.headings, ...table.rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
export async function financeWorkbook(report: FinanceReport) {
  const book = new ExcelJS.Workbook();
  book.creator = "iGO Delivery";
  book.created = new Date(report.generatedAt);
  const summary = book.addWorksheet("Summary");
  summary.columns = [{ width: 43 }, { width: 34 }, { width: 85 }];
  summary.addRows([
    ["iGO Delivery · Finance report"],
    ["Delivery completion period", report.periodLabel],
    ["Partner", report.partnerLabel],
    ["Generated (MVT)", reportTime(report.generatedAt)],
    [],
    ["Selected deliveries", "Value", "Scope"],
    ["Completed deliveries", report.deliveries.length],
    [
      "Delivery fees (MVR)",
      report.deliveries.reduce((s, p) => s + p.fee, 0) / 100,
    ],
    [
      "Invoiced delivery fees (MVR)",
      report.deliveries.reduce((s, p) => s + (p.invoiceLine?.amount ?? 0), 0) /
        100,
    ],
    [
      "Awaiting billing (MVR)",
      report.deliveries
        .filter((p) => !p.invoiceLine)
        .reduce((s, p) => s + p.fee, 0) / 100,
    ],
    [],
    [
      "Related invoices",
      "Value",
      "Whole invoice totals, including packages outside the selected delivery period",
    ],
    ["Invoice count", report.invoices.length],
    ["Invoiced (MVR)", report.invoices.reduce((s, i) => s + i.total, 0) / 100],
    [
      "Verified paid (MVR)",
      report.invoices.reduce((s, i) => s + i.paid, 0) / 100,
    ],
    [
      "Outstanding (MVR)",
      report.invoices.reduce((s, i) => s + i.total - i.paid, 0) / 100,
    ],
    [
      "Pending transfer submissions (MVR)",
      report.transfers
        .filter((p) => p.status === "PENDING")
        .reduce((s, p) => s + p.amount, 0) / 100,
      "Evidence awaiting review; does not reduce outstanding",
    ],
    [],
    [
      "Report scope",
      "Completed deliveries and their related invoices/transfers",
    ],
    [
      "Payment allocation",
      "Payments settle invoices; no per-package payment allocation is assumed.",
    ],
    ["Currency / time zone", "MVR · Maldives Time (UTC+5)"],
  ]);
  summary.mergeCells("A1:C1");
  for (const row of [8, 9, 10, 14, 15, 16, 17])
    summary.getCell(row, 2).numFmt = "#,##0.00";
  for (const row of [6, 12]) styleHeader(summary.getRow(row));
  summary.eachRow((row) => {
    row.height = 30;
    row.alignment = { vertical: "middle", wrapText: true };
  });
  summary.getRow(12).height = 58;
  summary.getRow(17).height = 48;
  summary.getRow(19).height = 58;
  summary.getRow(20).height = 70;
  for (const table of reportTables(report)) {
    const sheet = book.addWorksheet(table.name, {
      views: [{ state: "frozen", ySplit: 4 }],
    });
    sheet.addRow([`iGO Delivery · ${table.name}`]);
    sheet.addRow([
      `${report.periodLabel} · ${report.partnerLabel} · MVR · UTC+5`,
    ]);
    sheet.addRow([]);
    sheet.addRow(table.headings);
    sheet.addRows(table.rows);
    sheet.mergeCells(1, 1, 1, table.headings.length);
    sheet.mergeCells(2, 1, 2, table.headings.length);
    table.headings.forEach((heading, index) => {
      if (!heading.includes("MVT")) return;
      sheet.getColumn(index + 1).numFmt = "dd mmm yyyy hh:mm";
      for (let n = 5; n <= sheet.rowCount; n++) {
        const cell = sheet.getCell(n, index + 1);
        if (typeof cell.value === "string")
          cell.value = cell.value
            ? new Date(`${cell.value.replace(" ", "T")}Z`)
            : null;
      }
    });
    sheet.columns.forEach((col, index) => {
      col.width = /address|notes|note/i.test(table.headings[index])
        ? 40
        : /MVT/.test(table.headings[index])
          ? 25
          : /reference|recorded by|ID/.test(table.headings[index])
            ? 34
            : 24;
      if (table.money.includes(index + 1)) col.numFmt = "#,##0.00";
    });
    styleHeader(sheet.getRow(4));
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, sheet.rowCount), column: table.headings.length },
    };
    sheet.eachRow((row, n) => {
      row.alignment = { vertical: "top", wrapText: true };
      row.height = n > 4 ? 42 : 30;
    });
    sheet.getRow(1).font = { name: "Aptos", size: 16, bold: true };
  }
  summary.getRow(1).font = { name: "Aptos", size: 18, bold: true };
  return Buffer.from(await book.xlsx.writeBuffer());
}
function styleHeader(row: ExcelJS.Row) {
  row.font = { name: "Aptos", bold: true, color: { argb: "FF111111" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFEA00" },
  };
  row.height = 32;
}
