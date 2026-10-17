import ExcelJS from "exceljs";
import { fromBuffer } from "yauzl";
import { createHash } from "node:crypto";
import { DeliveryError, parcelInput, type ParcelInput } from "./domain";
export const importColumns = [
  "Parcel reference",
  "Recipient name",
  "Recipient phone",
  "Destination",
  "Delivery zone",
  "Description",
];
export async function inspectWorkbookArchive(bytes: Buffer) {
  if (
    bytes.length > 1024 * 1024 ||
    bytes.length < 20 ||
    bytes.readUInt32LE(0) !== 0x04034b50
  )
    throw new DeliveryError("Use an .xlsx workbook up to 1 MB.");
  await new Promise<void>((resolve, reject) =>
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new DeliveryError("The workbook archive is invalid."));
        let total = 0,
          entries = 0,
          expanded = 0,
          failed = false;
        const fail = () => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(
            new DeliveryError(
              "The workbook archive is invalid or expands beyond the allowed limits.",
            ),
          );
        };
        zip.on("error", () =>
          reject(new DeliveryError("The workbook archive is invalid.")),
        );
        zip.on("entry", (entry) => {
          total += entry.uncompressedSize;
          entries++;
          if (
            total > 12 * 1024 * 1024 ||
            entries > 60 ||
            entry.uncompressedSize > 8 * 1024 * 1024 ||
            /(?:vbaProject|externalLinks|embeddings|\.\.\/|^\/)/i.test(
              entry.fileName,
            ) ||
            entry.generalPurposeBitFlag & 1
          ) {
            zip.close();
            reject(
              new DeliveryError(
                "Workbook is too complex, encrypted or contains unsupported links/macros. Use the iGO template.",
              ),
            );
            return;
          }
          if (failed) return;
          // Read the bounded streams before ExcelJS allocates XML strings. ZIP
          // directory sizes alone can be forged by an untrusted uploader.
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              fail();
              return;
            }
            let size = 0;
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              expanded += chunk.length;
              if (size > 8 * 1024 * 1024 || expanded > 12 * 1024 * 1024) {
                stream.destroy();
                fail();
              }
            });
            stream.on("error", fail);
            stream.on("end", () => {
              if (size !== entry.uncompressedSize) {
                fail();
                return;
              }
              if (!failed) zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (!failed) resolve();
        });
        zip.readEntry();
      },
    ),
  );
}
export async function parsePackagesWorkbook(bytes: Buffer) {
  await inspectWorkbookArchive(bytes);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new DeliveryError("The Excel workbook could not be read.");
  }
  const sheet = wb.getWorksheet("Packages");
  if (
    !sheet ||
    sheet.rowCount > 501 ||
    sheet.columnCount > 6 ||
    wb.worksheets.length > 2
  )
    throw new DeliveryError(
      "Use the Packages sheet with at most 500 packages and the six template columns.",
    );
  if (
    importColumns.some(
      (name, i) =>
        sheet
          .getRow(1)
          .getCell(i + 1)
          .text.trim() !== name,
    )
  )
    throw new DeliveryError(
      "Column headings do not match. Download the latest iGO template.",
    );
  const rows: ParcelInput[] = [],
    errors: { row: number; message: string }[] = [],
    references = new Set<string>();
  for (let row = 2; row <= sheet.rowCount; row++) {
    const cells = Array.from({ length: 6 }, (_, i) =>
      sheet.getRow(row).getCell(i + 1),
    );
    if (cells.every((c) => c.value == null || c.text.trim() === "")) continue;
    if (
      cells.some(
        (c, i) =>
          (typeof c.value === "object" && c.value !== null) ||
          (i !== 2 && /^[=+@]/.test(c.text.trim())),
      )
    ) {
      errors.push({
        row,
        message:
          "Formulas, links and rich cells are unsupported. Enter plain values.",
      });
      continue;
    }
    const values = cells.map((c) => c.text.trim());
    const parsed = parcelInput.safeParse({
      externalReference: values[0],
      recipientName: values[1],
      recipientPhone: values[2],
      destination: values[3],
      zone: values[4],
      description: values[5],
    });
    if (!parsed.success) {
      errors.push({
        row,
        message: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      continue;
    }
    if (references.has(parsed.data.externalReference))
      errors.push({
        row,
        message: "Duplicate parcel reference within this workbook.",
      });
    else {
      references.add(parsed.data.externalReference);
      rows.push(parsed.data);
    }
  }
  if (!rows.length && !errors.length)
    errors.push({
      row: 2,
      message: "Add at least one package below the headings.",
    });
  return {
    rows,
    errors: errors.slice(0, 100),
    fileHash: createHash("sha256").update(bytes).digest("hex"),
  };
}
