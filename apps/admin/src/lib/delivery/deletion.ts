import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { requireSuperAdmin } from "./admin-policy";
import { multiRoleAllowed } from "./role-authorization";
import { audit, serialized, type Tx } from "./commands";
import { DeliveryError, type Actor } from "./domain";
import type {
  DeletionInput,
  DeletionKind,
  DeletionPreview,
} from "./deletion-contract";

type Row = Record<string, Prisma.JsonValue>;
type Target = { kind: DeletionKind; id: string };
const primaryKey: Record<string, string> = {
  DeliveryInvoiceDispatch: "invoiceId",
  DeliveryPaidInvoice: "invoiceId",
  DeliveryPaidInvoiceDispatch: "invoiceId",
};
function schema() {
  const test = process.env.IGO_DELIVERY_TEST_SCHEMA ?? "";
  return process.env.NODE_ENV === "test" && /^igo_qa_[a-f0-9]+$/.test(test)
    ? test
    : "public";
}
const tableSql = (table: string) => Prisma.raw(`"${schema()}"."${table}"`);
const ids = (rows: Row[], key = "id") => rows.map((r) => String(r[key]));
function inIds(column: string, values: string[]) {
  return values.length
    ? Prisma.sql`${Prisma.raw(`t."${column}"`)}::text IN (${Prisma.join(values)})`
    : Prisma.sql`false`;
}
async function read(tx: Tx, table: string, condition: Prisma.Sql) {
  const rows = await tx.$queryRaw<{ row: Row }[]>(Prisma.sql`
    SELECT to_jsonb(t) AS row FROM ${tableSql(table)} t WHERE ${condition}
    ORDER BY t.${Prisma.raw(`"${primaryKey[table] ?? "id"}"`)} LIMIT 10001`);
  if (rows.length > 10000)
    throw new DeliveryError(
      "This deletion is too large. Remove smaller groups first.",
      409,
    );
  return rows.map((r) => r.row);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

async function deletionGraph(tx: Tx, target: Target) {
  const graph: Record<string, Row[]> = {};
  let label = "",
    partnerId: string | undefined;
  let account: Row | undefined;
  const warnings: string[] = [];
  if (target.kind === "RIDER" || target.kind === "PARTNER") {
    account = (
      await read(
        tx,
        "DeliveryAccount",
        Prisma.sql`t.id=${target.id}::uuid AND t.role=${target.kind === "RIDER" ? "DRIVER" : "PARTNER"}::${Prisma.raw(`"${schema()}"."DeliveryRole"`)}`,
      )
    )[0];
    if (!account)
      throw new DeliveryError(
        "This account no longer exists. Refresh the list.",
        404,
      );
    graph.DeliveryAccount = [account];
    label = String(account.name);
    const automaticRoles = await multiRoleAllowed(
      tx,
      String(account.clerkUserId),
    );
    if (automaticRoles)
      warnings.push(
        "Administrator access automatically includes Partner and Rider. While admin access remains, this deleted workspace will be recreated empty on the next sign-in. Deleted packages and financial records will not return.",
      );
    if (target.kind === "PARTNER") {
      graph.DeliveryPartner = await read(
        tx,
        "DeliveryPartner",
        inIds("accountId", [target.id]),
      );
      const partner = graph.DeliveryPartner[0];
      if (partner) {
        label = String(partner.businessName);
        partnerId = String(partner.id);
        graph.DeliveryPartnerApplication = await read(
          tx,
          "DeliveryPartnerApplication",
          inIds(
            "id",
            partner.applicationId ? [String(partner.applicationId)] : [],
          ),
        );
        if (
          graph.DeliveryPartnerApplication.some(
            (a) => a.invitationState === "SENDING",
          )
        )
          throw new DeliveryError(
            "A sign-in invitation is being prepared. Wait for it to finish before deleting this partner.",
            409,
          );
      }
      if (!automaticRoles)
        warnings.push(
          "The business account and its application are removed, so signing in cannot reactivate the deleted partner automatically.",
        );
    } else {
      graph.DeliveryParcelUnassign = await read(
        tx,
        "DeliveryParcel",
        inIds("driverId", [target.id]),
      );
      if (graph.DeliveryParcelUnassign.some((p) => p.state === "PICKED_UP"))
        throw new DeliveryError(
          "This rider still has physically picked-up packages. Complete or delete those packages before deleting the rider.",
          409,
        );
      warnings.push(
        "Registered packages become available for reassignment. Completed packages keep their delivery timestamps and recorded rider identity.",
      );
    }
    warnings.push(
      "The Clerk sign-in identity and any administrator access are kept. Only this delivery role is removed.",
    );
  }
  let invoiceIds: string[] = [];
  if (target.kind === "INVOICE") {
    graph.DeliveryInvoice = await read(
      tx,
      "DeliveryInvoice",
      inIds("id", [target.id]),
    );
    if (!graph.DeliveryInvoice.length)
      throw new DeliveryError(
        "This invoice no longer exists. Refresh the list.",
        404,
      );
    label = String(graph.DeliveryInvoice[0].publicId);
  } else if (target.kind === "PACKAGE") {
    const parcel = (
      await read(tx, "DeliveryParcel", inIds("id", [target.id]))
    )[0];
    if (!parcel)
      throw new DeliveryError(
        "This package no longer exists. Refresh the list.",
        404,
      );
    label = String(parcel.publicId);
    const line = await read(
      tx,
      "DeliveryInvoiceLine",
      inIds("parcelId", [target.id]),
    );
    graph.DeliveryInvoice = await read(
      tx,
      "DeliveryInvoice",
      inIds("id", ids(line, "invoiceId")),
    );
  } else {
    graph.DeliveryInvoice = await read(
      tx,
      "DeliveryInvoice",
      inIds("partnerId", partnerId ? [partnerId] : []),
    );
  }
  invoiceIds = ids(graph.DeliveryInvoice);
  graph.DeliveryInvoiceLine = await read(
    tx,
    "DeliveryInvoiceLine",
    inIds("invoiceId", invoiceIds),
  );
  graph.DeliveryParcel = await read(
    tx,
    "DeliveryParcel",
    Prisma.sql`(${inIds("partnerId", partnerId ? [partnerId] : [])}) OR (${inIds("id", [...ids(graph.DeliveryInvoiceLine, "parcelId"), ...(target.kind === "PACKAGE" ? [target.id] : [])])})`,
  );
  const parcelIds = ids(graph.DeliveryParcel);
  if (invoiceIds.length)
    warnings.push(
      "Deleting an invoice also deletes every package on that invoice. This prevents the same deliveries from being invoiced again.",
    );
  if (graph.DeliveryParcel.some((p) => p.state === "PICKED_UP"))
    warnings.push(
      "This includes packages currently marked as picked up. Their delivery records will be permanently removed.",
    );
  graph.DeliveryPayment = await read(
    tx,
    "DeliveryPayment",
    inIds("invoiceId", invoiceIds),
  );
  if (graph.DeliveryPayment.length)
    warnings.push(
      "Deleting payment records does not reverse any actual bank transfer.",
    );
  graph.DeliveryPaymentAllocation = await read(
    tx,
    "DeliveryPaymentAllocation",
    inIds("invoiceId", invoiceIds),
  );
  graph.DeliveryReceipt = await read(
    tx,
    "DeliveryReceipt",
    Prisma.sql`(${inIds("partnerId", partnerId ? [partnerId] : [])}) OR (${inIds("id", ids(graph.DeliveryPayment, "receiptId"))})`,
  );
  graph.DeliveryInvoiceDispatch = await read(
    tx,
    "DeliveryInvoiceDispatch",
    inIds("invoiceId", invoiceIds),
  );
  graph.DeliveryPaidInvoiceDispatch = await read(
    tx,
    "DeliveryPaidInvoiceDispatch",
    inIds("invoiceId", invoiceIds),
  );
  graph.DeliveryPaidInvoice = await read(
    tx,
    "DeliveryPaidInvoice",
    inIds("invoiceId", invoiceIds),
  );
  graph.DeliveryInvoiceEvent = await read(
    tx,
    "DeliveryInvoiceEvent",
    inIds("invoiceId", invoiceIds),
  );
  graph.DeliveryBillingCycle = await read(
    tx,
    "DeliveryBillingCycle",
    Prisma.sql`(${inIds("partnerId", partnerId ? [partnerId] : [])}) OR (${inIds(
      "id",
      graph.DeliveryInvoice.filter((i) => i.cycleId).map((i) =>
        String(i.cycleId),
      ),
    )})`,
  );
  graph.DeliveryImport = await read(
    tx,
    "DeliveryImport",
    Prisma.sql`((${inIds("partnerId", partnerId ? [partnerId] : [])}) OR (${inIds(
      "id",
      graph.DeliveryParcel.filter((p) => p.importId).map((p) =>
        String(p.importId),
      ),
    )})) AND NOT EXISTS (SELECT 1 FROM ${tableSql("DeliveryParcel")} p WHERE p."importId"=t.id AND NOT (p.id::text IN (${Prisma.join(parcelIds.length ? parcelIds : [""])})))`,
  );

  graph.DeliveryPushSubscription = await read(
    tx,
    "DeliveryPushSubscription",
    inIds("driverId", account ? [String(account.id)] : []),
  );
  const references = [
    ...graph.DeliveryInvoice,
    ...graph.DeliveryParcel,
    ...(graph.DeliveryPartnerApplication ?? []),
  ].map((r) => String(r.publicId));
  const notificationIds = [
    ...ids(graph.DeliveryInvoiceDispatch, "notificationId"),
    ...ids(graph.DeliveryPaidInvoiceDispatch, "notificationId"),
  ];
  graph.DeliveryNotification = await read(
    tx,
    "DeliveryNotification",
    Prisma.sql`(${inIds("id", notificationIds)}) OR (${account ? Prisma.sql`t.recipient=${String(account.clerkUserId)} AND t.workspace IN ('ACCOUNT',${target.kind === "PARTNER" ? "PARTNER" : "DRIVER"})` : Prisma.sql`false`}) OR (${
      references.length
        ? Prisma.join(
            references.map(
              (ref) => Prisma.sql`position(${ref} in t.message)>0`,
            ),
            " OR ",
          )
        : Prisma.sql`false`
    })`,
  );
  graph.DeliveryPushMessage = await read(
    tx,
    "DeliveryPushMessage",
    Prisma.sql`(${inIds("notificationId", ids(graph.DeliveryNotification))}) OR (${inIds("subscriptionId", ids(graph.DeliveryPushSubscription))})`,
  );
  const files = [
    ...graph.DeliveryReceipt.map((r) => ({
      bucket: "igo-delivery-receipts",
      path: String(r.path),
      // Wait for any reserved upload still inside its 12-second timeout.
      notBefore: new Date(Date.now() + (r.ready ? 0 : 60000)),
    })),
    ...(graph.DeliveryPartnerApplication ?? [])
      .filter((r) => r.logoPath)
      .map((r) => ({
        bucket: "igo-partner-logos",
        path: String(r.logoPath),
        notBefore: new Date(),
      })),
  ];
  const manifest = Object.fromEntries(
    Object.entries(graph).map(([table, rows]) => [
      table,
      ids(rows, primaryKey[table] ?? "id"),
    ]),
  );
  const tokens = [
    ...new Set([
      ...Object.values(manifest).flat(),
      ...references,
      ...(account ? [String(account.clerkUserId)] : []),
    ]),
  ];
  const preview: DeletionPreview = {
    ...target,
    label,
    fingerprint: createHash("sha256").update(stable(graph)).digest("hex"),
    counts: [
      ["Partner accounts", target.kind === "PARTNER" ? 1 : 0],
      ["Business applications", graph.DeliveryPartnerApplication?.length ?? 0],
      ["Rider accounts", target.kind === "RIDER" ? 1 : 0],
      ["Packages", graph.DeliveryParcel.length],
      [
        "Package assignments cleared",
        graph.DeliveryParcelUnassign?.length ?? 0,
      ],
      ["Invoices", invoiceIds.length],
      ["Payment submissions", graph.DeliveryPayment.length],
      ["Paid invoice copies", graph.DeliveryPaidInvoice.length],
      ["Private files", files.length],
      ["Notifications", graph.DeliveryNotification.length],
    ]
      .map(([label, count]) => ({ label: String(label), count: Number(count) }))
      .filter((v) => v.count),
    invoiceTotal: graph.DeliveryInvoice.reduce(
      (sum, i) => sum + Number(i.total),
      0,
    ),
    verifiedPayments: graph.DeliveryPaymentAllocation.reduce(
      (sum, a) => sum + Number(a.amount),
      0,
    ),
    warnings: [
      ...warnings,
      "Linked cached responses are erased and their request keys invalidated. A permanent deletion audit remains.",
    ],
  };
  return { graph, manifest, tokens, files, preview };
}

export async function previewDeletion(actor: Actor, target: Target) {
  requireSuperAdmin(actor, "delete delivery data");
  return database().$transaction(
    async (tx) => (await deletionGraph(tx, target)).preview,
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 20000,
    },
  );
}

