import test from "node:test";
import assert from "node:assert/strict";
import {
  actorForIdentity,
  isSuperAdmin,
  requireSuperAdmin,
  superAdminIds,
  type DeliveryIdentity,
} from "./delivery/admin-policy";
import {
  workspaceFromPath,
  workspaceFromRequest,
} from "./delivery/workspace-contract";
const account = {
  id: "account",
  role: "PARTNER" as const,
  status: "APPROVED",
  name: "Owner",
  partner: {
    id: "partner",
    businessName: "Shop",
    application: { logoReady: false },
  },
};
const identity: DeliveryIdentity = {
  userId: "user_partner",
  account,
  grant: { active: true, name: "Owner" },
};
test("current configured administrators become protected super admins", () => {
  const before = process.env.ADMIN_CLERK_USER_IDS;
  process.env.ADMIN_CLERK_USER_IDS = "user_root";
  try {
    assert(isSuperAdmin("user_root"));
    const actor = actorForIdentity({
      userId: "user_root",
      account: null,
      grant: null,
    });
    assert.equal(actor.role, "ADMIN");
    assert.equal(actor.superAdmin, true);
    assert.doesNotThrow(() => requireSuperAdmin(actor));
    assert.deepEqual(
      superAdminIds({
        ADMIN_CLERK_USER_IDS: " a, a, b ",
        SUPER_ADMIN_CLERK_USER_IDS: "b,c",
      }),
      ["a", "b", "c"],
    );
  } finally {
    if (before === undefined) delete process.env.ADMIN_CLERK_USER_IDS;
    else process.env.ADMIN_CLERK_USER_IDS = before;
  }
});
test("partner and rider admin grants add workspaces without replacing identities", () => {
  const admin = actorForIdentity(identity);
  assert.equal(admin.role, "ADMIN");
  assert.equal(admin.partnerId, null);
  assert.equal(admin.id, null);
  assert.equal(admin.superAdmin, false);
  assert.deepEqual(admin.workspaces, ["ADMIN", "PARTNER"]);
  const partner = actorForIdentity(identity, "PARTNER");
  assert.equal(partner.role, "PARTNER");
  assert.equal(partner.partnerId, "partner");
  assert.equal(partner.id, "account");
  const rider = actorForIdentity(
    { ...identity, account: { ...account, role: "DRIVER", partner: null } },
    "DRIVER",
  );
  assert.equal(rider.id, "account");
  assert.equal(rider.partnerId, null);
  assert.deepEqual(rider.workspaces, ["ADMIN", "DRIVER"]);
  assert.throws(
    () => requireSuperAdmin({ ...admin, superAdmin: true }),
    /Only the super admin/,
  );
  assert.throws(
    () => actorForIdentity(identity, "DRIVER"),
    /does not have access/,
  );
});
test("revocation keeps approved workspaces and admin grants do not approve pending roles", () => {
  const actor = actorForIdentity({
    ...identity,
    grant: { active: false, name: "Former admin" },
  });
  assert.equal(actor.role, "PARTNER");
  assert.deepEqual(actor.workspaces, ["PARTNER"]);
  assert.throws(() => actorForIdentity({ ...identity, grant: null }, "ADMIN"));
  const pending = actorForIdentity(
    { ...identity, account: { ...account, status: "PENDING" } },
    "PARTNER",
  );
  assert.equal(pending.status, "PENDING");
  assert.deepEqual(pending.workspaces, ["ADMIN"]);
  const newcomer = actorForIdentity({ ...identity, account: null }, "DRIVER");
  assert.equal(newcomer.role, "APPLICANT");
  assert.equal(newcomer.status, "UNREGISTERED");
  assert.deepEqual(newcomer.workspaces, ["ADMIN"]);
});
test("workspace selection is request-scoped, with no cross-origin referrer trust", () => {
  assert.equal(workspaceFromPath("/partner/invoices"), "PARTNER");
  assert.equal(workspaceFromPath("/partnership"), undefined);
  assert.equal(
    workspaceFromRequest(
      new Request("https://igo.test/api/delivery/packages", {
        headers: { "x-igo-workspace": "DRIVER" },
      }),
    ),
    "DRIVER",
  );
  assert.equal(
    workspaceFromRequest(
      new Request("https://igo.test/api/delivery/packages", {
        headers: { referer: "https://igo.test/partner/invoices" },
      }),
    ),
    "PARTNER",
  );
  assert.equal(
    workspaceFromRequest(
      new Request("https://igo.test/api/delivery/packages", {
        headers: { referer: "https://evil.test/delivery" },
      }),
    ),
    undefined,
  );
  assert.throws(() =>
    workspaceFromRequest(
      new Request("https://igo.test/api/delivery/packages", {
        headers: { "x-igo-workspace": "SUPER_ADMIN" },
      }),
    ),
  );
});
