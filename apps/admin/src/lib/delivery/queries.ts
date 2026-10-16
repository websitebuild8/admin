import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { applicationSelection } from "./partner-applications";

export const parcelSelection = {
  id: true,
  publicId: true,
  externalReference: true,
  recipientName: true,
  recipientPhone: true,
  destination: true,
  zone: true,
  description: true,
  fee: true,
  codAmount: true,
  state: true,
  registeredAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  pickedUpBy: true,
  deliveredBy: true,
  handoverId: true,
  remittanceId: true,
  driverId: true,
  partnerId: true,
  partner: {
    select: {
      businessName: true,
      pickupAddress: true,
      pickupArea: true,
      account: { select: { name: true, phone: true } },
    },
  },
  driver: { select: { name: true } },
  invoiceLine: { select: { invoice: { select: { publicId: true } } } },
} satisfies Prisma.DeliveryParcelSelect;

export async function deliveryQuery(
  actor: Actor,
  resource: string,
  search: URLSearchParams,
) {
  const db = database();
  if (resource === "account")
    return {
      actor,
      application: actor.id
        ? await db.deliveryAccount.findUnique({
            where: { id: actor.id },
            include: { partner: true },
          })
        : null,
    };
  requireRole(actor, "ADMIN", "PARTNER", "DRIVER");
  if (resource === "scheduler") {
    requireRole(actor, "ADMIN");
    const [extension] = await db.$queryRaw<
      { enabled: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS enabled`;
    const overdue = await db.deliveryPartner.count({
      where: {
        nextInvoiceAt: { lte: new Date() },
        account: { status: "APPROVED" },
      },
    });
    if (!extension.enabled)
      return { enabled: false, active: false, overdue, runs: [] };
    const jobs = await db.$queryRaw<
      { active: boolean; schedule: string }[]
    >`SELECT active,schedule FROM cron.job WHERE jobname='igo-delivery-invoices'`;
    const runs = await db.$queryRaw<
      { status: string; start_time: Date; end_time: Date | null }[]
    >`SELECT r.status,r.start_time,r.end_time FROM cron.job_run_details r JOIN cron.job j ON j.jobid=r.jobid WHERE j.jobname='igo-delivery-invoices' ORDER BY r.start_time DESC LIMIT 3`;
    return { enabled: true, active: jobs[0]?.active ?? false, overdue, runs };
  }
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .safeParse(search.get("page") ?? 1);
  if (!parsed.success) throw new DeliveryError("Invalid page.");
  const page = parsed.data,
    take = 10,
    skip = (page - 1) * take;
  if (resource === "applications") {
    requireRole(actor, "ADMIN");
    const [items, total] = await Promise.all([
      db.deliveryPartnerApplication.findMany({
        where: { logoReady: true },
        select: applicationSelection,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryPartnerApplication.count({ where: { logoReady: true } }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        canInvite:
          item.invitationState !== "SENT" ||
          !item.invitationSentAt ||
          Date.now() - item.invitationSentAt.getTime() >= 7 * 86400000,
      })),
      total,
      page,
      pageSize: take,
    };
  }
  const partnerId = actor.role === "PARTNER" ? actor.partnerId! : undefined;
  const scope: Prisma.DeliveryParcelWhereInput =
    actor.role === "DRIVER"
      ? { driverId: actor.id! }
      : partnerId
        ? { partnerId }
        : {};
  if (resource === "overview" || resource === "reports") {
    const [
      registered,
      pickedUp,
      delivered,
      pending,
      unbilled,
      invoices,
      cod,
      driverCash,
      companyCash,
      latest,
      awaitingApproval,
      paymentReview,
    ] = await Promise.all([
      db.deliveryParcel.count({ where: { ...scope, state: "REGISTERED" } }),
      db.deliveryParcel.count({ where: { ...scope, state: "PICKED_UP" } }),
      db.deliveryParcel.count({ where: { ...scope, state: "DELIVERED" } }),
      db.deliveryParcel.aggregate({
        where: { ...scope, state: { in: ["REGISTERED", "PICKED_UP"] } },
        _sum: { fee: true },
      }),
      db.deliveryParcel.aggregate({
        where: { ...scope, state: "DELIVERED", invoiceLine: null },
        _sum: { fee: true },
      }),
      actor.role === "DRIVER"
        ? null
        : db.deliveryInvoice.aggregate({
            where: { partnerId },
            _sum: { total: true, paid: true },
          }),
      db.deliveryParcel.aggregate({
        where: { ...scope, state: "DELIVERED", remittanceId: null },
        _sum: { codAmount: true },
      }),
      db.deliveryParcel.aggregate({
        where: { ...scope, state: "DELIVERED", handoverId: null },
        _sum: { codAmount: true },
      }),
      db.deliveryParcel.aggregate({
        where: {
          ...scope,
          state: "DELIVERED",
          handoverId: { not: null },
          remittanceId: null,
        },
        _sum: { codAmount: true },
      }),
      db.deliveryParcel.findMany({
        where: scope,
        select: parcelSelection,
        take: 5,
        orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      }),
      actor.role === "ADMIN"
        ? Promise.all([
            db.deliveryAccount.count({ where: { status: "PENDING" } }),
            db.deliveryPartnerApplication.count({
              where: { status: "PENDING", logoReady: true },
            }),
          ]).then((counts) => counts[0] + counts[1])
        : 0,
      actor.role === "ADMIN"
        ? db.deliveryPayment.count({ where: { status: "PENDING" } })
        : 0,
    ]);
    return {
      registered,
      pickedUp,
      delivered,
      pendingEstimate: pending._sum.fee ?? 0,
      awaitingBilling: unbilled._sum.fee ?? 0,
      invoiced: invoices?._sum.total ?? 0,
      confirmedPayments: invoices?._sum.paid ?? 0,
      outstanding: (invoices?._sum.total ?? 0) - (invoices?._sum.paid ?? 0),
      codOwed: cod._sum.codAmount ?? 0,
      driverCash: driverCash._sum.codAmount ?? 0,
      companyCash: companyCash._sum.codAmount ?? 0,
      latest,
      awaitingApproval,
      paymentReview,
    };
  }
  if (["packages", "collections", "deliveries", "cod"].includes(resource)) {
    if (resource === "collections" || resource === "deliveries")
      requireRole(actor, "DRIVER");
    const query = search.get("q")?.trim().slice(0, 100);
    const filter = search.get("state");
    const where: Prisma.DeliveryParcelWhereInput = {
      ...scope,
      ...(resource === "collections"
        ? { state: "REGISTERED" }
        : resource === "deliveries"
          ? { state: { in: ["PICKED_UP", "DELIVERED"] } }
          : resource === "cod"
            ? { state: "DELIVERED", codAmount: { gt: 0 } }
            : filter &&
                ["REGISTERED", "PICKED_UP", "DELIVERED", "CANCELLED"].includes(
                  filter,
                )
              ? { state: filter as "REGISTERED" }
              : {}),
      ...(query
        ? {
            OR: [
              { publicId: { contains: query, mode: "insensitive" } },
              { externalReference: { contains: query, mode: "insensitive" } },
              { recipientName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.deliveryParcel.findMany({
        where,
        select: parcelSelection,
        take,
        skip,
        orderBy: [
          { partnerId: "asc" },
          { registeredAt: "desc" },
          { id: "desc" },
        ],
      }),
      db.deliveryParcel.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "partners" || resource === "drivers") {
    requireRole(actor, "ADMIN");
    const where = {
      role:
        resource === "partners" ? ("PARTNER" as const) : ("DRIVER" as const),
    };
    const [items, total] = await Promise.all([
      db.deliveryAccount.findMany({
        where,
        include: { partner: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryAccount.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "invoices") {
    requireRole(actor, "ADMIN", "PARTNER");
    const where = { partnerId };
    const [items, total] = await Promise.all([
      db.deliveryInvoice.findMany({
        where,
        include: {
          cycle: true,
          partner: { select: { businessName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryInvoice.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "invoice") {
    requireRole(actor, "ADMIN", "PARTNER");
    const id = z.uuid().parse(search.get("id"));
    const invoice = await db.deliveryInvoice.findFirst({
      where: { id, partnerId },
      include: {
        cycle: true,
        partner: { select: { businessName: true, pickupAddress: true } },
      },
    });
    if (!invoice) throw new DeliveryError("Invoice not found.", 404);
    const [items, total, payments] = await Promise.all([
      db.deliveryInvoiceLine.findMany({
        where: { invoiceId: id },
        orderBy: { id: "asc" },
        include: {
          parcel: {
            select: {
              publicId: true,
              externalReference: true,
              recipientName: true,
              zone: true,
              deliveredAt: true,
            },
          },
        },
        take,
        skip,
      }),
      db.deliveryInvoiceLine.count({ where: { invoiceId: id } }),
      db.deliveryPayment.findMany({
        where: { invoiceId: id },
        take: 10,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          amount: true,
          confirmedAmount: true,
          status: true,
          bankReference: true,
          createdAt: true,
        },
      }),
    ]);
    return { invoice, items, total, page, pageSize: take, payments };
  }
  if (resource === "payments") {
    requireRole(actor, "ADMIN", "PARTNER");
    const [items, total] = await Promise.all([
      db.deliveryPayment.findMany({
        where: { partnerId },
        include: {
          invoice: { select: { publicId: true, total: true, paid: true } },
          partner: { select: { businessName: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryPayment.count({ where: { partnerId } }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "notifications") {
    const where = { recipient: actor.userId };
    const [items, total, unread] = await Promise.all([
      db.deliveryNotification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryNotification.count({ where }),
      db.deliveryNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, total, unread, page, pageSize: take };
  }
  if (resource === "audit") {
    requireRole(actor, "ADMIN");
    const [items, total] = await Promise.all([
      db.deliveryActivity.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryActivity.count(),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "rates") {
    requireRole(actor, "ADMIN", "PARTNER");
    return { items: await db.deliveryRate.findMany() };
  }
  if (resource === "settings") {
    requireRole(actor, "ADMIN", "PARTNER");
    return {
      settings: await db.deliverySettings.findUnique({
        where: { id: "default" },
      }),
    };
  }
  if (resource === "choices") {
    requireRole(actor, "ADMIN");
    // Searchable selectors are bounded; the management lists remain paginated.
    const q = search.get("q")?.slice(0, 100) ?? "";
    return {
      partners: await db.deliveryPartner.findMany({
        where: {
          account: { status: "APPROVED" },
          businessName: { contains: q, mode: "insensitive" },
        },
        take: 50,
        select: { id: true, businessName: true },
      }),
      drivers: await db.deliveryAccount.findMany({
        where: {
          role: "DRIVER",
          status: "APPROVED",
          name: { contains: q, mode: "insensitive" },
        },
        take: 50,
        select: { id: true, name: true },
      }),
    };
  }
  throw new DeliveryError("Unknown delivery resource.", 404);
}