export async function deleteDeliveryData(
  actor: Actor,
  key: string,
  input: DeletionInput,
) {
  requireSuperAdmin(actor, "delete delivery data");
  return serialized(
    actor,
    key,
    { type: "deleteDeliveryData", ...input },
    async (tx) => {
      requireSuperAdmin(actor, "delete delivery data");
      // Deletes serialize with one another; serializable isolation/FKs also
      // protect against registration, pickup, invoicing and payment verification.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(819201018::bigint)`;
      const plan = await deletionGraph(tx, input);
      if (plan.preview.fingerprint !== input.fingerprint)
        throw new DeliveryError(
          "These records changed since the deletion preview. Close this window and review a fresh preview.",
          409,
        );
      if (input.confirmation !== plan.preview.label)
        throw new DeliveryError(
          "Type the record name exactly as shown to confirm deletion.",
        );
      const deletionId = randomUUID();
      const [transaction] = await tx.$queryRaw<
        { id: bigint }[]
      >`SELECT txid_current() AS id`;
      await tx.deliveryDeletion.create({
        data: {
          id: deletionId,
          actor: actor.userId,
          kind: input.kind,
          targetId: input.id,
          reason: input.reason,
          manifest: plan.manifest,
          transactionId: transaction.id,
        },
      });
      await tx.$executeRaw`SELECT set_config('igo.deletion_id', ${deletionId}, true)`;
      for (const file of plan.files)
        await tx.deliveryDeletedFile.create({ data: { ...file, deletionId } });
      const cached = await tx.deliveryCommand.updateMany({
        where: {
          invalidated: false,
          OR: [
            { subjects: { isEmpty: true } },
            { subjects: { hasSome: plan.tokens } },
          ],
        },
        data: {
          invalidated: true,
          subjects: [],
          response: { invalidated: true },
        },
      });
      // Preserve completed pickup/delivery attribution while detaching a removed
      // rider's FK. The transaction-bound guard allows only this exact change.
      if (plan.graph.DeliveryParcelUnassign?.length)
        await tx.deliveryParcel.updateMany({
          where: { id: { in: plan.manifest.DeliveryParcelUnassign } },
          data: { driverId: null },
        });
      for (const table of [
        "DeliveryPaidInvoiceDispatch",
        "DeliveryInvoiceDispatch",
        "DeliveryInvoiceEvent",
        "DeliveryPaidInvoice",
        "DeliveryPaymentAllocation",
        "DeliveryPayment",
        "DeliveryInvoiceLine",
        "DeliveryInvoice",
        "DeliveryBillingCycle",
        "DeliveryParcel",
        "DeliveryImport",
        "DeliveryReceipt",
        "DeliveryPushMessage",
        "DeliveryPushSubscription",
        "DeliveryNotification",
        "DeliveryPartner",
        "DeliveryAccount",
        "DeliveryPartnerApplication",
      ]) {
        const keys = plan.manifest[table] ?? [];
        if (keys.length)
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM ${tableSql(table)} t WHERE ${inIds(primaryKey[table] ?? "id", keys)}`,
          );
      }
      await audit(tx, actor, "DATA_PERMANENTLY_DELETED", deletionId, {
        kind: input.kind,
        targetId: input.id,
        reason: input.reason,
        counts: plan.preview.counts,
        invoiceTotal: plan.preview.invoiceTotal,
        verifiedPayments: plan.preview.verifiedPayments,
        cachedResponsesCleared: cached.count,
      });
      return {
        deletionId,
        message: "Records deleted. Related cached responses have been cleared.",
        cachedResponsesCleared: cached.count,
      };
    },
  );
}
