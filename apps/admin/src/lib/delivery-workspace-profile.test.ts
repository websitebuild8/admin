import test from "node:test";
import assert from "node:assert/strict";
import { workspaceProfileInput } from "./delivery/workspace-profile-input";
const partner = {
  role: "PARTNER",
  name: "Owner",
  phone: "7771234",
  businessName: "My page",
  pickupAddress: "Building on street",
  operatingLocation: "MALE",
  pageUrl: "facebook.com/my-page",
};
test("staff workspace updates validate real pickup details and normalize an optional social address", () => {
  const parsed = workspaceProfileInput.parse(partner);
  assert(parsed.role === "PARTNER");
  assert.equal(parsed.pageUrl, "https://facebook.com/my-page");
  assert(workspaceProfileInput.safeParse({ ...partner, pageUrl: "" }).success);
  for (const fields of [
    { pickupAddress: "" },
    { phone: "123" },
    { operatingLocation: "ANYWHERE" },
    { pageUrl: "javascript:alert(1)" },
  ])
    assert(!workspaceProfileInput.safeParse({ ...partner, ...fields }).success);
});
test("profile forms cannot grant privileges, select another identity or register an admin", () => {
  for (const fields of [
    { userId: "user_other" },
    { role: "ADMIN" },
    { superAdmin: true },
    { active: true },
    { email: "other@example.test" },
    { primary: true },
  ])
    assert(!workspaceProfileInput.safeParse({ ...partner, ...fields }).success);
  assert(
    workspaceProfileInput.safeParse({
      role: "DRIVER",
      name: "Rider",
      phone: "7771234",
    }).success,
  );
});
