import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import {
  commandInput,
  defaultRateMatrix,
  type Actor,
  type DeliveryCommandInput,
} from "../src/lib/delivery/domain";
import type {
  AvailableJob,
  RiderList,
} from "../src/lib/delivery/rider-contract";

export async function verifyOriginPricing(
  db: PrismaClient,
  admin: Actor,
  driver: Actor,
  otherDriver: Actor,
  ok: (label: string) => void,
) {
  const account = await db.deliveryAccount.create({
    data: {
      clerkUserId: `qa_routes_${randomUUID()}`,
      name: "Routes QA",
      phone: "7771234",
      role: "PARTNER",
      status: "APPROVED",
      partner: {
        create: {
          businessName: "Routes QA",
          pageUrl: "https://example.test",
          pickupAddress: "QA address",
          pickupArea: "Malé",
          operatingLocation: "MALE",
        },
      },
    },
    include: { partner: true },
  });
  const partner: Actor = {
    userId: account.clerkUserId,
    id: account.id,
    partnerId: account.partner!.id,
    role: "PARTNER",
    status: "APPROVED",
    name: account.name,
  };
  const cmd = (
    actor: Actor,
    command: DeliveryCommandInput,
    key = randomUUID(),
  ) => deliveryCommand(actor, key, command);
  const make = (ref: string, zone: string) => ({
    type: "register" as const,
    parcel: {
      externalReference: ref,
      zone,
      recipientName: "Private recipient",
      recipientPhone: "7771234",
      destination: "QA address",
      description: "QA only",
    },
  });
  for (const [origin, rates] of Object.entries(defaultRateMatrix)) {
    await cmd(admin, {
      type: "operatingLocation",
      partnerId: partner.partnerId!,
      location: origin as "MALE",
      reason: "QA route verification",
    });
    for (const [zone, fee] of Object.entries(rates)) {
      const ref = `MATRIX-${origin}-${zone}`;
      await cmd(partner, make(ref, zone));
      const p = await db.deliveryParcel.findUniqueOrThrow({
        where: {
          partnerId_externalReference: {
            partnerId: partner.partnerId!,
            externalReference: ref,
          },
        },
      });
      assert.equal(p.origin, origin);
      assert.equal(p.fee, fee);
      assert.equal(p.state, "REGISTERED");
      assert.equal(p.pickedUpAt, null);
    }
  }
  ok(
    "all twelve origin/destination prices are frozen at registration, without pickup or invoice debt",
  );
  const frozen = await db.deliveryParcel.findFirstOrThrow({
    where: {
      partnerId: partner.partnerId!,
      externalReference: "MATRIX-MALE-MALE",
    },
  });
  await cmd(admin, { type: "rate", origin: "MALE", zone: "MALE", fee: 2600 });
  await cmd(admin, {
    type: "operatingLocation",
    partnerId: partner.partnerId!,
    location: "MALE",
    reason: "QA move",
  });
  await cmd(partner, make("NEW-PRICE", "MALE"));
  assert.equal(
    (
      await db.deliveryParcel.findFirstOrThrow({
        where: {
          partnerId: partner.partnerId!,
          externalReference: "NEW-PRICE",
        },
      })
    ).fee,
    2600,
  );
  assert.equal(
    (await db.deliveryParcel.findUniqueOrThrow({ where: { id: frozen.id } }))
      .fee,
    2500,
  );
  await assert.rejects(
    db.deliveryParcel.update({
      where: { id: frozen.id },
      data: { zone: "BOAT" },
    }),
  );
  await assert.rejects(
    db.deliveryParcel.update({ where: { id: frozen.id }, data: { fee: 2600 } }),
  );
  await cmd(admin, { type: "rate", origin: "MALE", zone: "MALE", fee: 2500 });
  await assert.rejects(
    cmd(partner, {
      type: "operatingLocation",
      partnerId: partner.partnerId!,
      location: "HULHUMALE_1",
      reason: "Forbidden",
    }),
  );
  await assert.rejects(
    cmd(driver, { type: "rate", origin: "MALE", zone: "BOAT", fee: 10 }),
  );
  ok(
    "admin location and price changes affect new packages only; partner/rider changes and database rewrites are denied",
  );
  await cmd(admin, {
    type: "destination",
    code: "VILLIMALE",
    label: "Villimalé",
    active: true,
  });
  await assert.rejects(cmd(partner, make("NO-RATE", "VILLIMALE")));
  await cmd(admin, {
    type: "rate",
    origin: "MALE",
    zone: "VILLIMALE",
    fee: 4000,
  });
  await cmd(partner, make("CUSTOM-ROUTE", "VILLIMALE"));
  const custom = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: partner.partnerId!, externalReference: "CUSTOM-ROUTE" },
  });
  assert.equal(custom.fee, 4000);
  assert.equal(custom.destinationLabel, "Villimalé");
  await cmd(admin, {
    type: "destination",
    code: "VILLIMALE",
    label: "Villimalé changed",
    active: false,
  });
  await assert.rejects(cmd(partner, make("INACTIVE", "VILLIMALE")));
  assert.equal(
    (await db.deliveryParcel.findUniqueOrThrow({ where: { id: custom.id } }))
      .destinationLabel,
    "Villimalé",
  );
  ok(
    "unlisted destinations require an explicit active route; inactive/missing rates block registration and saved route labels stay fixed",
  );
  const rates = (await deliveryQuery(
    admin,
    "rates",
    new URLSearchParams(),
  )) as { items: unknown[]; total: number };
  assert.equal(rates.items.length, 10);
  assert(rates.total >= 13);
  const jobs = (await deliveryQuery(
    driver,
    "available",
    new URLSearchParams(),
  )) as RiderList<AvailableJob>;
  assert.equal(jobs.items.length, 10);
  assert(!("recipientPhone" in jobs.items[0]));
  assert(!("recipientName" in jobs.items[0]));
  await assert.rejects(
    deliveryQuery(partner, "available", new URLSearchParams()),
  );
  const outcomes = await Promise.allSettled([
    cmd(driver, { type: "claim", parcelId: frozen.id }),
    cmd(otherDriver, { type: "claim", parcelId: frozen.id }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const claimed = await db.deliveryParcel.findUniqueOrThrow({
    where: { id: frozen.id },
  });
  assert.equal(claimed.state, "REGISTERED");
  assert.equal(claimed.pickedUpAt, null);
  const winner = claimed.driverId === driver.id ? driver : otherDriver;
  const loser = winner.id === driver.id ? otherDriver : driver;
  await assert.rejects(cmd(loser, { type: "claim", parcelId: frozen.id }));
  await assert.rejects(cmd(partner, { type: "claim", parcelId: custom.id }));
  await assert.rejects(cmd(loser, { type: "pickup", parcelIds: [frozen.id] }));
  const key = randomUUID();
  await cmd(winner, { type: "claim", parcelId: custom.id }, key);
  await cmd(winner, { type: "claim", parcelId: custom.id }, key);
  await assert.rejects(cmd(winner, { type: "deliver", parcelId: frozen.id }));
  await cmd(winner, { type: "pickup", parcelIds: [frozen.id] });
  await cmd(winner, { type: "deliver", parcelId: frozen.id });
  const summary = (await deliveryQuery(
    partner,
    "overview",
    new URLSearchParams(),
  )) as { outstanding: number; awaitingBilling: number };
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.awaitingBilling, 2500);
  ok(
    "available jobs paginate ten and conceal contact details; racing riders cannot steal jobs, claims replay safely, pickup stays explicit and only delivery permits billing",
  );
  const unpaid = await db.deliveryParcel.findFirstOrThrow({
    where: {
      partnerId: partner.partnerId!,
      driverId: null,
      state: "REGISTERED",
    },
  });
  await db.deliveryAccount.update({
    where: { id: winner.id! },
    data: { status: "SUSPENDED" },
  });
  await assert.rejects(cmd(winner, { type: "claim", parcelId: unpaid.id }));
  await db.deliveryAccount.update({
    where: { id: winner.id! },
    data: { status: "APPROVED" },
  });
  for (const resource of ["cod", "cod-receipt"])
    await assert.rejects(deliveryQuery(admin, resource, new URLSearchParams()));
  for (const type of ["handover", "remit"])
    assert(
      !commandInput.safeParse({
        type,
        parcelIds: [frozen.id],
        driverId: driver.id,
        partnerId: partner.partnerId,
        reference: "REMOVED",
      }).success,
    );
  const json = JSON.stringify(
    await deliveryQuery(partner, "packages", new URLSearchParams()),
  );
  assert(!json.includes("codAmount"));
  assert(!json.includes("handoverId"));
  ok(
    "suspended riders cannot claim jobs; retired cash commands, resources and operational fields are unavailable",
  );
}
