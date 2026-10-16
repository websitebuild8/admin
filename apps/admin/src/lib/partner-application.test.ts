import test from "node:test";
import assert from "node:assert/strict";
import {
  partnerApplicationInput,
  verifiedPrimaryEmail,
} from "./delivery/partner-application-input";
const input = {
  businessName: "Island Shop",
  businessType: "FACEBOOK",
  pageUrl: "https://www.facebook.com/island-shop",
  ownerName: "Business Owner",
  email: "OWNER@EXAMPLE.COM",
  phone: "7771234",
  pickupAddress: "Building, street, first floor",
  pickupArea: "Malé",
  dailyDeliveries: "10",
  contactConsent: true,
};

test("business application normalizes its email and delivery estimate", () => {
  const parsed = partnerApplicationInput.parse({
    ...input,
    email: "  OWNER@EXAMPLE.COM  ",
  });
  assert.equal(parsed.email, "owner@example.com");
  assert.equal(parsed.dailyDeliveries, 10);
});
test("public applications cannot submit roles, approval or identity claims", () => {
  for (const extra of [
    { role: "ADMIN" },
    { status: "APPROVED" },
    { clerkUserId: "user_fake" },
    { invitationState: "SENT" },
  ])
    assert.equal(
      partnerApplicationInput.safeParse({ ...input, ...extra }).success,
      false,
    );
});
test("business applications enforce social-page hosts and safe URLs", () => {
  for (const pageUrl of [
    "javascript:alert(1)",
    "http://facebook.com/shop",
    "https://facebook.com.evil.test/shop",
    "https://evil.test@facebook.com/shop",
    "",
  ])
    assert.equal(
      partnerApplicationInput.safeParse({ ...input, pageUrl }).success,
      false,
    );
  assert.equal(
    partnerApplicationInput.safeParse({
      ...input,
      businessType: "INSTAGRAM",
      pageUrl: "https://www.instagram.com/shop",
    }).success,
    true,
  );
  assert.equal(
    partnerApplicationInput.safeParse({
      ...input,
      businessType: "BUSINESS",
      pageUrl: "",
    }).success,
    true,
  );
});
test("applications require valid ownership contact and bounded delivery volumes", () => {
  for (const patch of [
    { contactConsent: false },
    { phone: "123" },
    { dailyDeliveries: true },
    { dailyDeliveries: "" },
    { dailyDeliveries: 0 },
    { dailyDeliveries: 10001 },
    { dailyDeliveries: 1.5 },
    { email: "bad email" },
  ])
    assert.equal(
      partnerApplicationInput.safeParse({ ...input, ...patch }).success,
      false,
    );
});
test("activation uses only Clerk's verified primary email", () => {
  const primary = {
    id: "primary",
    emailAddress: "OWNER@EXAMPLE.COM",
    verification: { status: "verified" },
  };
  assert.equal(
    verifiedPrimaryEmail({
      primaryEmailAddressId: "primary",
      emailAddresses: [primary],
    }),
    "owner@example.com",
  );
  assert.equal(
    verifiedPrimaryEmail({
      primaryEmailAddressId: "primary",
      emailAddresses: [{ ...primary, verification: { status: "unverified" } }],
    }),
    null,
  );
  assert.equal(
    verifiedPrimaryEmail({
      primaryEmailAddressId: "other",
      emailAddresses: [primary],
    }),
    null,
  );
  assert.equal(
    verifiedPrimaryEmail({ primaryEmailAddressId: null, emailAddresses: [] }),
    null,
  );
});
