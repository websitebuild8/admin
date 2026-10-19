import "server-only";
import { deliveryEarnings } from "./earnings";
import { overviewSummary } from "./overview-summary";
import { recentParcels } from "./recent-parcels";
import { administrators } from "./admin-access";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { riderScreens, riderStage } from "./rider-contract";
import { riderClientConfig } from "./push-settings";
import { applicationSelection } from "./partner-applications";
import { storageConfigurationStatus } from "../storage-configuration";
import { partnerHistory } from "./partner-history";
import { invoiceRecords } from "./invoice-history";
import {
  invoiceFilter,
  maldivesToday,
  packageFilterWhere,
} from "./dashboard-filters";
import {
  dateFilter,
  parcelPeriodWhere,
  reportingRange,
} from "./reporting-period";

export const parcelSelection = {
  id: true,
  publicId: true,
  externalReference: true,
  recipientName: true,
  recipientPhone: true,
  destination: true,
  zone: true,
  origin: true,
  destinationLabel: true,
  description: true,
  fee: true,
  state: true,
  registeredAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  pickedUpBy: true,
  deliveredBy: true,
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
): Promise<unknown> {
  if (["finance", "finance-summary", "finance-partners"].includes(resource)) {
    const { financeQuery } = await import("./finance");
    return financeQuery(actor, resource, search);
  }
  if (resource === "earnings") return deliveryEarnings(actor, search);
  if (resource === "storage-status") {
    requireRole(actor, "ADMIN");
    return storageConfigurationStatus(process.env);
  }
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
  const range = dateFilter(search);
  if (resource === "rider-summary") {
    requireRole(actor, "DRIVER");
    const where = { driverId: actor.id! };
    const today = maldivesToday();
    const [collections, onBoard, deliveredToday, available, delivered] =
      await Promise.all([
        db.deliveryParcel.count({
          where: { ...where, state: "REGISTERED", registeredAt: range },
        }),
        db.deliveryParcel.count({
          where: { ...where, state: "PICKED_UP", pickedUpAt: range },
        }),
        db.deliveryParcel.count({
          where: { ...where, state: "DELIVERED", deliveredAt: today },
        }),
        db.deliveryParcel.count({
          where: {
            state: "REGISTERED",
            driverId: null,
            partner: { account: { status: "APPROVED" } },
            registeredAt: range,
          },
        }),
        db.deliveryParcel.count({
          where: { ...where, state: "DELIVERED", deliveredAt: range },
        }),
      ]);
    return {
      collections,
      onBoard,
      deliveredToday,
      delivered,
      available,
    };
  }
  if (resource === "rider-workspace") {
    requireRole(actor, "DRIVER");
    const screen = z
      .enum([...riderScreens, "available", "deliveries"])
      .parse(search.get("screen") ?? "collections");
    const workSearch = new URLSearchParams(search);
    const workResource =
      screen === "history"
        ? "deliveries"
        : screen === "collections"
          ? "rider-work"
          : screen;
    if (screen === "history") workSearch.set("state", "DELIVERED");
    if (screen !== "history" && workSearch.get("period") === "TODAY") {
      workSearch.delete("period");
      workSearch.delete("value");
    }
    if (screen === "deliveries") workSearch.set("state", "PICKED_UP");
    const [summary, work, notices] = await Promise.all([
      deliveryQuery(actor, "rider-summary", workSearch),
      deliveryQuery(actor, workResource, workSearch),
      deliveryQuery(actor, "notifications", new URLSearchParams("page=1")),
    ]);
    return { summary, work, notices, config: riderClientConfig() };
  }
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
  if (resource === "administrators") return administrators(actor, page, search);
  if (resource === "invoice-history" || resource === "invoice-payments")
    return invoiceRecords(actor, resource, search, page);
  if (resource === "partner-history")
    return partnerHistory(actor, search, page);
  if (resource === "applications") {
    requireRole(actor, "ADMIN");
    const [items, total] = await Promise.all([
      db.deliveryPartnerApplication.findMany({
        where: { submittedAt: { not: null, ...range } },
        select: applicationSelection,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryPartnerApplication.count({
        where: { submittedAt: { not: null, ...range } },
      }),
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
  const partnerId =
    actor.role === "PARTNER"
      ? actor.partnerId!
      : actor.role === "ADMIN" &&
          resource === "invoices" &&
          search.get("partnerId")
        ? z.uuid().parse(search.get("partnerId"))
        : undefined;
  const scope: Prisma.DeliveryParcelWhereInput =
    actor.role === "DRIVER"
      ? { driverId: actor.id! }
      : partnerId
        ? { partnerId }
        : {};
  if (resource === "overview" || resource === "reports") {
    const [summary, latest] = await Promise.all([
      overviewSummary(actor, range),
      recentParcels(actor, range),
    ]);
    return { ...summary, latest, periodLabel: reportingRange(search).label };
  }

  if (resource === "rider-work") {
    requireRole(actor, "DRIVER");
    const stage = riderStage(search.get("stage"));
    const query = search.get("q")?.trim().slice(0, 100);
    const available: Prisma.DeliveryParcelWhereInput = {
      state: "REGISTERED",
      driverId: null,
      partner: { account: { status: "APPROVED" } },
    };
    const assigned: Prisma.DeliveryParcelWhereInput = {
      driverId: actor.id!,
      state: { in: ["REGISTERED", "PICKED_UP"] },
    };
    const where: Prisma.DeliveryParcelWhereInput = {
      AND: [
        stage === "AVAILABLE"
          ? available
          : stage === "TO_PICKUP"
            ? { ...assigned, state: "REGISTERED" }
            : stage === "TO_DELIVER"
              ? { ...assigned, state: "PICKED_UP" }
              : { OR: [available, assigned] },
        {
          OR: [
            { state: "REGISTERED", registeredAt: range },
            { state: "PICKED_UP", pickedUpAt: range },
          ],
        },
        ...(query
          ? [
              {
                OR: [
                  {
                    publicId: { contains: query, mode: "insensitive" as const },
                  },
                  {
                    partner: {
                      businessName: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                  {
                    destination: {
                      contains: query,
                      mode: "insensitive" as const,
                    },
                  },
                  // Searching must not reveal an unclaimed customer's identity either.
                  {
                    driverId: actor.id!,
                    OR: [
                      {
                        externalReference: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        recipientName: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const [rows, total] = await Promise.all([
      db.deliveryParcel.findMany({
        where,
        select: parcelSelection,
        take,
        skip,
        orderBy: [{ registeredAt: "asc" }, { id: "asc" }],
      }),
      db.deliveryParcel.count({ where }),
    ]);
    const items = rows.map((p) =>
      p.driverId === actor.id
        ? { ...p, available: false }
        : {
            available: true,
            state: "REGISTERED",
            id: p.id,
            publicId: p.publicId,
            partnerId: p.partnerId,
            zone: p.zone,
            destinationLabel: p.destinationLabel,
            destination: p.destination,
            registeredAt: p.registeredAt,
            partner: {
              businessName: p.partner.businessName,
              pickupAddress: p.partner.pickupAddress,
              pickupArea: p.partner.pickupArea,
            },
          },
    );
    return { items, total, page, pageSize: take };
  }
  if (resource === "available") {
    requireRole(actor, "DRIVER");
    const where: Prisma.DeliveryParcelWhereInput = {
      state: "REGISTERED",
      driverId: null,
      partner: { account: { status: "APPROVED" } },
      registeredAt: range,
    };
    // Recipient identity and phone are disclosed only after an approved rider claims the job.
    const [items, total] = await Promise.all([
      db.deliveryParcel.findMany({
        where,
        select: {
          id: true,
          publicId: true,
          zone: true,
          destinationLabel: true,
          destination: true,
          registeredAt: true,
          partner: {
            select: {
              businessName: true,
              pickupAddress: true,
              pickupArea: true,
            },
          },
        },
        orderBy: [{ registeredAt: "asc" }, { id: "asc" }],
        take,
        skip,
      }),
      db.deliveryParcel.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "quote-options") {
    requireRole(actor, "ADMIN", "PARTNER");
    const id =
      actor.role === "PARTNER"
        ? actor.partnerId!
        : z.uuid().parse(search.get("partnerId"));
    const partner = await db.deliveryPartner.findUnique({
      where: { id },
      select: { operatingLocation: true, businessName: true },
    });
    if (!partner) throw new DeliveryError("Partner not found.", 404);
    const rates = partner.operatingLocation
      ? await db.deliveryRate.findMany({
          where: {
            origin: partner.operatingLocation,
            destination: { active: true },
          },
          include: { destination: true },
          orderBy: { zone: "asc" },
        })
      : [];
    return { partner, rates };
  }
  if (["packages", "collections", "deliveries"].includes(resource)) {
    if (resource === "collections" || resource === "deliveries")
      requireRole(actor, "DRIVER");
    const query = search.get("q")?.trim().slice(0, 100);
    const filter = search.get("state");
    const where: Prisma.DeliveryParcelWhereInput = {
      ...scope,
      ...(resource === "collections"
        ? { state: "REGISTERED" }
        : resource === "deliveries"
          ? {
              state:
                filter === "PICKED_UP" || filter === "DELIVERED"
                  ? filter
                  : { in: ["PICKED_UP", "DELIVERED"] },
            }
          : packageFilterWhere(filter)),
      ...parcelPeriodWhere(
        resource === "collections" ? "REGISTERED" : filter,
        search,
      ),
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
      createdAt: range,
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
    const where: Prisma.DeliveryInvoiceWhereInput = {
      partnerId,
      createdAt: range,
      ...(invoiceFilter(search.get("state")) === "OUTSTANDING"
        ? { paid: { lt: db.deliveryInvoice.fields.total } }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.deliveryInvoice.findMany({
        where,
        include: {
          cycle: true,
          dispatch: { select: { sentAt: true } },
          paidInvoice: {
            select: { paidAt: true, dispatch: { select: { sentAt: true } } },
          },
          partner: { select: { businessName: true } },
          _count: {
            select: { lines: true, payments: { where: { status: "PENDING" } } },
          },
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
        dispatch: { select: { sentAt: true } },
        paidInvoice: {
          select: { paidAt: true, dispatch: { select: { sentAt: true } } },
        },
        partner: { select: { businessName: true, pickupAddress: true } },
        _count: { select: { payments: { where: { status: "PENDING" } } } },
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
        where: { partnerId, createdAt: range },
        include: {
          invoice: { select: { publicId: true, total: true, paid: true } },
          partner: { select: { businessName: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryPayment.count({ where: { partnerId, createdAt: range } }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "notifications") {
    const where = {
      recipient: actor.userId,
      workspace: { in: ["ACCOUNT", actor.role] },
      createdAt: range,
    };
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
        where: { createdAt: range },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      db.deliveryActivity.count({ where: { createdAt: range } }),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "rates") {
    requireRole(actor, "ADMIN");
    const [items, total] = await Promise.all([
      db.deliveryRate.findMany({
        include: { destination: true },
        orderBy: [{ origin: "asc" }, { zone: "asc" }],
        take,
        skip,
      }),
      db.deliveryRate.count(),
    ]);
    return { items, total, page, pageSize: take };
  }
  if (resource === "destinations") {
    requireRole(actor, "ADMIN");
    const [items, total] = await Promise.all([
      db.deliveryDestination.findMany({ orderBy: { code: "asc" }, take, skip }),
      db.deliveryDestination.count(),
    ]);
    return { items, total, page, pageSize: take };
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
    const [partners, drivers] = await Promise.all([
      db.deliveryPartner.findMany({
        where: {
          account: { status: "APPROVED" },
          businessName: { contains: q, mode: "insensitive" },
        },
        take: 50,
        select: { id: true, businessName: true },
      }),
      db.deliveryAccount.findMany({
        where: {
          role: "DRIVER",
          status: "APPROVED",
          name: { contains: q, mode: "insensitive" },
        },
        take: 50,
        select: { id: true, name: true },
      }),
    ]);
    return { partners, drivers };
  }
  throw new DeliveryError("Unknown delivery resource.", 404);
}
