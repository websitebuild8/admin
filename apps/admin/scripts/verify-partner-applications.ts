import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { PrismaClient } from "../src/generated/prisma/client";
import { partnerApplicationInput } from "../src/lib/delivery/partner-application-input";
import {
  reservePartnerApplication,
  completePartnerApplication,
  reviewPartnerApplication,
  activateApprovedPartner,
} from "../src/lib/delivery/partner-applications";
import {
  sendPartnerInvitation,
  type InvitationGateway,
} from "../src/lib/delivery/partner-invitations";
import {
  preparePartnerLogo,
  partnerLogo,
} from "../src/lib/delivery/partner-logos";
import { deliveryQuery } from "../src/lib/delivery/queries";
import type { Actor } from "../src/lib/delivery/domain";

// Runs only inside verify-delivery-integration's isolated QA schema. Clerk's
// email transport is a test double; these checks never send real invitations.
export async function verifyPartnerApplications(
  db: PrismaClient,
  admin: Actor,
  other: Actor,
  ok: (label: string) => void,
) {
  assert(/^igo_qa_[a-f0-9]+$/.test(process.env.IGO_DELIVERY_TEST_SCHEMA ?? ""));
  const input = partnerApplicationInput.parse({
    businessName: "QA Business",
    businessType: "FACEBOOK",
    pageUrl: "https://www.facebook.com/qa-business",
    ownerName: "QA Owner",
    email: "qa-owner@example.test",
    phone: "7771234",
    pickupAddress: "QA building, QA street",
    pickupArea: "Malé",
    dailyDeliveries: "12",
    contactConsent: true,
  });
  const image = await preparePartnerLogo(
    await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#ffea00" },
    })
      .png()
      .toBuffer(),
  );
  const info = await sharp(image).metadata();
  assert.equal(info.width, 512);
  assert.equal(info.height, 512);
  assert.equal(info.format, "webp");
  await assert.rejects(
    preparePartnerLogo(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
      ),
    ),
  );
  ok(
    "logos are safely resized without stretching and SVG uploads are rejected",
  );
  const key = randomUUID();
  const before = await db.deliveryAccount.count();
  const application = await reservePartnerApplication(key, input, image);
  assert.equal(application.status, "PENDING");
  assert.equal(application.logoReady, false);
  assert.equal(await db.deliveryAccount.count(), before);
  assert.equal(
    (await reservePartnerApplication(key, input, image)).id,
    application.id,
  );
  await assert.rejects(
    reservePartnerApplication(
      key,
      { ...input, businessName: "Changed request" },
      image,
    ),
  );
  await assert.rejects(reservePartnerApplication(randomUUID(), input, image));
  ok(
    "public applications do not create accounts; replay and duplicate-email protection hold",
  );
  let list = (await deliveryQuery(
    admin,
    "applications",
    new URLSearchParams(),
  )) as { items: { id: string }[] };
  assert.equal(
    list.items.some((item) => item.id === application.id),
    false,
  );
  await assert.rejects(
    reviewPartnerApplication(
      admin,
      randomUUID(),
      application.id,
      "APPROVED",
      "Logo not uploaded",
    ),
  );
  ok("incomplete logo uploads cannot enter review or be approved");
  await completePartnerApplication(application.id, application.digest);
  await completePartnerApplication(application.id, application.digest);
  assert.equal(
    await db.deliveryActivity.count({
      where: {
        entityId: application.id,
        kind: "PARTNER_APPLICATION_SUBMITTED",
      },
    }),
    1,
  );
  list = (await deliveryQuery(
    admin,
    "applications",
    new URLSearchParams(),
  )) as typeof list;
  assert.equal(
    list.items.some((item) => item.id === application.id),
    true,
  );
  assert.equal(await activateApprovedPartner("qa_invited", input.email), null);
  ok(
    "complete applications enter review once and pending applicants cannot activate",
  );
  await assert.rejects(
    deliveryQuery(other, "applications", new URLSearchParams()),
  );
  await assert.rejects(
    reviewPartnerApplication(
      other,
      randomUUID(),
      application.id,
      "APPROVED",
      "Cannot approve",
    ),
  );
  await assert.rejects(partnerLogo(other, application.id));
  ok(
    "other partners cannot read applications, review them or fetch their logos",
  );
  let sent = 0;
  const provider: InvitationGateway = {
    find: async () => null,
    create: async () => {
      sent++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { id: `qa-invitation-${sent}` };
    },
  };
  await assert.rejects(
    sendPartnerInvitation(
      admin,
      application.id,
      "http://localhost:3000",
      provider,
    ),
  );
  await reviewPartnerApplication(
    admin,
    randomUUID(),
    application.id,
    "APPROVED",
    "QA approval only",
  );
  assert.equal(await db.deliveryAccount.count(), before);
  assert.equal(await activateApprovedPartner("qa_invited", input.email), null);
  await assert.rejects(
    sendPartnerInvitation(
      other,
      application.id,
      "http://localhost:3000",
      provider,
    ),
  );
  assert.equal(sent, 0);
  ok("approval alone grants no login and only admins can request invitations");
  const requests = await Promise.allSettled([
    sendPartnerInvitation(
      admin,
      application.id,
      "http://localhost:3000",
      provider,
    ),
    sendPartnerInvitation(
      admin,
      application.id,
      "http://localhost:3000",
      provider,
    ),
  ]);
  assert(requests.some((result) => result.status === "fulfilled"));
  assert.equal(sent, 1);
  await sendPartnerInvitation(
    admin,
    application.id,
    "http://localhost:3000",
    provider,
  );
  assert.equal(sent, 1);
  assert.equal(
    (
      await db.deliveryPartnerApplication.findUniqueOrThrow({
        where: { id: application.id },
      })
    ).invitationState,
    "SENT",
  );
  ok(
    "concurrent and repeated invitation requests use one provider invitation (test transport)",
  );
  assert.equal(
    await activateApprovedPartner(
      "qa_wrong_email",
      "someone-else@example.test",
    ),
    null,
  );
  const activated = await Promise.all([
    activateApprovedPartner("qa_invited", input.email),
    activateApprovedPartner("qa_invited", input.email),
  ]);
  assert(activated[0]);
  assert.equal(activated[0].id, activated[1]?.id);
  const partner = await db.deliveryPartner.findUniqueOrThrow({
    where: { applicationId: application.id },
  });
  assert.equal(await db.deliveryAccount.count(), before + 1);
  assert.equal(partner.businessName, input.businessName);
  assert.equal(
    (
      await db.deliveryPartnerApplication.findUniqueOrThrow({
        where: { id: application.id },
      })
    ).logoPath,
    application.logoPath,
  );
  assert.equal(await activateApprovedPartner("qa_takeover", input.email), null);
  ok(
    "activation is email-bound, preserves the business logo and cannot duplicate or reassign accounts",
  );
  const actor: Actor = {
    userId: "qa_invited",
    id: partner.accountId,
    partnerId: partner.id,
    role: "PARTNER",
    name: input.ownerName,
    status: "APPROVED",
  };
  for (const resource of [
    "applications",
    "partners",
    "drivers",
    "audit",
    "choices",
    "scheduler",
  ])
    await assert.rejects(deliveryQuery(actor, resource, new URLSearchParams()));
  const summary = (await deliveryQuery(
    actor,
    "overview",
    new URLSearchParams(),
  )) as {
    registered: number;
    delivered: number;
    outstanding: number;
    awaitingApproval: number;
    latest: unknown[];
  };
  assert.equal(summary.registered, 0);
  assert.equal(summary.delivered, 0);
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.awaitingApproval, 0);
  assert.equal(summary.latest.length, 0);
  for (const resource of ["packages", "invoices", "payments", "cod"]) {
    const result = (await deliveryQuery(
      actor,
      resource,
      new URLSearchParams(),
    )) as { total: number };
    assert.equal(result.total, 0);
  }
  ok(
    "new partner dashboards see only their own counts, packages, invoices, payments and COD",
  );
  const failed = await reservePartnerApplication(
    randomUUID(),
    {
      ...input,
      email: "qa-failed@example.test",
      businessName: "QA Failure Recovery",
    },
    image,
  );
  await completePartnerApplication(failed.id, failed.digest);
  await reviewPartnerApplication(
    admin,
    randomUUID(),
    failed.id,
    "APPROVED",
    "QA approval",
  );
  await assert.rejects(
    sendPartnerInvitation(admin, failed.id, "http://localhost:3000", {
      find: async () => null,
      create: async () => {
        throw new Error("Simulated provider timeout");
      },
    }),
  );
  const state = await db.deliveryPartnerApplication.findUniqueOrThrow({
    where: { id: failed.id },
  });
  assert.equal(state.status, "APPROVED");
  assert.equal(state.invitationState, "FAILED");
  assert.equal(
    await activateApprovedPartner("qa_no_invitation", state.email),
    null,
  );
  ok(
    "invitation failures retain the application and cannot silently activate partner access",
  );
  await reviewPartnerApplication(
    admin,
    randomUUID(),
    failed.id,
    "REJECTED",
    "QA rejected",
  );
  await assert.rejects(
    sendPartnerInvitation(admin, failed.id, "http://localhost:3000", provider),
  );
  ok("rejected applications cannot receive setup invitations");
}
