import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import {
  localDate,
  nextCutoff,
  type Actor,
  type DeliveryCommandInput,
} from "../src/lib/delivery/domain";

export async function verifyMidnightCutoff(
  db: PrismaClient,
  admin: Actor,
  driver: Actor,
  migrate: () => Promise<void>,
  ok: (label: string) => void,
) {
  const schema = process.env.IGO_DELIVERY_TEST_SCHEMA;
  assert(schema && /^igo_qa_[a-f0-9]+$/.test(schema));
  const now = new Date();
  const createPartner = (minutes: number) =>
    db.deliveryAccount.create({
      data: {
        clerkUserId: `qa_midnight_${randomUUID()}`,
        role: "PARTNER",
        status: "APPROVED",
        name: "Midnight QA",
        phone: "7771234",
        partner: {
          create: {
            businessName: "Midnight QA",
            pageUrl: "",
            pickupAddress: "QA pickup",
            pickupArea: "Malé",
            operatingLocation: "MALE",
            cutoffMinutes: minutes,
            nextInvoiceAt: nextCutoff(now, minutes),
          },
        },
      },
      include: { partner: true },
    });
  const legacy = await createPartner(1080),
    custom = await createPartner(900),
    midnight = await createPartner(0);
  const partner: Actor = {
    userId: legacy.clerkUserId,
    id: legacy.id,
    partnerId: legacy.partner!.id,
    role: "PARTNER",
    status: "APPROVED",
    name: legacy.name,
  };
  const cmd = (actor: Actor, command: DeliveryCommandInput) =>
    deliveryCommand(actor, randomUUID(), command);
  const createParcel = async (deliver: boolean) => {
    const parcel = await db.deliveryParcel.create({
      data: {
        publicId: `MIDNIGHT-${randomUUID()}`,
        partnerId: partner.partnerId!,
        externalReference: randomUUID(),
        recipientName: "QA customer",
        recipientPhone: "7771234",
        destination: "QA destination",
        zone: "MALE",
        origin: "MALE",
        destinationLabel: "Malé",
        fee: 2500,
      },
    });
    if (deliver) {
      await cmd(admin, {
        type: "assign",
        driverId: driver.id!,
        parcelIds: [parcel.id],
      });
      await cmd(driver, { type: "pickup", parcelIds: [parcel.id] });
      await cmd(driver, { type: "deliver", parcelId: parcel.id });
    }
    return parcel;
  };
  await createParcel(true);
  await cmd(admin, {
    type: "createPartnerInvoice",
    partnerId: partner.partnerId!,
    expectedCount: 1,
    expectedTotal: 2500,
  });
  const history = () =>
    db.deliveryInvoice.findMany({
      where: { partnerId: partner.partnerId! },
      include: { lines: true, payments: true },
      orderBy: { id: "asc" },
    });
  const previousInvoices = await history();
  const eligible = await createParcel(true),
    registered = await createParcel(false);
  const started = new Date();
  await migrate();
  const moved = await db.deliveryPartner.findUniqueOrThrow({
    where: { id: partner.partnerId! },
  });
  assert.equal(moved.cutoffMinutes, 0);
  assert.equal(
    moved.nextInvoiceAt!.toISOString(),
    nextCutoff(started, 0).toISOString(),
  );
  const defaults = await db.$queryRawUnsafe<{ column_default: string }[]>(
    `SELECT column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='DeliveryPartner' AND column_name='cutoffMinutes'`,
    schema,
  );
  assert.equal(defaults[0].column_default, "0");
  ok(
    "database default and former 18:00 schedules move to the next midnight Maldives Time",
  );
  for (const unchanged of [custom, midnight]) {
    const current = await db.deliveryPartner.findUniqueOrThrow({
      where: { id: unchanged.partner!.id },
    });
    assert.equal(current.cutoffMinutes, unchanged.partner!.cutoffMinutes);
    assert.equal(
      current.nextInvoiceAt!.toISOString(),
      unchanged.partner!.nextInvoiceAt!.toISOString(),
    );
  }
  assert.deepEqual(await history(), previousInvoices);
  const audit = await db.deliveryActivity.findFirstOrThrow({
    where: {
      partnerId: partner.partnerId!,
      actor: "system:midnight-invoice-cutoff",
      kind: "INVOICE_CUTOFF_CHANGED",
    },
  });
  const detail = audit.detail as Record<string, unknown>;
  assert.equal(detail.previousMinutes, 1080);
  assert.equal(detail.minutes, 0);
  assert.equal(detail.timezone, "Indian/Maldives");
  ok(
    "custom schedules, existing invoices and balances survive with an audit of the schedule change",
  );
  const due = (at: Date) =>
    db.$queryRawUnsafe(
      `SELECT "${schema}".igo_invoice_due($1::timestamptz)`,
      at,
    );
  await due(new Date(moved.nextInvoiceAt!.getTime() - 1));
  assert.equal(
    await db.deliveryInvoiceLine.count({ where: { parcelId: eligible.id } }),
    0,
  );
  await due(moved.nextInvoiceAt!);
  const line = await db.deliveryInvoiceLine.findUniqueOrThrow({
    where: { parcelId: eligible.id },
    include: { invoice: { include: { cycle: true } } },
  });
  assert.equal(line.amount, 2500);
  assert.equal(
    line.invoice.cycle!.cutoffAt.toISOString(),
    moved.nextInvoiceAt!.toISOString(),
  );
  assert.equal(line.invoice.cycle!.localDate, localDate(moved.nextInvoiceAt!));
  assert.equal(
    await db.deliveryInvoiceLine.count({ where: { parcelId: registered.id } }),
    0,
  );
  ok(
    "only completed uninvoiced deliveries are billed at midnight, never before it",
  );
  const issued = await history();
  await Promise.all([due(moved.nextInvoiceAt!), due(moved.nextInvoiceAt!)]);
  assert.deepEqual(await history(), issued);
  assert.equal(
    (
      await db.deliveryPartner.findUniqueOrThrow({
        where: { id: partner.partnerId! },
      })
    ).nextInvoiceAt!.getTime(),
    moved.nextInvoiceAt!.getTime() + 86400000,
  );
  await due(new Date(moved.nextInvoiceAt!.getTime() + 86400000));
  assert.deepEqual(await history(), issued);
  ok(
    "repeated/concurrent midnight ticks do not duplicate invoices, and empty daily cycles issue no invoice",
  );
}
