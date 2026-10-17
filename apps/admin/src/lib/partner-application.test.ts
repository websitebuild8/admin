import test from "node:test";
import assert from "node:assert/strict";
import {
  partnerApplicationInput,
  normalizePartnerPageUrl,
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
  operatingLocation: "MALE",
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
test("business page links add missing HTTPS and preserve short/share links", () => {
  for (const [pageUrl, expected] of [
    ["facebook.com/island-shop", "https://facebook.com/island-shop"],
    ["www.facebook.com/island-shop", "https://www.facebook.com/island-shop"],
    [" FB.COM/IslandShop ", "https://fb.com/IslandShop"],
    ["fb.me/IslandShop", "https://fb.me/IslandShop"],
    ["on.fb.me/AbC123", "https://on.fb.me/AbC123"],
    ["http://facebook.com/shop", "https://facebook.com/shop"],
    ["//m.facebook.com/shop", "https://m.facebook.com/shop"],
    [
      "facebook.com/share/AbC123/?mibextid=xyz",
      "https://facebook.com/share/AbC123/?mibextid=xyz",
    ],
    [
      "m.facebook.com/profile.php?id=123456789",
      "https://m.facebook.com/profile.php?id=123456789",
    ],
  ]) {
    const parsed = partnerApplicationInput.parse({ ...input, pageUrl });
    assert.equal(parsed.pageUrl, expected);
    assert.equal(normalizePartnerPageUrl(parsed.pageUrl), expected);
  }
});
test("Instagram and optional business websites normalize before validation", () => {
  assert.equal(
    partnerApplicationInput.parse({
      ...input,
      businessType: "INSTAGRAM",
      pageUrl: "instagram.com/island.shop/?igsh=AbC123",
    }).pageUrl,
    "https://instagram.com/island.shop/?igsh=AbC123",
  );
  assert.equal(
    partnerApplicationInput.parse({
      ...input,
      businessType: "BUSINESS",
      pageUrl: "islandshop.mv",
    }).pageUrl,
    "https://islandshop.mv/",
  );
  assert.equal(
    partnerApplicationInput.parse({
      ...input,
      businessType: "BUSINESS",
      pageUrl: "   ",
    }).pageUrl,
    "",
  );
});
test("business applications enforce social-page hosts and safe URLs", () => {
  for (const pageUrl of [
    "javascript:alert(1)",
    "ftp://facebook.com/shop",
    "https://facebook.com.evil.test/shop",
    "https://evil.test@facebook.com/shop",
    "facebook.com@evil.test/shop",
    "https://fb.me.evil.test/shop",
    "javascript:facebook.com/shop",
    "data:text/html,facebook.com",
    "not a valid page link",
    "https://instagram.com/shop",
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

test("business registration requires an explicit operating phase", () => {
  for (const operatingLocation of ["MALE", "HULHUMALE_1", "HULHUMALE_2"])
    assert.equal(
      partnerApplicationInput.safeParse({ ...input, operatingLocation })
        .success,
      true,
    );
  for (const operatingLocation of ["", "Hulhumalé", "BOAT", undefined])
    assert.equal(
      partnerApplicationInput.safeParse({ ...input, operatingLocation })
        .success,
      false,
    );
});

test("social business links are optional for every business type", () => {
  for (const businessType of ["FACEBOOK", "INSTAGRAM", "BUSINESS"]) {
    for (const pageUrl of ["", "   ", undefined])
      assert.equal(
        partnerApplicationInput.parse({ ...input, businessType, pageUrl })
          .pageUrl,
        "",
      );
  }
});
