import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "./domain";
import { noticeInbox } from "./notification-contract";

// Record ownership is checked again when opening, not just when the alert is sent.
export async function notificationDestination(
  tx: Prisma.TransactionClient,
  actor: Actor,
  notice: { id: string; targetType: string | null; targetId: string | null },
) {
  const base =
    actor.role === "ADMIN"
      ? "/delivery"
      : actor.role === "PARTNER"
        ? "/partner"
        : "/rider";
  const fallback = `${noticeInbox(actor.role)}?messageId=${notice.id}`;
  const id = notice.targetId;
  if (
    notice.targetType === "INVOICE" &&
    id &&
    ["ADMIN", "PARTNER"].includes(actor.role)
  ) {
    const invoice = await tx.deliveryInvoice.findFirst({
      where: {
        id,
        ...(actor.role === "PARTNER" ? { partnerId: actor.partnerId! } : {}),
      },
    });
    if (invoice) return `${base}/finance?invoiceId=${id}`;
  }
  if (
    notice.targetType === "PAYMENT" &&
    id &&
    ["ADMIN", "PARTNER"].includes(actor.role)
  ) {
    const payment = await tx.deliveryPayment.findFirst({
      where: {
        id,
        ...(actor.role === "PARTNER" ? { partnerId: actor.partnerId! } : {}),
      },
    });
    if (payment)
      return `${base}/finance?invoiceId=${payment.invoiceId}&view=payments`;
  }
  if (notice.targetType === "PACKAGE" && id) {
    const parcel = await tx.deliveryParcel.findFirst({
      where: {
        id,
        ...(actor.role === "PARTNER"
          ? { partnerId: actor.partnerId! }
          : actor.role === "DRIVER"
            ? { driverId: actor.id! }
            : {}),
      },
    });
    if (parcel)
      return `${base}/${actor.role === "DRIVER" ? (parcel.state === "DELIVERED" ? "history" : "collections") : "packages"}?packageId=${id}`;
  }
  if (notice.targetType === "COLLECTION" && actor.role === "DRIVER")
    return "/rider/collections?stage=TO_PICKUP";
  if (notice.targetType === "SETTINGS" && actor.role === "PARTNER")
    return "/partner/settings";
  if (notice.targetType === "ACCOUNT" && id && actor.role === "ADMIN") {
    const account = await tx.deliveryAccount.findUnique({ where: { id } });
    if (account)
      return `/delivery/${account.role === "DRIVER" ? "drivers" : "partners"}?accountId=${id}`;
  }
  if (notice.targetType === "APPLICATION" && id && actor.role === "ADMIN")
    return `/delivery/applications?applicationId=${id}`;
  return fallback;
}
