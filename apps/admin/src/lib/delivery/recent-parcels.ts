import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { requireRole, type Actor } from "./domain";
import { deliverySqlSchema } from "./identity-data";
import type { parcelSelection } from "./queries";

/** Match the existing parcel DTO without chained relation queries over the WAN. */
export async function recentParcels(
  actor: Actor,
  range?: { gte?: Date; lt?: Date },
) {
  requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
  const table = (name: string) =>
    Prisma.raw(`"${deliverySqlSchema()}"."${name}"`);
  const scope =
    actor.role === "PARTNER"
      ? Prisma.sql`p."partnerId"=${actor.partnerId}::uuid`
      : actor.role === "DRIVER"
        ? Prisma.sql`p."driverId"=${actor.id}::uuid`
        : Prisma.sql`true`;
  const during = range
    ? Prisma.sql`p."registeredAt">=${range.gte!} AND p."registeredAt"<${range.lt!}`
    : Prisma.sql`true`;
  return database().$queryRaw<
    Prisma.DeliveryParcelGetPayload<{ select: typeof parcelSelection }>[]
  >(Prisma.sql`
    SELECT p.id,p."publicId",p."externalReference",p."recipientName",p."recipientPhone",
      p.destination,p.zone,p.origin,p."destinationLabel",p.description,p.fee,p.state,
      p."registeredAt",p."pickedUpAt",p."deliveredAt",p."pickedUpBy",p."deliveredBy",p."driverId",p."partnerId",
      jsonb_build_object('businessName',partner."businessName",'pickupAddress',partner."pickupAddress",'pickupArea',partner."pickupArea",
        'account',jsonb_build_object('name',account.name,'phone',account.phone)) AS partner,
      CASE WHEN driver.id IS NULL THEN NULL ELSE jsonb_build_object('name',driver.name) END AS driver,
      CASE WHEN line.id IS NULL THEN NULL ELSE jsonb_build_object('invoice',jsonb_build_object('publicId',invoice."publicId")) END AS "invoiceLine"
    FROM ${table("DeliveryParcel")} p
    JOIN ${table("DeliveryPartner")} partner ON partner.id=p."partnerId"
    JOIN ${table("DeliveryAccount")} account ON account.id=partner."accountId"
    LEFT JOIN ${table("DeliveryAccount")} driver ON driver.id=p."driverId"
    LEFT JOIN ${table("DeliveryInvoiceLine")} line ON line."parcelId"=p.id
    LEFT JOIN ${table("DeliveryInvoice")} invoice ON invoice.id=line."invoiceId"
    WHERE ${scope} AND ${during}
    ORDER BY p."registeredAt" DESC,p.id DESC LIMIT 5
  `);
}
