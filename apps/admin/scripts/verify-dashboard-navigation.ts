import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Actor } from "../src/lib/delivery/domain";
import { maldivesToday } from "../src/lib/delivery/dashboard-filters";
import { deliveryQuery } from "../src/lib/delivery/queries";

type List = {
  items: {
    id: string;
    state?: string;
    partnerId?: string;
    total?: number;
    paid?: number;
  }[];
  total: number;
  pageSize: number;
};
export async function verifyDashboardNavigation(
  db: PrismaClient,
  admin: Actor,
  ok: (label: string) => void,
) {
  const prefix = `qa_cards_${randomUUID()}`;
  const profile = async (
    name: string,
    role: "PARTNER" | "DRIVER",
  ): Promise<Actor> => {
    const account = await db.deliveryAccount.create({
      data: {
        clerkUserId: `${prefix}_${name}`,
        name,
        phone: "7771234",
        role,
        status: "APPROVED",
        ...(role === "PARTNER"
          ? {
              partner: {
                create: {
                  businessName: name,
                  pickupAddress: "QA pickup address",
                  pickupArea: "Malé",
                  operatingLocation: "MALE",
                  pageUrl: "",
                },
              },
            }
          : {}),
      },
      include: { partner: true },
    });
    return {
      userId: account.clerkUserId,
      id: account.id,
      partnerId: account.partner?.id ?? null,
      name,
      role,
      status: "APPROVED",
    };
  };
  const [partner, other, rider, otherRider] = await Promise.all([
    profile("partner", "PARTNER"),
    profile("other_partner", "PARTNER"),
    profile("rider", "DRIVER"),
    profile("other_rider", "DRIVER"),
  ]);
  const day = maldivesToday();
  const early = new Date(day.gte.getTime() - 172800000);
  async function parcel(
    owner: Actor,
    driver: Actor,
    state: "REGISTERED" | "PICKED_UP" | "DELIVERED" | "CANCELLED",
    at?: Date,
  ) {
    return db.$transaction(
      async (tx) => {
        let item = await tx.deliveryParcel.create({
          data: {
            partnerId: owner.partnerId!,
            driverId: driver.id!,
            publicId: `${prefix}_${randomUUID()}`,
            externalReference: randomUUID(),
            recipientName: "QA recipient",
            recipientPhone: "7771234",
            destination: "QA delivery address",
            zone: "MALE",
            destinationLabel: "Malé",
            origin: "MALE",
            fee: 2500,
            registeredAt: early,
          },
        });
        if (state === "PICKED_UP" || state === "DELIVERED")
          item = await tx.deliveryParcel.update({
            where: { id: item.id },
            data: {
              state: "PICKED_UP",
              pickedUpAt: early,
              pickedUpBy: driver.userId,
            },
          });
        if (state === "DELIVERED")
          item = await tx.deliveryParcel.update({
            where: { id: item.id },
            data: { state, deliveredAt: at!, deliveredBy: driver.userId },
          });
        if (state === "CANCELLED")
          item = await tx.deliveryParcel.update({
            where: { id: item.id },
            data: { state },
          });
        return item;
      },
      { timeout: 20000 },
    );
  }
  const registered = [];
  for (let index = 0; index < 11; index++)
    registered.push(await parcel(partner, rider, "REGISTERED"));
  const picked = await parcel(partner, rider, "PICKED_UP");
  await parcel(partner, rider, "CANCELLED");
  const yesterday = await parcel(
    partner,
    rider,
    "DELIVERED",
    new Date(day.gte.getTime() - 1),
  );
  const midnight = await parcel(partner, rider, "DELIVERED", day.gte);
  const lastToday = await parcel(
    partner,
    rider,
    "DELIVERED",
    new Date(day.lt.getTime() - 1),
  );
  const tomorrow = await parcel(partner, rider, "DELIVERED", day.lt);
  const foreignPending = await parcel(other, otherRider, "REGISTERED");
  const foreignDelivered = await parcel(
    other,
    otherRider,
    "DELIVERED",
    day.gte,
  );
  const query = (actor: Actor, resource: string, parameters = "") =>
    deliveryQuery(
      actor,
      resource,
      new URLSearchParams(parameters),
    ) as Promise<List>;
  const pendingPage = await query(partner, "packages", "state=PENDING");
  const pendingNext = await query(partner, "packages", "state=PENDING&page=2");
  assert.equal(pendingPage.total, 12);
  assert.equal(pendingPage.items.length, 10);
  assert.equal(pendingPage.pageSize, 10);
  assert.equal(pendingNext.items.length, 2);
  assert.deepEqual(
    new Set([...pendingPage.items, ...pendingNext.items].map((p) => p.id)),
    new Set([...registered, picked].map((p) => p.id)),
  );
  assert(
    !(
      await query(
        partner,
        "packages",
        `state=PENDING&partnerId=${other.partnerId}`,
      )
    ).items.some((p) => p.id === foreignPending.id),
  );
  const adminPending = await query(
    admin,
    "packages",
    `state=PENDING&q=${prefix}`,
  );
  assert.equal(adminPending.total, 13);
  ok(
    "pending-card filters include both registered and picked-up packages, paginate ten, and keep partner scope even with a forged partnerId",
  );

  async function invoice(item: typeof yesterday, paid: number) {
    const record = await db.$transaction((tx) =>
      tx.deliveryInvoice.create({
        data: {
          partnerId: item.partnerId,
          publicId: `${prefix}_${randomUUID()}`,
          total: 2500,
          manualCutoffAt: new Date(day.lt.getTime() + 1000),
          lines: { create: { parcelId: item.id, amount: 2500 } },
        },
      }),
    );
    const receipt = await db.deliveryReceipt.create({
      data: {
        partnerId: item.partnerId,
        path: `qa/${randomUUID()}.webp`,
        sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        bytes: 100,
        ready: true,
      },
    });
    const payment = await db.$transaction((tx) =>
      tx.deliveryPayment.create({
        data: {
          partnerId: item.partnerId,
          invoiceId: record.id,
          receiptId: receipt.id,
          bankReference: randomUUID(),
          amount: 2500,
        },
      }),
    );
    if (paid)
      await db.$transaction(async (tx) => {
        await tx.deliveryPayment.update({
          where: { id: payment.id },
          data: {
            status: paid === 2500 ? "CONFIRMED" : "PARTIAL",
            confirmedAmount: paid,
            reviewedAt: new Date(),
            reviewedBy: admin.userId,
            reviewNote: "QA card fixture",
          },
        });
        await tx.deliveryPaymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: record.id, amount: paid },
        });
        await tx.deliveryInvoice.update({
          where: { id: record.id },
          data: { paid },
        });
      });
    return record;
  }
  const unpaid = await invoice(yesterday, 0);
  const partial = await invoice(midnight, 1000);
  const settled = await invoice(lastToday, 2500);
  const foreignInvoice = await invoice(foreignDelivered, 0);
  const awaiting = await query(partner, "packages", "state=UNINVOICED");
  assert.deepEqual(
    awaiting.items.map((p) => p.id),
    [tomorrow.id],
  );
  assert.equal((await query(partner, "packages", "state=DELIVERED")).total, 4);
  assert.equal(
    (
      await query(
        partner,
        "packages",
        `state=UNINVOICED&q=${tomorrow.externalReference}`,
      )
    ).total,
    1,
  );
  ok(
    "delivered and awaiting-billing cards distinguish invoiced packages, combine with search, and never return another partner's packages",
  );

  const outstanding = await query(
    partner,
    "invoices",
    `state=OUTSTANDING&partnerId=${other.partnerId}`,
  );
  assert.deepEqual(
    new Set(outstanding.items.map((i) => i.id)),
    new Set([unpaid.id, partial.id]),
  );
  assert(
    !outstanding.items.some(
      (i) => i.id === settled.id || i.id === foreignInvoice.id,
    ),
  );
  assert.equal(outstanding.total, 2);
  const all = await query(partner, "invoices");
  assert.equal(all.total, 3);
  const adminDue = await query(
    admin,
    "invoices",
    `state=OUTSTANDING&partnerId=${other.partnerId}`,
  );
  assert.deepEqual(
    adminDue.items.map((i) => i.id),
    [foreignInvoice.id],
  );
  await assert.rejects(query(rider, "invoices", "state=OUTSTANDING"), {
    status: 403,
  });
  ok(
    "balance-due cards list unpaid and partially paid invoices, retain pending-receipt debt, exclude fully paid bills, and enforce tenant/role access",
  );

  const work = (screen: string, period = "") =>
    deliveryQuery(
      rider,
      "rider-workspace",
      new URLSearchParams({ screen, period, stage: "TO_PICKUP" }),
    ) as Promise<{
      work: List;
      summary: { collections: number; onBoard: number; deliveredToday: number };
    }>;
  const [collections, onBoard, today, history] = await Promise.all([
    work("collections", "TODAY"),
    work("deliveries", "TODAY"),
    work("history", "TODAY"),
    work("history"),
  ]);
  assert.equal(collections.work.total, 11);
  assert.deepEqual(
    onBoard.work.items.map((p) => p.id),
    [picked.id],
  );
  assert.equal(today.summary.deliveredToday, 2);
  assert.deepEqual(
    new Set(today.work.items.map((p) => p.id)),
    new Set([midnight.id, lastToday.id]),
  );
  assert.equal(history.work.total, 4);
  await assert.rejects(work("history", "INVALID"));
  for (const result of [collections, onBoard, today, history])
    assert(
      !result.work.items.some(
        (p) => p.id === foreignDelivered.id || p.id === foreignPending.id,
      ),
    );
  ok(
    "rider cards match collections, on-board work and today's history across Maldives midnight; all-time history remains available and other riders stay private",
  );

  const overview = (await deliveryQuery(
    partner,
    "overview",
    new URLSearchParams(),
  )) as {
    outstanding: number;
    registered: number;
    pickedUp: number;
    delivered: number;
    awaitingBilling: number;
  };
  assert.equal(
    overview.outstanding,
    outstanding.items.reduce(
      (sum, invoice) => sum + invoice.total! - invoice.paid!,
      0,
    ),
  );
  assert.equal(overview.registered + overview.pickedUp, pendingPage.total);
  assert.equal(overview.delivered, 4);
  assert.equal(overview.awaitingBilling, 2500);
  ok(
    "dashboard amounts reconcile with destination-list counts and balances without changing package, delivery or payment status",
  );
}
