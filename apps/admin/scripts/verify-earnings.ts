import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryQuery } from "../src/lib/delivery/queries";
import type { Actor } from "../src/lib/delivery/domain";
import type { EarningsResult } from "../src/lib/delivery/earnings-period";

export async function verifyEarnings(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  rider: Actor,
  ok: (label: string) => void,
) {
  const query = async (period = "ALL_TIME", value?: string) =>
    (await deliveryQuery(
      admin,
      "earnings",
      new URLSearchParams({ period, ...(value ? { value } : {}) }),
    )) as EarningsResult;
  const before = await query();
  for (const actor of [partner, rider])
    await assert.rejects(
      deliveryQuery(actor, "earnings", new URLSearchParams()),
      { status: 403 },
    );
  await assert.rejects(query("DAILY", "2024-02-30"));
  ok(
    "earnings are admin-only and invalid calendar periods are rejected before reading income",
  );
  const account = await db.deliveryAccount.create({
    data: {
      clerkUserId: `qa_earnings_${randomUUID()}`,
      role: "PARTNER",
      status: "APPROVED",
      name: "Earnings QA",
      phone: "7771234",
      partner: {
        create: {
          businessName: "Earnings QA",
          pickupAddress: "QA address",
          pickupArea: "Malé",
          operatingLocation: "MALE",
          pageUrl: "",
        },
      },
    },
    include: { partner: true },
  });
  const partnerId = account.partner!.id;
  const invoice = await db.$transaction(async (tx) => {
    const parcel = await tx.deliveryParcel.create({
      data: {
        partnerId,
        publicId: `QA-EARNINGS-${randomUUID()}`,
        externalReference: "EARNINGS-QA",
        recipientName: "QA recipient",
        recipientPhone: "7771234",
        destination: "QA address",
        zone: "MALE",
        destinationLabel: "Malé",
        origin: "MALE",
        fee: 2500,
        registeredAt: new Date("2023-12-30T00:00:00Z"),
      },
    });
    await tx.deliveryParcel.update({
      where: { id: parcel.id },
      data: {
        driverId: rider.id,
        state: "PICKED_UP",
        pickedUpAt: new Date("2023-12-30T01:00:00Z"),
        pickedUpBy: rider.userId,
      },
    });
    await tx.deliveryParcel.update({
      where: { id: parcel.id },
      data: {
        state: "DELIVERED",
        deliveredAt: new Date("2023-12-30T02:00:00Z"),
        deliveredBy: rider.userId,
      },
    });
    return tx.deliveryInvoice.create({
      data: {
        publicId: `QA-EARNINGS-${randomUUID()}`,
        partnerId,
        total: 2500,
        manualCutoffAt: new Date("2023-12-30T03:00:00Z"),
        createdAt: new Date("2023-12-30T03:00:00Z"),
        lines: { create: { parcelId: parcel.id, amount: 2500 } },
      },
    });
  });
  async function payment(
    at: string,
    amount: number,
    confirmed: number,
    status: "PENDING" | "REJECTED" | "CONFIRMED" | "PARTIAL",
  ) {
    const submitted = await db.$transaction(async (tx) => {
      const receipt = await tx.deliveryReceipt.create({
        data: {
          partnerId,
          path: `qa/${randomUUID()}.webp`,
          sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          bytes: 100,
          ready: true,
        },
      });
      return tx.deliveryPayment.create({
        data: {
          partnerId,
          invoiceId: invoice.id,
          receiptId: receipt.id,
          bankReference: `QA-EARN-${randomUUID()}`,
          amount,
          createdAt: new Date(new Date(at).getTime() - 60000),
        },
      });
    });
    if (status === "PENDING") return;
    await db.$transaction(async (tx) => {
      await tx.deliveryPayment.update({
        where: { id: submitted.id },
        data: {
          status,
          confirmedAmount: confirmed,
          reviewedAt: new Date(at),
          reviewedBy: admin.userId,
          reviewNote: "Disposable date-bucket fixture",
        },
      });
      if (confirmed) {
        await tx.deliveryPaymentAllocation.create({
          data: {
            paymentId: submitted.id,
            invoiceId: invoice.id,
            amount: confirmed,
          },
        });
        await tx.deliveryInvoice.update({
          where: { id: invoice.id },
          data: { paid: { increment: confirmed } },
        });
      }
    });
  }
  await payment("2023-12-31T18:59:59.999Z", 100, 100, "CONFIRMED");
  await payment("2023-12-31T19:00:00Z", 200, 200, "CONFIRMED");
  await payment("2024-02-28T19:00:00Z", 300, 300, "CONFIRMED");
  await payment("2024-02-29T19:00:00Z", 400, 400, "CONFIRMED");
  await payment("2024-12-31T19:00:00Z", 500, 500, "CONFIRMED");
  await payment("2025-01-01T19:00:00Z", 100, 50, "PARTIAL");
  await payment("2023-12-31T19:00:00Z", 100, 0, "PENDING");
  await payment("2023-12-31T19:00:00Z", 100, 0, "REJECTED");
  assert.equal((await query("DAILY", "2023-12-31")).amount, 100);
  assert.equal((await query("DAILY", "2024-01-01")).amount, 200);
  assert.equal((await query("DAILY", "2024-02-29")).amount, 300);
  assert.equal((await query("DAILY", "2024-03-01")).amount, 400);
  ok(
    "daily income uses verification time and exclusive Maldives midnight boundaries, including leap day",
  );
  assert.equal((await query("MONTHLY", "2024-01")).amount, 200);
  assert.equal((await query("MONTHLY", "2024-02")).amount, 300);
  assert.equal((await query("MONTHLY", "2024-03")).amount, 400);
  assert.equal((await query("MONTHLY", "2025-01")).amount, 550);
  assert.equal((await query("YEARLY", "2023")).amount, 100);
  assert.equal((await query("YEARLY", "2024")).amount, 900);
  assert.equal((await query("YEARLY", "2025")).amount, 550);
  assert.equal((await query("MONTHLY", "2024-04")).amount, 0);
  ok(
    "month/year selection sums exact verified amounts, excludes pending/rejected evidence and returns zero for empty periods",
  );
  const all = await query();
  assert.equal(all.amount, before.amount + 1550);
  assert.equal(all.firstActivity, "2023-12-30");
  assert(
    all.years.includes("2023") &&
      all.years.includes("2024") &&
      all.years.includes("2025"),
  );
  const summary = (await deliveryQuery(
    admin,
    "overview",
    new URLSearchParams(),
  )) as { confirmedPayments: number };
  assert.equal(all.amount, summary.confirmedPayments);
  ok(
    "all-time earnings reconcile with the verified invoice ledger and year choices cover the full recorded operating history",
  );
}
