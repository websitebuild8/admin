import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { financeQuery } from "../src/lib/delivery/finance";
import { financeReport } from "../src/lib/delivery/finance-report";
import {
  localDate,
  type Actor,
  type DeliveryCommandInput,
} from "../src/lib/delivery/domain";
import type {
  FinanceList,
  FinanceSummary,
} from "../src/lib/delivery/finance-contract";

export async function verifyFinance(
  db: PrismaClient,
  admin: Actor,
  driver: Actor,
  ok: (s: string) => void,
) {
  const account = await db.deliveryAccount.create({
    data: {
      clerkUserId: `qa_finance_${randomUUID()}`,
      role: "PARTNER",
      status: "APPROVED",
      name: "Finance QA",
      phone: "7771234",
      partner: {
        create: {
          businessName: "Finance QA business",
          pageUrl: "",
          pickupAddress: "QA pickup",
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
  const cmd = (who: Actor, input: DeliveryCommandInput) =>
    deliveryCommand(who, randomUUID(), input);
  const search = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ partnerId: partner.partnerId!, ...extra });
  const list = async (
    extra: Record<string, string> = {},
  ): Promise<FinanceList> =>
    JSON.parse(
      JSON.stringify(await financeQuery(admin, "finance", search(extra))),
    );
  const summary = async (extra: Record<string, string> = {}) =>
    (await financeQuery(
      admin,
      "finance-summary",
      search(extra),
    )) as FinanceSummary;
  const parcel = async (ref: string) =>
    db.deliveryParcel.create({
      data: {
        publicId: `QA-FIN-${randomUUID()}`,
        partnerId: partner.partnerId!,
        externalReference: ref,
        recipientName: "QA customer",
        recipientPhone: "7771234",
        destination: "QA address",
        zone: "MALE",
        origin: "MALE",
        destinationLabel: "Malé",
        fee: 2500,
      },
    });
  const deliver = async (ids: string[]) => {
    await cmd(admin, { type: "assign", driverId: driver.id!, parcelIds: ids });
    await cmd(driver, { type: "pickup", parcelIds: ids });
    for (const id of ids) await cmd(driver, { type: "deliver", parcelId: id });
  };
  const parcels = await Promise.all(
    Array.from({ length: 12 }, (_, n) => parcel(`FIN-${n}`)),
  );
  await deliver(parcels.map((p) => p.id));
  const issued = await cmd(admin, {
    type: "createPartnerInvoice",
    partnerId: partner.partnerId!,
    expectedCount: 12,
    expectedTotal: 30000,
  });
  assert("invoiceId" in issued && issued.invoiceId);
  const invoiceId = issued.invoiceId;
  const unbilled = await parcel("UNBILLED");
  await deliver([unbilled.id]);
  const unfinished = await parcel("UNFINISHED");
  const pages = await Promise.all([
    list({ tab: "deliveries" }),
    list({ tab: "deliveries", page: "2" }),
  ]);
  assert.equal(pages[0].total, 13);
  assert.equal(pages[0].items.length, 10);
  assert.equal(pages[1].items.length, 3);
  assert.equal(
    new Set(pages.flatMap((p) => p.items.map((i) => i.id))).size,
    13,
  );
  assert(
    !pages
      .flatMap((p) => p.items.map((item) => item.id))
      .includes(unfinished.id),
  );
  assert.equal(
    (await list({ tab: "deliveries", status: "UNINVOICED" })).total,
    1,
  );
  assert.equal(
    (await list({ tab: "deliveries", status: "INVOICED" })).total,
    12,
  );
  ok(
    "Finance completed deliveries paginate at ten, exclude unfinished work and distinguish awaiting billing",
  );
  const transfer = async (amount: number) => {
    const r = await db.deliveryReceipt.create({
      data: {
        partnerId: partner.partnerId!,
        path: `qa/${randomUUID()}.webp`,
        sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        bytes: 100,
        ready: true,
      },
    });
    await cmd(partner, {
      type: "submitPayment",
      invoiceId,
      receiptId: r.id,
      bankReference: `FIN-${randomUUID()}`,
      amount,
    });
    return db.deliveryPayment.findUniqueOrThrow({ where: { receiptId: r.id } });
  };
  const p = await transfer(5000);
  assert.equal((await summary()).outstanding, 30000);
  assert.equal((await summary()).pendingCount, 1);
  assert.equal((await list({ status: "AWAITING_VERIFICATION" })).total, 1);
  assert.equal((await list({ tab: "transfers", status: "PENDING" })).total, 1);
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: p.id,
    decision: "CONFIRM",
    confirmedAmount: 2000,
    note: "QA bank evidence verified for 20 MVR",
  });
  assert.equal((await summary()).outstanding, 28000);
  assert.equal((await summary()).confirmed, 2000);
  assert.equal((await list({ status: "PARTIALLY_PAID" })).total, 1);
  const rejected = await transfer(1000);
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: rejected.id,
    decision: "REJECT",
    confirmedAmount: 0,
    note: "QA unmatched evidence rejected",
  });
  assert.equal((await summary()).outstanding, 28000);
  assert.equal((await list({ tab: "transfers", status: "REJECTED" })).total, 1);
  ok(
    "Pending/rejected bank evidence never reduces debt; partial verification credits only the confirmed amount",
  );
  const rest = await transfer(28000);
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: rest.id,
    decision: "CONFIRM",
    confirmedAmount: 28000,
    note: "QA full remaining payment verified",
  });
  assert.equal((await summary()).outstanding, 0);
  assert.equal((await summary()).confirmed, 30000);
  const paid = await list({ status: "PAID" });
  assert.equal(paid.total, 1);
  assert.equal((await list({ status: "OUTSTANDING" })).total, 0);
  assert.equal(
    (await list({ tab: "invoices", q: parcels[0].publicId })).total,
    0,
  );
  const invoice = await db.deliveryInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
  assert.equal((await list({ q: invoice.publicId })).total, 1);
  const record = paid.items[0];
  assert("paidInvoice" in record && record.paidInvoice);
  ok(
    "Paid invoices, transfer review states and invoice/reference searches stay connected to the authoritative ledger",
  );
  const report = await financeReport(admin, search());
  assert.equal(report.deliveries.length, 13);
  assert.equal(report.invoices.length, 1);
  assert.equal(report.transfers.length, 3);
  assert.equal(report.invoices[0].total, 30000);
  assert.equal(report.invoices[0].paid, 30000);
  assert.equal(
    report.transfers.reduce((s, p) => s + p.confirmedAmount, 0),
    30000,
  );
  assert.equal(
    report.deliveries.reduce((s, p) => s + (p.invoiceLine?.amount ?? 0), 0),
    30000,
  );
  assert.equal(
    (
      await financeReport(
        admin,
        search({ page: "2", q: "does-not-match", status: "PAID" }),
      )
    ).deliveries.length,
    13,
  );
  assert.equal(
    (await summary({ period: "DAILY", value: localDate(new Date()) }))
      .deliveredCount,
    13,
  );
  assert.equal(
    (
      await financeReport(
        admin,
        search({ period: "DAILY", value: "2020-01-01" }),
      )
    ).deliveries.length,
    0,
  );
  assert.equal(
    (await summary({ period: "DAILY", value: "2020-01-01" })).deliveredFees,
    0,
  );
  ok(
    "Reports export all matching completed packages across pages with unique invoices/transfers, reconciled money and Maldives date filters",
  );
  const otherId = randomUUID();
  assert.equal(
    (await list({ partnerId: otherId, tab: "deliveries" })).total,
    0,
  );
  for (const who of [
    partner,
    driver,
    { ...admin, userId: `removed_${randomUUID()}` },
  ]) {
    await assert.rejects(financeQuery(who, "finance", search()), {
      status: 403,
    });
    await assert.rejects(financeReport(who, search()), { status: 403 });
  }
  await assert.rejects(
    financeQuery(
      admin,
      "finance",
      search({ tab: "transfers", status: "PAID" }),
    ),
  );
  await assert.rejects(
    financeQuery(admin, "finance", search({ partnerId: "invalid" })),
  );
  const choices = (await financeQuery(
    admin,
    "finance-partners",
    new URLSearchParams({ q: "Finance QA" }),
  )) as { id: string }[];
  assert(choices.some((p) => p.id === partner.partnerId));
  ok(
    "Partner scoping, validated filters and live administrator authorization protect finance lists and exports",
  );
}
