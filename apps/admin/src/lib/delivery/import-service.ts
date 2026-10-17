import "server-only";
import { database } from "../db";
import { DeliveryError, partnerScope, type Actor } from "./domain";
import { parsePackagesWorkbook } from "./import";
import { createParcels, serialized } from "./commands";
export async function packageImport(
  actor: Actor,
  bytes: Buffer,
  mode: string,
  key: string,
  requestedPartner?: string,
) {
  const partnerId = partnerScope(actor, requestedPartner);
  const result = await parsePackagesWorkbook(bytes);
  const previous = await database().deliveryParcel.findMany({
    where: {
      partnerId,
      externalReference: { in: result.rows.map((r) => r.externalReference) },
    },
    select: { externalReference: true },
  });
  for (const existing of previous)
    result.errors.push({
      row: 0,
      message: `Parcel reference ${existing.externalReference} is already registered.`,
    });
  const partner = await database().deliveryPartner.findUnique({
    where: { id: partnerId },
    select: { operatingLocation: true },
  });
  const rates = partner?.operatingLocation
    ? await database().deliveryRate.findMany({
        where: {
          origin: partner.operatingLocation,
          destination: { active: true },
        },
        select: { zone: true },
      })
    : [];
  if (!partner?.operatingLocation)
    result.errors.push({
      row: 0,
      message:
        "Ask iGO to set your business operating location before importing packages.",
    });
  for (const zone of new Set(result.rows.map((row) => row.zone)))
    if (!rates.some((rate) => rate.zone === zone))
      result.errors.push({
        row: 0,
        message: `No active rate is configured for destination ${zone} from your business location.`,
      });
  if (mode === "preview")
    return {
      count: result.rows.length,
      errors: result.errors.slice(0, 100),
      examples: result.rows.slice(0, 10),
    };
  if (mode !== "commit") throw new DeliveryError("Choose preview or commit.");
  // Replaying a completed import returns its result, before duplicate validation.
  return serialized(
    actor,
    key,
    { type: "import", partnerId, hash: result.fileHash },
    async (tx) => {
      if (result.errors.length)
        throw new DeliveryError(
          result.errors
            .slice(0, 10)
            .map((e) => `Row ${e.row || "reference"}: ${e.message}`)
            .join("\n"),
        );
      const batch = await tx.deliveryImport.create({
        data: {
          partnerId,
          fileHash: result.fileHash,
          rowCount: result.rows.length,
        },
      });
      return createParcels(tx, actor, partnerId, result.rows, batch.id);
    },
  );
}
