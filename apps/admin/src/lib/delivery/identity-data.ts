import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { isSuperAdmin } from "./admin-policy";

export function deliverySqlSchema() {
  const test = process.env.IGO_DELIVERY_TEST_SCHEMA ?? "";
  return process.env.NODE_ENV === "test" && /^igo_qa_[a-f0-9]+$/.test(test)
    ? test
    : "public";
}

/** Read only the fields used to authorize/select a workspace, in one roundtrip. */
export async function identityAccounts(userId: string) {
  const table = (name: string) =>
    Prisma.raw(`"${deliverySqlSchema()}"."${name}"`);
  const rows = await database().$queryRaw<
    {
      id: string;
      name: string;
      role: "PARTNER" | "DRIVER";
      status: string;
      primary: boolean;
      partnerId: string | null;
      businessName: string | null;
      applicationId: string | null;
      logoReady: boolean | null;
    }[]
  >(Prisma.sql`
    SELECT a.id,a.name,a.role::text,a.status::text,a."primary",
      p.id AS "partnerId",p."businessName",p."applicationId",app."logoReady"
    FROM ${table("DeliveryAccount")} a
    LEFT JOIN ${table("DeliveryPartner")} p ON p."accountId"=a.id
    LEFT JOIN ${table("DeliveryPartnerApplication")} app ON app.id=p."applicationId"
    WHERE a."clerkUserId"=${userId}
    ORDER BY a."primary" DESC,a."createdAt" ASC,a.id ASC
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    primary: row.primary,
    partner: row.partnerId
      ? {
          id: row.partnerId,
          businessName: row.businessName!,
          application: row.applicationId
            ? { logoReady: row.logoReady ?? false }
            : null,
        }
      : null,
  }));
}

export async function deliveryIdentity(userId: string) {
  const [accounts, grant] = await Promise.all([
    identityAccounts(userId),
    isSuperAdmin(userId)
      ? null
      : database().deliveryAdminGrant.findUnique({
          where: { clerkUserId: userId },
          select: { active: true, name: true },
        }),
  ]);
  return { userId, accounts, grant };
}
