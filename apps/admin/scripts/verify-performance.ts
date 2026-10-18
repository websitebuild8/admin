import assert from "node:assert/strict";
import type { PrismaClient } from "../src/generated/prisma/client";
import { actorForIdentity } from "../src/lib/delivery/admin-policy";
import { deliveryIdentity } from "../src/lib/delivery/identity-data";
import {
  portalInitialData,
  riderInitialData,
} from "../src/lib/delivery/initial-data";
import { portalInitialQuery } from "../src/lib/delivery/portal-initial";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery, parcelSelection } from "../src/lib/delivery/queries";
import { recentParcels } from "../src/lib/delivery/recent-parcels";
import type { Actor } from "../src/lib/delivery/domain";
import { randomUUID } from "node:crypto";

export async function verifyPerformance(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  other: Actor,
  driver: Actor,
  ok: (label: string) => void,
) {
  for (const person of [partner, other, driver]) {
    const before = await db.deliveryAccount.findMany({
      where: { clerkUserId: person.userId },
      include: {
        partner: { include: { application: { select: { logoReady: true } } } },
      },
      orderBy: [{ primary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    assert.deepEqual(
      actorForIdentity(
        await deliveryIdentity(person.userId),
        person.role as "PARTNER" | "DRIVER",
      ),
      actorForIdentity(
        { userId: person.userId, accounts: before, grant: null },
        person.role as "PARTNER" | "DRIVER",
      ),
    );
  }
  assert.deepEqual(
    (await deliveryIdentity(`qa_missing_${randomUUID()}`)).accounts,
    [],
  );
  ok(
    "joined identity reads preserve account ordering, role scope and logo flags without exposing another tenant",
  );

  const create = async (actor: Actor, reference: string) =>
    deliveryCommand(actor, randomUUID(), {
      type: "register",
      parcel: {
        externalReference: reference,
        recipientName: reference,
        recipientPhone: "7771234",
        destination: "Disposable performance fixture",
        zone: "MALE",
        description: "Not a real package",
      },
    });
  const first = await create(partner, "PERF-OWN"),
    foreign = await create(other, "PERF-FOREIGN");
  const own = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: partner.partnerId!, externalReference: "PERF-OWN" },
  });
  assert(first);
  assert(foreign);
  const selection = new URLSearchParams("period=ALL_TIME");
  const initial = await portalInitialData(partner, "packages", selection);
  const expected = await deliveryQuery(
    partner,
    "packages",
    new URLSearchParams(portalInitialQuery("packages", selection).query),
  );
  assert.deepEqual(initial.main?.data, JSON.parse(JSON.stringify(expected)));
  assert.equal(initial.main?.key, "packages?page=1&q=&state=&period=ALL_TIME");
  assert(!JSON.stringify(initial).includes("PERF-FOREIGN"));
  assert(initial.notices);
  assert.equal(initial.earnings, undefined);
  ok(
    "server-seeded partner lists match fresh API reads, serialize timestamps and keep financial/tenant data private",
  );

  const overview = await portalInitialData(admin, "overview", selection);
  assert(overview.main);
  assert(overview.notices);
  assert(overview.earnings);
  const invalid = await portalInitialData(
    partner,
    "packages",
    new URLSearchParams("period=INVALID"),
  );
  assert.deepEqual(invalid, {});
  const special = await portalInitialData(admin, "my-workspaces", selection);
  assert.equal(special.main, undefined);
  ok(
    "initial page payloads include only required resources, retain earnings for admins and reject invalid periods",
  );

  await deliveryCommand(admin, randomUUID(), {
    type: "assign",
    parcelIds: [own.id],
    driverId: driver.id!,
  });
  const rider = await riderInitialData(driver, "collections", selection);
  assert.equal(rider?.key, "collections:period=ALL_TIME");
  assert.equal(rider?.data.work.items.length, 1);
  assert.equal(rider?.data.work.items[0].id, own.id);
  assert(!JSON.stringify(rider).includes("PERF-FOREIGN"));
  assert.equal(
    (await db.deliveryParcel.findUniqueOrThrow({ where: { id: own.id } }))
      .state,
    "REGISTERED",
  );
  ok(
    "rider initial snapshots preserve assignment isolation and never imply physical pickup",
  );
  await deliveryCommand(driver, randomUUID(), {
    type: "pickup",
    parcelIds: [own.id],
  });
  await deliveryCommand(driver, randomUUID(), {
    type: "deliver",
    parcelId: own.id,
  });
  await deliveryCommand(admin, randomUUID(), {
    type: "createPartnerInvoice",
    partnerId: partner.partnerId!,
    expectedCount: 1,
    expectedTotal: own.fee,
  });
  for (const person of [admin, partner, other, driver]) {
    const scope =
      person.role === "PARTNER"
        ? { partnerId: person.partnerId! }
        : person.role === "DRIVER"
          ? { driverId: person.id! }
          : {};
    assert.deepEqual(
      await recentParcels(person),
      await db.deliveryParcel.findMany({
        where: scope,
        select: parcelSelection,
        take: 5,
        orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
      }),
    );
  }
  const emptyRange = {
    gte: new Date("2000-01-01Z"),
    lt: new Date("2000-01-02Z"),
  };
  assert.deepEqual(await recentParcels(admin, emptyRange), []);
  ok(
    "joined recent-package reads match existing relation DTOs for all roles and respect date filters",
  );

  await db.deliveryAdminGrant.create({
    data: {
      clerkUserId: other.userId,
      name: "QA staff",
      email: "performance@example.test",
      active: true,
      grantedBy: admin.userId,
    },
  });
  assert((await deliveryIdentity(other.userId)).grant?.active);
  await db.deliveryAdminGrant.update({
    where: { clerkUserId: other.userId },
    data: { active: false, revokedBy: admin.userId, revokedAt: new Date() },
  });
  assert.equal((await deliveryIdentity(other.userId)).grant?.active, false);
  assert.throws(() =>
    actorForIdentity(
      {
        ...{ userId: other.userId, accounts: [] },
        grant: { active: false, name: "QA staff" },
      },
      "ADMIN",
    ),
  );
  ok(
    "identity optimization rechecks administrator revocation and does not share cached grants between requests",
  );
}
