import "server-only";
import { z } from "zod";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import {
  codReceiptSnapshot,
  type CodReceiptDocument,
} from "./cod-receipt-contract";
export async function codPayoutReceipt(
  actor: Actor,
  id: string,
  page = 1,
): Promise<CodReceiptDocument> {
  requireRole(actor, "ADMIN", "PARTNER");
  z.uuid().parse(id);
  z.number().int().min(1).max(100000).parse(page);
  const document = await database().deliveryCodReceipt.findFirst({
    where: {
      id,
      ...(actor.role === "PARTNER"
        ? { remittance: { partnerId: actor.partnerId! } }
        : {}),
    },
  });
  if (!document) throw new DeliveryError("Payout receipt not found.", 404);
  const snapshot = codReceiptSnapshot.parse(document.snapshot);
  const { lines, ...header } = snapshot;
  return {
    receipt: {
      ...header,
      issuedAt: document.createdAt.toISOString(),
      packageCount: lines.length,
    },
    items: lines.slice((page - 1) * 10, page * 10),
    total: lines.length,
    page,
    pageSize: 10,
  };
}
export async function fullCodPayoutReceipt(actor: Actor, id: string) {
  const first = await codPayoutReceipt(actor, id);
  // Read the single immutable snapshot rather than fetching mutable live parcel profiles.
  const document = await database().deliveryCodReceipt.findUniqueOrThrow({
    where: { id: first.receipt.id },
  });
  return {
    receipt: first.receipt,
    items: codReceiptSnapshot.parse(document.snapshot).lines,
  };
}
