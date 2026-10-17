import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand, serialized } from "../src/lib/delivery/commands";
import {
  previewDeletion,
  deleteDeliveryData,
} from "../src/lib/delivery/deletion";
import { cleanupDeletedFiles } from "../src/lib/delivery/deletion-files";
import { deliveryEarnings } from "../src/lib/delivery/earnings";
import { activateApprovedPartner } from "../src/lib/delivery/partner-applications";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";
import type { DeletionKind } from "../src/lib/delivery/deletion-contract";

export async function verifyDeletion(
  db: PrismaClient,
  admin: Actor,
  existingPartner: Actor,
  ok: (label: string) => void,
) {
  const makeAccount = async (role: "PARTNER" | "DRIVER") => {
    const account = await db.deliveryAccount.create({
      data: {
        clerkUserId: `qa_delete_${randomUUID()}`,
        role,
        status: "APPROVED",
        name: `Delete QA ${role}`,
        phone: "7771234",
        ...(role === "PARTNER"
          ? {
              partner: {
                create: {
                  businessName: `Delete QA ${randomUUID()}`,
                  pageUrl: "",
                  pickupAddress: "QA address",
                  pickupArea: "Malé",
                  operatingLocation: "MALE",
                },
              },
            }
          : {}),
      },
      include: { partner: true },
    });
    const actor: Actor = {
      userId: account.clerkUserId,
      id: account.id,
      partnerId: account.partner?.id ?? null,
      role,
      status: "APPROVED",
      name: account.name,
    };
    return actor;
  };
  const partner = await makeAccount("PARTNER"),
    rider = await makeAccount("DRIVER");
  const cmd = (actor: Actor, value: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(actor, key, value);
  const register = (ref: string): DeliveryCommandInput => ({
    type: "register",
    partnerId: partner.partnerId!,
    parcel: {
      externalReference: ref,
      recipientName: "QA recipient",
      recipientPhone: "7771234",
      destination: "QA address",
      zone: "MALE",
      description: "Deletion fixture",
    },
  });
  const deletion = async (kind: DeletionKind, id: string) => {
    const preview = await previewDeletion(admin, { kind, id });
    return {
      kind,
      id,
      fingerprint: preview.fingerprint,
      confirmation: preview.label,
      reason: "Remove isolated test data",
    };
  };
  const forgedAdmin = {
    ...admin,
    userId: `qa_not_root_${randomUUID()}`,
    superAdmin: true,
  };
  for (const actor of [forgedAdmin, partner, rider]) {
    await assert.rejects(
      previewDeletion(actor, { kind: "PARTNER", id: partner.id! }),
      { status: 403 },
    );
    await assert.rejects(
      deleteDeliveryData(actor, randomUUID(), {
        kind: "RIDER",
        id: rider.id!,
        fingerprint: "a".repeat(64),
        confirmation: "x",
        reason: "Unauthorized test",
      }),
      { status: 403 },
    );
  }
  ok(
    "only configured super admins can preview or execute deletions, including forged super-admin flags",
  );

  const registerKey = randomUUID(),
    payload = register(`DELETE-${randomUUID()}`);
  await cmd(admin, payload, registerKey);
  await cmd(admin, register(`DELETE-${randomUUID()}`));
  const parcels = await db.deliveryParcel.findMany({
    where: { partnerId: partner.partnerId! },
  });
  const stale = await deletion("PACKAGE", parcels[0].id);
  await db.deliveryParcel.update({
    where: { id: parcels[0].id },
    data: { description: "Changed after preview" },
  });
  await assert.rejects(deleteDeliveryData(admin, randomUUID(), stale), {
    status: 409,
  });
  const wrong = await deletion("PACKAGE", parcels[0].id);
  await assert.rejects(
    deleteDeliveryData(admin, randomUUID(), {
      ...wrong,
      confirmation: "wrong name",
    }),
  );
  assert.equal(
    await db.deliveryParcel.count({ where: { partnerId: partner.partnerId! } }),
    2,
  );
  await assert.rejects(
    db.deliveryParcel.delete({ where: { id: parcels[0].id } }),
  );
  await assert.rejects(
    db.deliveryAccount.delete({ where: { id: partner.id! } }),
  );
  ok(
    "stale previews, wrong confirmations and direct unpermitted deletes leave records intact",
  );
  await cmd(admin, {
    type: "assign",
    parcelIds: parcels.map((p) => p.id),
    driverId: rider.id!,
  });
  await cmd(rider, { type: "pickup", parcelIds: parcels.map((p) => p.id) });
  await assert.rejects(
    previewDeletion(admin, { kind: "RIDER", id: rider.id! }),
    /physically picked-up/,
  );
  for (const p of parcels)
    await cmd(rider, { type: "deliver", parcelId: p.id });
  const issued = (await cmd(admin, {
    type: "createPartnerInvoice",
    partnerId: partner.partnerId!,
    expectedCount: 2,
    expectedTotal: 5000,
  })) as { invoiceId: string };
  const invoiceId = issued.invoiceId;
  await cmd(admin, { type: "sendInvoice", invoiceId });
  const receiptId = randomUUID();
  await db.deliveryReceipt.create({
    data: {
      id: receiptId,
      partnerId: partner.partnerId!,
      path: `${partner.partnerId}/${receiptId}.webp`,
      sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      bytes: 100,
      ready: true,
    },
  });
  await cmd(partner, {
    type: "submitPayment",
    invoiceId,
    receiptId,
    bankReference: `QA-DELETE-${randomUUID()}`,
    amount: 5000,
  });
  const payment = await db.deliveryPayment.findFirstOrThrow({
    where: { invoiceId },
  });
  await cmd(admin, {
    type: "reviewPayment",
    paymentId: payment.id,
    decision: "CONFIRM",
    confirmedAmount: 5000,
    note: "Isolated deletion fixture",
  });
  await cmd(admin, { type: "sendPaidInvoice", invoiceId });
  const beforeIncome = await deliveryEarnings(admin, new URLSearchParams());
  const invoicePreview = await previewDeletion(admin, {
    kind: "INVOICE",
    id: invoiceId,
  });
  const packagePreview = await previewDeletion(admin, {
    kind: "PACKAGE",
    id: parcels[0].id,
  });
  assert.equal(invoicePreview.verifiedPayments, 5000);
  assert.equal(
    invoicePreview.counts.find((v) => v.label === "Packages")?.count,
    2,
  );
  assert.equal(
    packagePreview.counts.find((v) => v.label === "Invoices")?.count,
    1,
  );
  assert.equal(
    packagePreview.counts.find((v) => v.label === "Packages")?.count,
    2,
  );
  ok(
    "invoice and billed-package previews include the whole invoice, all packages and verified payments",
  );

  const unrelatedKey = randomUUID();
  await serialized(
    admin,
    unrelatedKey,
    { type: "qa-unrelated", partnerId: existingPartner.partnerId },
    async () => ({ invoiceId: "unrelated" }),
  );
  const legacyKey = `legacy-${randomUUID()}`;
  await db.deliveryCommand.create({
    data: {
      id: legacyKey,
      hash: "legacy",
      response: { privateCachedData: "old data" },
    },
  });
  const input = await deletion("INVOICE", invoiceId),
    key = randomUUID();
  const results = await Promise.all([
    deleteDeliveryData(admin, key, input),
    deleteDeliveryData(admin, key, input),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(
    await db.deliveryActivity.count({
      where: {
        kind: "DATA_PERMANENTLY_DELETED",
        entityId: results[0].deletionId,
      },
    }),
    1,
  );
  const deletedCounts = await Promise.all([
    db.deliveryInvoice.count({ where: { id: invoiceId } }),
    db.deliveryPayment.count({ where: { invoiceId } }),
    db.deliveryInvoiceLine.count({ where: { invoiceId } }),
    db.deliveryPaymentAllocation.count({ where: { invoiceId } }),
    db.deliveryInvoiceEvent.count({ where: { invoiceId } }),
    db.deliveryInvoiceDispatch.count({ where: { invoiceId } }),
    db.deliveryPaidInvoice.count({ where: { invoiceId } }),
    db.deliveryPaidInvoiceDispatch.count({ where: { invoiceId } }),
  ]);
  assert(deletedCounts.every((count) => count === 0));
  assert.equal(
    await db.deliveryParcel.count({ where: { partnerId: partner.partnerId! } }),
    0,
  );
  assert.equal(await db.deliveryReceipt.count({ where: { id: receiptId } }), 0);
  assert.equal(
    (await deliveryEarnings(admin, new URLSearchParams())).amount,
    beforeIncome.amount - 5000,
  );
  assert(
    await db.deliveryPartner.findUnique({ where: { id: partner.partnerId! } }),
  );
  assert(
    await db.deliveryPartner.findUnique({
      where: { id: existingPartner.partnerId! },
    }),
  );
  ok(
    "concurrent retries delete a paid ledger once, remove all dependent rows and recalculate income without deleting partners",
  );
  const oldCache = await db.deliveryCommand.findUniqueOrThrow({
    where: { id: `${admin.userId}:ADMIN:${registerKey}` },
  });
  assert(oldCache.invalidated);
  assert.deepEqual(oldCache.response, { invalidated: true });
  assert(
    (await db.deliveryCommand.findUniqueOrThrow({ where: { id: legacyKey } }))
      .invalidated,
  );
  assert(
    !(
      await db.deliveryCommand.findUniqueOrThrow({
        where: { id: `${admin.userId}:ADMIN:${unrelatedKey}` },
      })
    ).invalidated,
  );
  await assert.rejects(cmd(admin, payload, registerKey), /deleted data/);
  assert.equal(
    await db.deliveryParcel.count({ where: { partnerId: partner.partnerId! } }),
    0,
  );
  ok(
    "cached responses are erased, old keys cannot resurrect data, and unrelated scoped requests stay valid",
  );

  assert.equal(
    await db.deliveryDeletedFile.count({
      where: { deletionId: results[0].deletionId },
    }),
    1,
  );
  const failed = await cleanupDeletedFiles(
    async () => new Response("", { status: 503 }),
  );
  assert(failed.pending >= 1);
  const cleaned = await cleanupDeletedFiles(async (_url, init) => {
    assert.equal(init?.method, "DELETE");
    assert(
      JSON.parse(String(init?.body)).prefixes.some((path: string) =>
        path.endsWith(`${receiptId}.webp`),
      ),
    );
    return new Response("[]", { status: 200 });
  });
  assert.equal(cleaned.pending, 0);
  ok(
    "private-file deletion failures retain a retry job and successful cleanup removes the outbox entry (simulated Storage transport)",
  );

  await cmd(admin, register(`DELETE-RIDER-${randomUUID()}`));
  const remaining = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: partner.partnerId! },
  });
  await cmd(admin, {
    type: "assign",
    parcelIds: [remaining.id],
    driverId: rider.id!,
  });
  const completedRef = `DELETE-COMPLETED-${randomUUID()}`;
  await cmd(admin, register(completedRef));
  const completed = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: partner.partnerId!, externalReference: completedRef },
  });
  await cmd(admin, {
    type: "assign",
    parcelIds: [completed.id],
    driverId: rider.id!,
  });
  await cmd(rider, { type: "pickup", parcelIds: [completed.id] });
  await cmd(rider, { type: "deliver", parcelId: completed.id });
  const completedBefore = await db.deliveryParcel.findUniqueOrThrow({
    where: { id: completed.id },
  });
  const riderInput = await deletion("RIDER", rider.id!);
  await deleteDeliveryData(admin, randomUUID(), riderInput);
  assert.equal(
    await db.deliveryAccount.findUnique({ where: { id: rider.id! } }),
    null,
  );
  assert.equal(
    (await db.deliveryParcel.findUniqueOrThrow({ where: { id: remaining.id } }))
      .driverId,
    null,
  );
  await assert.rejects(cmd(rider, { type: "claim", parcelId: remaining.id }), {
    status: 403,
  });
  const completedAfter = await db.deliveryParcel.findUniqueOrThrow({
    where: { id: completed.id },
  });
  assert.equal(completedAfter.driverId, null);
  assert.deepEqual(completedAfter, { ...completedBefore, driverId: null });
  ok(
    "rider deletion detaches registered work, preserves completed attribution and revokes rider access; in-transit work blocks deletion",
  );

  await db.deliveryAdminGrant.create({
    data: {
      clerkUserId: partner.userId,
      email: "deletion-qa@example.invalid",
      name: partner.name,
      grantedBy: admin.userId,
    },
  });
  const email = `delete-${randomUUID()}@example.invalid`;
  const application = await db.deliveryPartnerApplication.create({
    data: {
      publicId: `IGO-APP-${randomUUID()}`,
      requestKey: randomUUID(),
      digest: "qa",
      email,
      ownerName: partner.name,
      phone: "7771234",
      businessName: "Deleted business QA",
      businessType: "BUSINESS",
      pageUrl: "",
      pickupAddress: "QA address",
      pickupArea: "Malé",
      operatingLocation: "MALE",
      dailyDeliveries: 5,
      submittedAt: new Date(),
      status: "APPROVED",
      reviewedBy: admin.userId,
      reviewedAt: new Date(),
      invitationState: "SENT",
      invitationId: `inv_${randomUUID()}`,
      invitationSentAt: new Date(),
    },
  });
  await db.deliveryPartner.update({
    where: { id: partner.partnerId! },
    data: { applicationId: application.id },
  });
  const partnerInput = await deletion("PARTNER", partner.id!);
  const partnerResult = await deleteDeliveryData(
    admin,
    randomUUID(),
    partnerInput,
  );
  assert.equal(
    await db.deliveryAccount.findUnique({ where: { id: partner.id! } }),
    null,
  );
  assert.equal(
    await db.deliveryPartner.findUnique({ where: { id: partner.partnerId! } }),
    null,
  );
  assert.equal(
    await db.deliveryPartnerApplication.findUnique({
      where: { id: application.id },
    }),
    null,
  );
  assert.equal(await activateApprovedPartner(partner.userId, email), null);
  assert.equal(
    await db.deliveryParcel.findUnique({ where: { id: remaining.id } }),
    null,
  );
  assert(
    (
      await db.deliveryAdminGrant.findUniqueOrThrow({
        where: { clerkUserId: partner.userId },
      })
    ).active,
  );
  const schema = process.env.IGO_DELIVERY_TEST_SCHEMA!;
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('igo.deletion_id', ${partnerResult.deletionId}, true)`;
      await tx.deliveryAccount.delete({ where: { id: existingPartner.id! } });
    }),
  );
  await assert.rejects(
    db.deliveryDeletion.delete({ where: { id: partnerResult.deletionId } }),
  );
  const denied = await db.$queryRaw<{ denied: boolean }[]>(
    Prisma.sql`SELECT NOT has_table_privilege('anon',${`${schema}."DeliveryDeletion"`},'SELECT') AND NOT has_table_privilege('authenticated',${`${schema}."DeliveryDeletedFile"`},'DELETE') AND NOT has_function_privilege('anon',${`${schema}.igo_deletion_allows(text,jsonb)`},'EXECUTE') AS denied`,
  );
  assert(denied[0].denied);
  ok(
    "partner deletion preserves independent admin privileges; deletion permits cannot be reused and audit/outbox data are private",
  );
}
