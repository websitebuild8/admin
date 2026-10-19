import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { riderInitialData } from "../src/lib/delivery/initial-data";
import { localDate, type Actor } from "../src/lib/delivery/domain";
import type { RiderWorkItem } from "../src/lib/delivery/rider-contract";

export async function verifyRiderCollect(
  db: PrismaClient,
  admin: Actor,
  ok: (label: string) => void,
) {
  const seed = randomUUID(),
    prefix = `QA-COLLECT-${seed}`;
  async function account(
    role: "PARTNER" | "DRIVER",
    status: "APPROVED" | "PENDING" = "APPROVED",
  ): Promise<Actor> {
    const a = await db.deliveryAccount.create({
      data: {
        clerkUserId: `qa_collect_${randomUUID()}`,
        role,
        status,
        name: "Collect QA",
        phone: "7771234",
        ...(role === "PARTNER"
          ? {
              partner: {
                create: {
                  businessName: "Collect QA business",
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
      userId: a.clerkUserId,
      id: a.id,
      partnerId: a.partner?.id ?? null,
      role,
      status,
      name: a.name,
    };
  }
  const [partner, pending, rider, other] = await Promise.all([
    account("PARTNER"),
    account("PARTNER", "PENDING"),
    account("DRIVER"),
    account("DRIVER"),
  ]);
  const make = (
    n: number,
    partnerId = partner.partnerId!,
    driverId: string | null = null,
  ) => ({
    id: randomUUID(),
    publicId: `${prefix}-${n}`,
    externalReference: `${prefix}-${n}`,
    partnerId,
    driverId,
    recipientName: `PRIVATE-CUSTOMER-${n}-${seed}`,
    recipientPhone: "7771234",
    destination: "QA delivery address",
    zone: "MALE",
    origin: "MALE",
    destinationLabel: "Malé",
    fee: 2500,
  });
  const available = Array.from({ length: 13 }, (_, n) => make(n));
  const assigned = [
    make(20, partner.partnerId!, rider.id),
    make(21, partner.partnerId!, rider.id),
    make(22, partner.partnerId!, rider.id),
  ];
  const foreign = make(30, partner.partnerId!, other.id),
    unapproved = make(31, pending.partnerId!);
  await db.deliveryParcel.createMany({
    data: [...available, ...assigned, foreign, unapproved],
  });
  const cmd = (who: Actor, command: Parameters<typeof deliveryCommand>[2]) =>
    deliveryCommand(who, randomUUID(), command);
  await cmd(rider, {
    type: "pickup",
    parcelIds: [assigned[1].id, assigned[2].id],
  });
  await cmd(rider, { type: "deliver", parcelId: assigned[2].id });
  const query = (who: Actor, params: Record<string, string> = {}) =>
    deliveryQuery(
      who,
      "rider-work",
      new URLSearchParams({ q: prefix, ...params }),
    ) as Promise<{ items: RiderWorkItem[]; total: number; pageSize: number }>;
  const [first, second] = await Promise.all([
    query(rider),
    query(rider, { page: "2" }),
  ]);
  assert.equal(first.total, 15);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 5);
  assert.equal(
    new Set([...first.items, ...second.items].map((p) => p.id)).size,
    15,
  );
  assert(
    ![...first.items, ...second.items].some((p) =>
      [foreign.id, unapproved.id, assigned[2].id].some((id) => id === p.id),
    ),
  );
  ok(
    "Collect combines available and own active jobs with stable ten-row pagination, excluding other riders, completed work and unapproved businesses",
  );
  const jobs = await query(rider, { stage: "AVAILABLE" });
  assert.equal(jobs.total, 13);
  for (const p of jobs.items) {
    assert(p.available);
    for (const key of [
      "recipientName",
      "recipientPhone",
      "externalReference",
      "fee",
      "driverId",
    ])
      assert(!(key in p));
    assert(!("account" in p.partner));
  }
  assert.equal(
    (await query(rider, { stage: "AVAILABLE", q: available[0].recipientName }))
      .total,
    0,
  );
  assert.equal((await query(rider, { q: foreign.recipientName })).total, 0);
  assert.equal(
    (await query(rider, { q: assigned[0].recipientName })).items[0].id,
    assigned[0].id,
  );
  ok(
    "unclaimed customer identity/contact/reference data is redacted and cannot be inferred through search; own assigned customers remain searchable",
  );
  assert.deepEqual(
    (await query(rider, { stage: "TO_PICKUP" })).items.map((p) => p.id),
    [assigned[0].id],
  );
  assert.deepEqual(
    (await query(rider, { stage: "TO_DELIVER" })).items.map((p) => p.id),
    [assigned[1].id],
  );
  const before = await db.deliveryParcel.findUniqueOrThrow({
    where: { id: assigned[0].id },
  });
  await query(rider, { stage: "TO_PICKUP" });
  assert.deepEqual(
    await db.deliveryParcel.findUniqueOrThrow({
      where: { id: assigned[0].id },
    }),
    before,
  );
  const initial = await riderInitialData(
    rider,
    "collections",
    new URLSearchParams("stage=TO_DELIVER"),
  );
  assert.equal(initial?.key, "collections:period=ALL_TIME:stage=TO_DELIVER");
  assert.deepEqual(
    initial?.data.work.items.map((p) => p.id),
    [assigned[1].id],
  );
  ok(
    "Collect stage filters and initial snapshots match; viewing or selecting work does not record physical pickup",
  );
  await assert.rejects(query(partner), { status: 403 });
  await assert.rejects(query(admin), { status: 403 });
  await assert.rejects(query(rider, { stage: "INVALID" }));
  ok(
    "the combined work endpoint enforces approved rider access and validates its stage",
  );
  await assert.rejects(
    cmd(rider, { type: "deliver", parcelId: available[0].id }),
  );
  const race = await Promise.allSettled([
    cmd(rider, { type: "claim", parcelId: available[0].id }),
    cmd(other, { type: "claim", parcelId: available[0].id }),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const claimed = await db.deliveryParcel.findUniqueOrThrow({
      where: { id: available[0].id },
    }),
    winner = claimed.driverId === rider.id ? rider : other;
  assert.equal(claimed.state, "REGISTERED");
  assert.equal(claimed.pickedUpAt, null);
  assert.equal(
    (await query(winner, { stage: "AVAILABLE", q: claimed.publicId })).total,
    0,
  );
  assert.equal(
    (await query(winner, { stage: "TO_PICKUP", q: claimed.publicId })).total,
    1,
  );
  await assert.rejects(cmd(winner, { type: "deliver", parcelId: claimed.id }));
  await cmd(winner, { type: "pickup", parcelIds: [claimed.id] });
  assert.equal(
    (await query(winner, { stage: "TO_DELIVER", q: claimed.publicId })).total,
    1,
  );
  await cmd(winner, { type: "deliver", parcelId: claimed.id });
  assert.equal((await query(winner, { q: claimed.publicId })).total, 0);
  const history = (await deliveryQuery(
    winner,
    "rider-workspace",
    new URLSearchParams({ screen: "history", q: claimed.publicId }),
  )) as { work: { items: { id: string }[] } };
  assert.deepEqual(
    history.work.items.map((p) => p.id),
    [claimed.id],
  );
  const delivered = await db.deliveryParcel.findUniqueOrThrow({
    where: { id: claimed.id },
  });
  assert(delivered.pickedUpAt && delivered.deliveredAt);
  assert.equal(delivered.deliveredBy, winner.userId);
  assert.equal(
    (
      await db.deliveryParcel.findUniqueOrThrow({
        where: { id: assigned[0].id },
      })
    ).state,
    "REGISTERED",
  );
  ok(
    "concurrent claims have one winner; explicit pickup moves a row to delivery and confirmed completion moves it to rider-specific History with attribution",
  );
  const older = make(40, partner.partnerId!, rider.id);
  await db.deliveryParcel.create({
    data: { ...older, registeredAt: new Date("2024-01-01T00:00:00Z") },
  });
  await cmd(rider, { type: "pickup", parcelIds: [older.id] });
  assert.equal(
    (
      await query(rider, {
        q: older.publicId,
        stage: "TO_DELIVER",
        period: "DAILY",
        value: localDate(new Date()),
      })
    ).total,
    1,
  );
  ok(
    "active delivery date filters use actual pickup time, including jobs registered on an earlier day",
  );
}
