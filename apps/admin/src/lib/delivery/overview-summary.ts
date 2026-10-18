import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { requireRole, type Actor } from "./domain";
import { deliverySqlSchema } from "./identity-data";

/** Aggregate on the database: one roundtrip, with the same tenant/date rules. */
export async function overviewSummary(
  actor: Actor,
  range?: { gte?: Date; lt?: Date },
) {
  requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
  const table = (name: string) =>
    Prisma.raw(`"${deliverySqlSchema()}"."${name}"`);
  const during = (column: string) =>
    range
      ? Prisma.sql`${Prisma.raw(column)} >= ${range.gte!} AND ${Prisma.raw(column)} < ${range.lt!}`
      : Prisma.sql`true`;
  const parcels =
    actor.role === "PARTNER"
      ? Prisma.sql`p."partnerId"=${actor.partnerId}::uuid`
      : actor.role === "DRIVER"
        ? Prisma.sql`p."driverId"=${actor.id}::uuid`
        : Prisma.sql`true`;
  const invoices =
    actor.role === "PARTNER"
      ? Prisma.sql`i."partnerId"=${actor.partnerId}::uuid`
      : Prisma.sql`true`;
  const [row] = await database().$queryRaw<
    Record<string, bigint | number>[]
  >(Prisma.sql`
    SELECT
      count(*) FILTER (WHERE p.state='REGISTERED' AND ${during('p."registeredAt"')}) AS registered,
      count(*) FILTER (WHERE p.state='PICKED_UP' AND ${during('p."registeredAt"')}) AS "pickedUp",
      count(*) FILTER (WHERE p.state='DELIVERED' AND ${during('p."deliveredAt"')}) AS delivered,
      coalesce(sum(p.fee) FILTER (WHERE p.state IN ('REGISTERED','PICKED_UP') AND ${during('p."registeredAt"')}),0) AS "pendingEstimate",
      coalesce(sum(p.fee) FILTER (WHERE p.state='DELIVERED' AND ${during('p."deliveredAt"')} AND NOT EXISTS
        (SELECT 1 FROM ${table("DeliveryInvoiceLine")} l WHERE l."parcelId"=p.id)),0) AS "awaitingBilling",
      CASE WHEN ${actor.role !== "DRIVER"} THEN
        (SELECT coalesce(sum(i.total-i.paid),0) FROM ${table("DeliveryInvoice")} i WHERE ${invoices}) ELSE 0 END AS outstanding,
      CASE WHEN ${actor.role !== "DRIVER"} THEN
        (SELECT coalesce(sum(i.total),0) FROM ${table("DeliveryInvoice")} i WHERE ${invoices} AND ${during('i."createdAt"')}) ELSE 0 END AS invoiced,
      CASE WHEN ${actor.role !== "DRIVER"} THEN
        (SELECT coalesce(sum(a.amount),0) FROM ${table("DeliveryPaymentAllocation")} a
          JOIN ${table("DeliveryPayment")} pay ON pay.id=a."paymentId"
          JOIN ${table("DeliveryInvoice")} i ON i.id=a."invoiceId"
          WHERE ${invoices} AND pay.status IN ('PARTIAL','CONFIRMED') AND ${during('pay."reviewedAt"')} AND pay."reviewedAt"<=${new Date()}) ELSE 0 END AS "confirmedPayments",
      CASE WHEN ${actor.role === "ADMIN"} THEN
        (SELECT count(*) FROM ${table("DeliveryAccount")} a WHERE a.status='PENDING' AND ${during('a."createdAt"')}) +
        (SELECT count(*) FROM ${table("DeliveryPartnerApplication")} app WHERE app.status='PENDING' AND app."submittedAt" IS NOT NULL AND ${during('app."submittedAt"')}) ELSE 0 END AS "awaitingApproval",
      CASE WHEN ${actor.role === "ADMIN"} THEN
        (SELECT count(*) FROM ${table("DeliveryPayment")} pay WHERE pay.status='PENDING' AND ${during('pay."createdAt"')}) ELSE 0 END AS "paymentReview"
    FROM ${table("DeliveryParcel")} p WHERE ${parcels}
  `);
  return {
    registered: Number(row.registered),
    pickedUp: Number(row.pickedUp),
    delivered: Number(row.delivered),
    pendingEstimate: Number(row.pendingEstimate),
    awaitingBilling: Number(row.awaitingBilling),
    outstanding: Number(row.outstanding),
    invoiced: Number(row.invoiced),
    confirmedPayments: Number(row.confirmedPayments),
    awaitingApproval: Number(row.awaitingApproval),
    paymentReview: Number(row.paymentReview),
  };
}
