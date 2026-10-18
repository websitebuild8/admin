import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Actor } from "../src/lib/delivery/domain";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { invoiceDocument } from "../src/lib/delivery/invoice-document";

type List = {
  items: {
    id: string;
    total?: number;
    paid?: number;
    confirmedAmount?: number;
  }[];
  total: number;
  pageSize: number;
};
export async function verifyReportingPeriods(
  db: PrismaClient,
  admin: Actor,
  ok: (label: string) => void,
) {
  const seed = randomUUID();
  const start = new Date("2024-02-28T19:00:00Z"),
    before = new Date(start.getTime() - 1),
    end = new Date("2024-02-29T19:00:00Z");
  const profile = async (
    name: string,
    role: "PARTNER" | "DRIVER",
    at = start,
  ): Promise<Actor> => {
    const account = await db.deliveryAccount.create({
      data: {
        clerkUserId: `qa_period_${seed}_${name}`,
        name,
        role,
        status: "APPROVED",
        phone: "7771234",
        createdAt: at,
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
      role,
      status: "APPROVED",
      name,
    };
  };
  const [partner, other, rider, otherRider] = await Promise.all([
    profile("partner", "PARTNER"),
    profile("other", "PARTNER", end),
    profile("rider", "DRIVER"),
    profile("other_rider", "DRIVER", end),
  ]);
  const query = <T = List>(actor: Actor, resource: string, params = "") =>
    deliveryQuery(actor, resource, new URLSearchParams(params)) as Promise<T>;
  const day = "period=DAILY&value=2024-02-29",
    month = "period=MONTHLY&value=2024-02",
    year = "period=YEARLY&value=2024";
  const parcel = async (
    owner: Actor,
    driver: Actor,
    state: "REGISTERED" | "PICKED_UP" | "DELIVERED",
    registeredAt: Date,
    at?: Date,
  ) =>
    db.$transaction(
      async (tx) => {
        let item = await tx.deliveryParcel.create({
          data: {
            partnerId: owner.partnerId!,
            driverId: driver.id,
            publicId: `QA-PERIOD-${randomUUID()}`,
            externalReference: randomUUID(),
            recipientName: "QA recipient",
            recipientPhone: "7771234",
            destination: "QA address",
            zone: "MALE",
            origin: "MALE",
            destinationLabel: "Malé",
            fee: 2500,
            registeredAt,
          },
        });
        if (state !== "REGISTERED")
          item = await tx.deliveryParcel.update({
            where: { id: item.id },
            data: {
              state: "PICKED_UP",
              pickedUpAt: state === "DELIVERED" ? registeredAt : at!,
              pickedUpBy: driver.userId,
            },
          });
        if (state === "DELIVERED")
          item = await tx.deliveryParcel.update({
            where: { id: item.id },
            data: { state, deliveredAt: at!, deliveredBy: driver.userId },
          });
        return item;
      },
      { timeout: 20000 },
    );
  const pending = [];
  for (let n = 0; n < 11; n++)
    pending.push(await parcel(partner, rider, "REGISTERED", start));
  const old = await parcel(partner, rider, "REGISTERED", before);
  const picked = await parcel(partner, rider, "PICKED_UP", before, start);
  const delivered = await parcel(partner, rider, "DELIVERED", before, start);
  const next = await parcel(partner, rider, "DELIVERED", before, end);
  const unbilled = await parcel(partner, rider, "DELIVERED", before, start);
  await parcel(other, otherRider, "DELIVERED", before, start);
  const p1 = await query(partner, "packages", `${day}&state=PENDING`),
    p2 = await query(partner, "packages", `${day}&state=PENDING&page=2`);
  assert.equal(p1.total, 11);
  assert.equal(p1.items.length, 10);
  assert.equal(p2.items.length, 1);
  assert(!p1.items.some((p) => p.id === old.id || p.id === picked.id));
  assert.deepEqual(
    (await query(partner, "packages", `${day}&state=PICKED_UP`)).items.map(
      (p) => p.id,
    ),
    [picked.id],
  );
  assert.equal(
    (await query(partner, "packages", `${day}&state=DELIVERED`)).total,
    2,
  );
  assert.equal(
    (await query(partner, "packages", `${month}&state=DELIVERED`)).total,
    2,
  );
  assert.equal(
    (await query(partner, "packages", `${year}&state=DELIVERED`)).total,
    3,
  );
  assert.equal(
    (
      await query(
        partner,
        "packages",
        `period=YEARLY&value=2023&state=DELIVERED`,
      )
    ).total,
    0,
  );
  ok(
    "day/month/year package filters use registration, pickup or delivery dates, enforce midnight boundaries, retain ten-row pagination and exclude other partners",
  );

  const issue = async (item: typeof delivered, createdAt: Date) =>
    db.$transaction((tx) =>
      tx.deliveryInvoice.create({
        data: {
          partnerId: item.partnerId,
          publicId: `QA-PERIOD-INV-${randomUUID()}`,
          total: 2500,
          createdAt,
          manualCutoffAt: new Date(end.getTime() + 1000),
          lines: { create: { parcelId: item.id, amount: 2500 } },
        },
      }),
    );
  const invoice = await issue(delivered, start),
    later = await issue(next, end);
  const receipt = await db.deliveryReceipt.create({
    data: {
      partnerId: partner.partnerId!,
      path: `qa/${randomUUID()}.webp`,
      sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      bytes: 100,
      ready: true,
    },
  });
  const payment = await db.$transaction((tx) =>
    tx.deliveryPayment.create({
      data: {
        partnerId: partner.partnerId!,
        invoiceId: invoice.id,
        receiptId: receipt.id,
        bankReference: randomUUID(),
        amount: 2500,
        createdAt: start,
      },
    }),
  );
  await db.$transaction(async (tx) => {
    await tx.deliveryPayment.update({
      where: { id: payment.id },
      data: {
        status: "PARTIAL",
        confirmedAmount: 1000,
        reviewedAt: end,
        reviewedBy: admin.userId,
        reviewNote: "QA date fixture",
      },
    });
    await tx.deliveryPaymentAllocation.create({
      data: { paymentId: payment.id, invoiceId: invoice.id, amount: 1000 },
    });
    await tx.deliveryInvoice.update({
      where: { id: invoice.id },
      data: { paid: 1000 },
    });
  });
  const bills = await query(
    partner,
    "invoices",
    `${day}&state=OUTSTANDING&partnerId=${other.partnerId}`,
  );
  assert.deepEqual(
    bills.items.map((i) => i.id),
    [invoice.id],
  );
  assert.equal(bills.items[0].paid, 1000);
  assert.equal((await query(partner, "invoices", year)).total, 2);
  assert.equal(
    (await query(partner, "payments", day)).items[0].confirmedAmount,
    1000,
  );
  assert.equal(
    (await query(partner, "payments", `period=MONTHLY&value=2024-03`)).total,
    0,
  );
  type Summary = {
    registered: number;
    pickedUp: number;
    delivered: number;
    outstanding: number;
    invoiced: number;
    confirmedPayments: number;
    awaitingBilling: number;
  };
  const summary = await query<Summary>(partner, "overview", day);
  assert.equal(summary.registered, 11);
  assert.equal(summary.pickedUp, 0);
  assert.equal(summary.delivered, 2);
  assert.equal(summary.outstanding, 4000);
  assert.equal(summary.invoiced, 2500);
  assert.equal(summary.confirmedPayments, 0);
  assert.equal(summary.awaitingBilling, 2500);
  assert.equal(
    (await query<Summary>(partner, "overview", "period=MONTHLY&value=2024-03"))
      .confirmedPayments,
    1000,
  );
  assert.equal(
    (await query<Summary>(partner, "overview", "period=YEARLY&value=2023"))
      .outstanding,
    4000,
  );
  const document = await invoiceDocument(partner, invoice.id);
  assert.equal(document.total, 2500);
  assert.equal(document.paid, 1000);
  assert.equal(document.lines.length, 1);
  ok(
    "invoice/payment filters use issue/submission dates, preserve complete documents and verified amounts, and never hide older debt from total balance due",
  );

  type Snapshot = {
    work: List;
    summary: {
      collections: number;
      onBoard: number;
      delivered: number;
      deliveredToday: number;
    };
  };
  const work = (screen: string, range = day) =>
    query<Snapshot>(rider, "rider-workspace", `screen=${screen}&${range}`);
  assert.equal((await work("collections")).work.total, 11);
  assert.equal((await work("collections")).summary.collections, 11);
  assert.deepEqual(
    (await work("deliveries")).work.items.map((p) => p.id),
    [picked.id],
  );
  assert.equal((await work("history")).work.total, 2);
  assert.equal((await work("history")).summary.delivered, 2);
  assert.equal((await work("history", year)).work.total, 3);
  assert.equal((await query(rider, "available", day)).total, 0);
  ok(
    "rider collection, on-board and delivery summaries reconcile with date-filtered work lists and preserve rider isolation",
  );

  type History = {
    total: number;
    summary: {
      eligibleCount: number;
      eligibleTotal: number;
      outstanding: number;
      delivered: number;
    };
  };
  const history = await query<History>(
    admin,
    "partner-history",
    `partnerId=${partner.partnerId}&filter=UNINVOICED&${day}`,
  );
  assert.equal(history.total, 1);
  assert.equal(history.summary.delivered, 2);
  assert.equal(history.summary.outstanding, 4000);
  assert.equal(history.summary.eligibleCount, 1);
  assert.equal(history.summary.eligibleTotal, 2500);
  const emptyHistory = await query<History>(
    admin,
    "partner-history",
    `partnerId=${partner.partnerId}&filter=UNINVOICED&period=YEARLY&value=2023`,
  );
  assert.equal(emptyHistory.total, 0);
  assert.equal(emptyHistory.summary.eligibleCount, 1);
  assert.equal(emptyHistory.summary.outstanding, 4000);
  await assert.rejects(
    query(partner, "partner-history", `partnerId=${other.partnerId}&${day}`),
    { status: 403 },
  );
  const events = await query(
    partner,
    "invoice-history",
    `id=${invoice.id}&${day}`,
  );
  assert.deepEqual(
    new Set(events.items.map((event) => event.id)),
    new Set([`issued:${invoice.id}`, `submitted:${payment.id}`]),
  );
  assert.equal(
    (
      await query(
        partner,
        "invoice-history",
        `id=${invoice.id}&period=MONTHLY&value=2024-03`,
      )
    ).total,
    1,
  );
  assert.equal(
    (await query(partner, "invoice-payments", `id=${invoice.id}&${day}`)).total,
    1,
  );
  await assert.rejects(
    query(other, "invoice-history", `id=${invoice.id}&${day}`),
    { status: 404 },
  );
  ok(
    "nested partner/invoice histories filter events and transfers while full invoice-generation eligibility and account debt remain independent of the display period",
  );

  const app = await db.deliveryPartnerApplication.create({
    data: {
      publicId: `QA-PERIOD-APP-${seed}`,
      requestKey: randomUUID(),
      digest: seed,
      email: `qa-${seed}@example.test`,
      ownerName: "QA owner",
      phone: "7771234",
      businessName: "QA business",
      businessType: "BUSINESS",
      pageUrl: "",
      pickupAddress: "QA address",
      pickupArea: "Malé",
      operatingLocation: "MALE",
      dailyDeliveries: 5,
      submittedAt: start,
      createdAt: before,
    },
  });
  await db.deliveryAdminGrant.create({
    data: {
      clerkUserId: `qa_period_admin_${seed}`,
      email: `admin-${seed}@example.test`,
      name: "QA administrator",
      grantedBy: admin.userId,
      grantedAt: start,
    },
  });
  await db.deliveryNotification.createMany({
    data: [
      {
        recipient: partner.userId,
        workspace: "PARTNER",
        title: "QA period notice",
        message: "QA",
        createdAt: start,
      },
      {
        recipient: partner.userId,
        workspace: "ADMIN",
        title: "Private admin notice",
        message: "QA",
        createdAt: start,
      },
      {
        recipient: partner.userId,
        workspace: "PARTNER",
        title: "Next-day notice",
        message: "QA",
        createdAt: end,
      },
    ],
  });
  const event = await db.deliveryActivity.create({
    data: {
      actor: admin.userId,
      role: "ADMIN",
      kind: "PERIOD_QA",
      detail: {},
      createdAt: start,
    },
  });
  assert(
    (await query(admin, "partners", day)).items.some(
      (a) => a.id === partner.id,
    ),
  );
  assert(
    !(await query(admin, "partners", day)).items.some((a) => a.id === other.id),
  );
  assert(
    (await query(admin, "drivers", day)).items.some((a) => a.id === rider.id),
  );
  assert(
    !(await query(admin, "drivers", day)).items.some(
      (a) => a.id === otherRider.id,
    ),
  );
  assert(
    (await query(admin, "applications", day)).items.some(
      (a) => a.id === app.id,
    ),
  );
  assert((await query(admin, "administrators", day)).items.length > 0);
  assert.equal((await query(partner, "notifications", day)).total, 1);
  assert.equal((await query(other, "notifications", day)).total, 0);
  assert(
    (await query(admin, "audit", day)).items.some((a) => a.id === event.id),
  );
  for (const resource of [
    "partners",
    "drivers",
    "applications",
    "administrators",
    "audit",
  ])
    await assert.rejects(query(partner, resource, day), { status: 403 });
  for (const resource of ["packages", "invoices", "payments", "notifications"])
    await assert.rejects(
      query(partner, resource, "period=DAILY&value=2024-02-30"),
    );
  await assert.rejects(
    query(rider, "rider-workspace", "screen=history&period=YEARLY&value=2999"),
  );
  assert.equal(
    (await db.deliveryInvoice.findUniqueOrThrow({ where: { id: later.id } }))
      .paid,
    0,
  );
  assert.equal(
    (await db.deliveryParcel.findUniqueOrThrow({ where: { id: unbilled.id } }))
      .state,
    "DELIVERED",
  );
  ok(
    "account/application/admin/notification/activity lists filter their correct timestamps, retain authorization and reject invalid periods without modifying operational records",
  );
}
