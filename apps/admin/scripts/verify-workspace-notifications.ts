import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliveryCommand } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import { financeQuery } from "../src/lib/delivery/finance";
import {
  savePushSubscription,
  dispatchRiderPush,
} from "../src/lib/delivery/push";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";
import type {
  FinanceList,
  FinanceSummary,
} from "../src/lib/delivery/finance-contract";
export async function verifyWorkspaceNotifications(
  db: PrismaClient,
  admin: Actor,
  partner: Actor,
  other: Actor,
  driver: Actor,
  ok: (s: string) => void,
) {
  const cmd = (who: Actor, c: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(who, key, c);
  const query = (who: Actor, resource: string, id: string) =>
    deliveryQuery(who, resource, new URLSearchParams({ id }));
  const saved = [
    process.env.WEB_PUSH_PUBLIC_KEY,
    process.env.WEB_PUSH_PRIVATE_KEY,
    process.env.WEB_PUSH_SUBJECT,
  ];
  const keys = webpush.generateVAPIDKeys();
  process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey;
  process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
  process.env.WEB_PUSH_SUBJECT = "https://example.com";
  try {
    await savePushSubscription(partner, {
      action: "subscribe",
      endpoint: `https://fcm.googleapis.com/fcm/send/qa-partner-${randomUUID()}`,
      keys: { p256dh: keys.publicKey, auth: "a".repeat(22) },
    });
    const subscription = await db.deliveryPushSubscription.findFirstOrThrow({
      where: { driverId: partner.id! },
    });
    await assert.rejects(
      savePushSubscription(other, {
        action: "unsubscribe",
        endpoint: subscription.endpoint,
      }),
      { status: 409 },
    );
    await assert.rejects(
      savePushSubscription(admin, {
        action: "unsubscribe",
        endpoint: subscription.endpoint,
      }),
      { status: 409 },
    );
    ok(
      "approved partners can enable push; other accounts cannot take or remove their subscription",
    );
    const input = {
      type: "sendPartnerMessage" as const,
      partnerId: partner.partnerId!,
      title: "QA business update",
      message: "Disposable message for this business only.",
    };
    const key = randomUUID();
    const [first, replayed] = await Promise.all([
      cmd(admin, input, key),
      cmd(admin, input, key),
    ]);
    assert.deepEqual(first, replayed);
    assert("notificationId" in first);
    const id = first.notificationId as string;
    assert.equal(
      await db.deliveryPushMessage.count({ where: { notificationId: id } }),
      1,
    );
    assert.equal(
      await db.deliveryActivity.count({
        where: { kind: "PARTNER_MESSAGE_SENT", entityId: id },
      }),
      1,
    );
    for (const who of [partner, driver])
      await assert.rejects(cmd(who, input), { status: 403 });
    ok(
      "admin messages are audited and retry-safe; partners and riders cannot send them",
    );
    for (const who of [other, driver, admin])
      await assert.rejects(cmd(who, { type: "openNotice", id }), {
        status: 404,
      });
    await assert.rejects(query(other, "notification-detail", id), {
      status: 404,
    });
    const opened = await cmd(partner, { type: "openNotice", id });
    assert.equal(
      "href" in opened && opened.href,
      `/partner/notifications?messageId=${id}`,
    );
    assert(
      (await db.deliveryNotification.findUniqueOrThrow({ where: { id } }))
        .readAt,
    );
    ok(
      "opening a general message marks only its owner's message read; other workspaces are denied",
    );
    const parcel = await db.deliveryParcel.create({
      data: {
        publicId: `QA-NOTICE-${randomUUID()}`,
        partnerId: partner.partnerId!,
        externalReference: randomUUID(),
        recipientName: "Private QA",
        recipientPhone: "7771234",
        destination: "QA",
        zone: "MALE",
        origin: "MALE",
        destinationLabel: "Malé",
        fee: 2500,
        driverId: driver.id!,
      },
    });
    const notice = await db.deliveryNotification.create({
      data: {
        recipient: partner.userId,
        workspace: "PARTNER",
        title: "Package assigned",
        message: "Private QA",
        targetType: "PACKAGE",
        targetId: parcel.id,
      },
    });
    assert.equal(
      "href" in (await cmd(partner, { type: "openNotice", id: notice.id })),
      true,
    );
    const link = await cmd(partner, { type: "openNotice", id: notice.id });
    assert.equal(
      "href" in link && link.href,
      `/partner/packages?packageId=${parcel.id}`,
    );
    await assert.rejects(query(other, "package-detail", parcel.id), {
      status: 404,
    });
    await query(driver, "package-detail", parcel.id);
    const forged = await db.deliveryNotification.create({
      data: {
        recipient: other.userId,
        workspace: "PARTNER",
        title: "QA",
        message: "QA",
        targetType: "PACKAGE",
        targetId: parcel.id,
      },
    });
    const denied = await cmd(other, { type: "openNotice", id: forged.id });
    assert.equal(
      "href" in denied && denied.href,
      `/partner/notifications?messageId=${forged.id}`,
    );
    ok(
      "package links open their exact record and recheck current partner/rider ownership",
    );
    await cmd(driver, { type: "pickup", parcelIds: [parcel.id] });
    await cmd(driver, { type: "deliver", parcelId: parcel.id });
    const issued = await cmd(admin, {
      type: "createPartnerInvoice",
      partnerId: partner.partnerId!,
      expectedCount: 1,
      expectedTotal: 2500,
    });
    assert("invoiceId" in issued && typeof issued.invoiceId === "string");
    const invoiceId = issued.invoiceId;
    const reminder = {
      ...input,
      title: "Payment reminder",
      invoiceId,
      message: "Please check your invoice.",
    };
    const reminded = await cmd(admin, reminder);
    assert("notificationId" in reminded);
    const invoiceNotice = await db.deliveryNotification.findUniqueOrThrow({
      where: { id: reminded.notificationId as string },
    });
    assert.equal(invoiceNotice.targetId, invoiceId);
    assert(invoiceNotice.message.includes("25.00"));
    const invoiceLink = await cmd(partner, {
      type: "openNotice",
      id: invoiceNotice.id,
    });
    assert.equal(
      "href" in invoiceLink && invoiceLink.href,
      `/partner/finance?invoiceId=${invoiceId}`,
    );
    await assert.rejects(
      cmd(admin, { ...reminder, partnerId: other.partnerId! }),
    );
    ok(
      "payment reminders use the current invoice balance and link to its owned invoice",
    );
    const list = (await financeQuery(
      partner,
      "partner-finance",
      new URLSearchParams({ partnerId: other.partnerId! }),
    )) as unknown as FinanceList;
    assert.equal(list.total, 1);
    assert.equal((list.items[0] as { id: string }).id, invoiceId);
    const foreign = (await financeQuery(
      other,
      "partner-finance",
      new URLSearchParams({ partnerId: partner.partnerId! }),
    )) as unknown as FinanceList;
    assert.equal(foreign.total, 0);
    const summary = (await financeQuery(
      partner,
      "partner-finance-summary",
      new URLSearchParams({ partnerId: other.partnerId! }),
    )) as FinanceSummary;
    assert.equal(summary.outstanding, 2500);
    for (const who of [driver, admin])
      await assert.rejects(
        financeQuery(who, "partner-finance", new URLSearchParams()),
        { status: 403 },
      );
    await assert.rejects(
      financeQuery(partner, "finance", new URLSearchParams()),
      { status: 403 },
    );
    ok(
      "partner finance forcibly scopes lists and totals to the current business, including forged filters",
    );
    const [receipt] = await db.deliveryReceipt.createManyAndReturn({
      data: {
        partnerId: partner.partnerId!,
        path: `qa/${randomUUID()}.webp`,
        sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        bytes: 100,
        ready: true,
      },
    });
    // Receipt attribution and ledger verification follow the normal commands.
    const payment = await cmd(partner, {
      type: "submitPayment",
      invoiceId,
      receiptId: receipt.id,
      bankReference: "QA notice payment",
      amount: 2500,
    });
    assert("invoiceId" in payment);
    const transfer = await db.deliveryPayment.findFirstOrThrow({
      where: { invoiceId },
    });
    const adminNotice = await db.deliveryNotification.findFirstOrThrow({
      where: {
        recipient: admin.userId,
        targetType: "PAYMENT",
        targetId: transfer.id,
      },
    });
    const reviewLink = await cmd(admin, {
      type: "openNotice",
      id: adminNotice.id,
    });
    assert.equal(
      "href" in reviewLink && reviewLink.href,
      `/delivery/finance?invoiceId=${invoiceId}&view=payments`,
    );
    await cmd(admin, {
      type: "reviewPayment",
      paymentId: transfer.id,
      decision: "CONFIRM",
      confirmedAmount: 2500,
      note: "QA bank verified",
    });
    await assert.rejects(cmd(admin, reminder), { status: 409 });
    ok(
      "bank-transfer alerts open invoice payments; fully paid invoices reject new reminders",
    );
    // SQL-generated notices also enqueue push without calling the JavaScript notifier.
    const sqlNotice = await db.deliveryNotification.create({
      data: {
        recipient: partner.userId,
        workspace: "PARTNER",
        title: "SQL notification QA",
        message: "Private financial details",
      },
    });
    assert.equal(
      await db.deliveryPushMessage.count({
        where: { notificationId: sqlNotice.id },
      }),
      1,
    );
    const wrong = await db.deliveryNotification.create({
      data: {
        recipient: partner.userId,
        workspace: "DRIVER",
        title: "Other workspace",
        message: "Must not push",
      },
    });
    assert.equal(
      await db.deliveryPushMessage.count({
        where: { notificationId: wrong.id },
      }),
      0,
    );
    const payloads: string[] = [];
    await dispatchRiderPush(async (_s, payload) => {
      payloads.push(payload);
    });
    assert(payloads.length > 0);
    for (const payload of payloads) {
      assert(!payload.includes("Private"));
      assert(!payload.includes("25.00"));
      assert(
        JSON.parse(payload).url === "/partner/notifications",
      );
    }
    ok(
      "database notices queue role-specific generic partner pushes without lock-screen financial data",
    );
    const scheduledParcel = await db.deliveryParcel.create({ data: {
      publicId: `QA-SCHEDULE-${randomUUID()}`, partnerId: partner.partnerId!, externalReference: randomUUID(),
      recipientName: "QA", recipientPhone: "7771234", destination: "QA", zone: "MALE", origin: "MALE", destinationLabel: "Malé", fee: 2500, driverId: driver.id!,
    } });
    await cmd(driver, { type: "pickup", parcelIds: [scheduledParcel.id] });
    await cmd(driver, { type: "deliver", parcelId: scheduledParcel.id });
    const cutoff = new Date(Date.now()+1000);
    await db.deliveryPartner.update({ where: { id: partner.partnerId! }, data: { nextInvoiceAt: cutoff } });
    const schema=process.env.IGO_DELIVERY_TEST_SCHEMA!;
    assert(/^igo_qa_[a-f0-9]+$/.test(schema));
    await db.$queryRawUnsafe(`SELECT "${schema}".igo_invoice_due($1::timestamptz)`,new Date(cutoff.getTime()+1000));
    const billed=await db.deliveryInvoiceLine.findUniqueOrThrow({ where: { parcelId: scheduledParcel.id } });
    const scheduledNotice=await db.deliveryNotification.findFirstOrThrow({ where: { targetId: billed.invoiceId, targetType: "INVOICE", title: "Daily delivery invoice" } });
    assert.equal(scheduledNotice.workspace,"PARTNER");
    assert.equal(await db.deliveryPushMessage.count({ where: { notificationId: scheduledNotice.id } }),1);
    await db.$queryRawUnsafe(`SELECT "${schema}".igo_invoice_due($1::timestamptz)`,new Date(cutoff.getTime()+1000));
    assert.equal(await db.deliveryNotification.count({ where: { targetId: billed.invoiceId, targetType: "INVOICE", title: "Daily delivery invoice" } }),1);
    ok("scheduled SQL invoicing creates one linked partner notice and one push job, including replay");
    await cmd(partner, { type: "clearNotices" });
    assert.equal(
      await db.deliveryActivity.count({
        where: { kind: "PARTNER_MESSAGE_SENT", entityId: id },
      }),
      1,
    );
    await assert.rejects(query(partner, "notification-detail", id), {
      status: 404,
    });
    ok(
      "clear-all deletes inbox/push entries while preserving the administrator's sent-message audit",
    );
    await db.deliveryPushSubscription.deleteMany({
      where: { driverId: partner.id! },
    });
  } finally {
    for (const [index, name] of [
      "WEB_PUSH_PUBLIC_KEY",
      "WEB_PUSH_PRIVATE_KEY",
      "WEB_PUSH_SUBJECT",
    ].entries()) {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    }
  }
}
