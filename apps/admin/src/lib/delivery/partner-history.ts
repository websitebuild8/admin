import "server-only";
import { z } from "zod";
import { database } from "../db";
import { DeliveryError, requireRole, type Actor } from "./domain";
import { parcelPeriodWhere } from "./reporting-period";
export async function partnerHistory(
  actor: Actor,
  search: URLSearchParams,
  page: number,
) {
  requireRole(actor, "ADMIN");
  const partnerId = z.uuid().parse(search.get("partnerId"));
  const filter = z
    .enum([
      "ALL",
      "REGISTERED",
      "PICKED_UP",
      "DELIVERED",
      "CANCELLED",
      "UNINVOICED",
    ])
    .parse(search.get("filter") || "ALL");
  const db = database();
  const partner = await db.deliveryPartner.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      businessName: true,
      pickupAddress: true,
      pickupArea: true,
      account: { select: { name: true, phone: true, status: true } },
    },
  });
  if (!partner) throw new DeliveryError("Partner not found.", 404);
  const q = search.get("q")?.trim().slice(0, 100);
  const where = {
    partnerId,
    ...parcelPeriodWhere(filter, search),
    ...(filter === "UNINVOICED"
      ? { state: "DELIVERED" as const, invoiceLine: null }
      : filter !== "ALL"
        ? { state: filter }
        : {}),
    ...(q
      ? {
          OR: [
            { publicId: { contains: q, mode: "insensitive" as const } },
            {
              externalReference: { contains: q, mode: "insensitive" as const },
            },
            { recipientName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total, states, eligible, invoices] = await Promise.all([
    db.deliveryParcel.findMany({
      where,
      take: 10,
      skip: (page - 1) * 10,
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        publicId: true,
        externalReference: true,
        recipientName: true,
        destination: true,
        state: true,
        fee: true,
        deliveredAt: true,
        registeredAt: true,
        driver: { select: { name: true } },
        invoiceLine: {
          select: { invoice: { select: { id: true, publicId: true } } },
        },
      },
    }),
    db.deliveryParcel.count({ where }),
    Promise.all(
      ["REGISTERED", "PICKED_UP", "DELIVERED", "CANCELLED"].map(
        async (state) => ({
          state,
          _count: {
            _all: await db.deliveryParcel.count({
              where: {
                partnerId,
                state: state as "REGISTERED",
                ...parcelPeriodWhere(state, search),
              },
            }),
          },
        }),
      ),
    ),
    db.deliveryParcel.aggregate({
      where: { partnerId, state: "DELIVERED", invoiceLine: null },
      _count: { _all: true },
      _sum: { fee: true },
    }),
    db.deliveryInvoice.aggregate({
      where: { partnerId },
      _sum: { total: true, paid: true },
    }),
  ]);
  const count = (state: string) =>
    states.find((row) => row.state === state)?._count._all ?? 0;
  return {
    partner,
    summary: {
      registered: count("REGISTERED"),
      pickedUp: count("PICKED_UP"),
      delivered: count("DELIVERED"),
      cancelled: count("CANCELLED"),
      eligibleCount: eligible._count._all,
      eligibleTotal: eligible._sum.fee ?? 0,
      outstanding: (invoices._sum.total ?? 0) - (invoices._sum.paid ?? 0),
    },
    items,
    total,
    page,
    pageSize: 10,
  };
}
