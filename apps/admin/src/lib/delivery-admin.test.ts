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
  const newcomer = actorForIdentity({ ...identity, account: null });
  assert.equal(newcomer.role, "ADMIN");
  assert.equal(newcomer.status, "APPROVED");
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
test("current admins can select all three profiles and non-admins only their primary profile", () => {
  const profiles = [
    { ...account, primary: true },
    {
      ...account,
      id: "rider",
      role: "DRIVER" as const,
      partner: null,
      primary: false,
    },
  ];
  const adminIdentity = {
    userId: "user_staff",
    accounts: profiles,
    grant: { active: true, name: "Staff" },
  };
  assert.deepEqual(actorForIdentity(adminIdentity).workspaces, [
    "ADMIN",
    "PARTNER",
    "DRIVER",
  ]);
  const rider = actorForIdentity(adminIdentity, "DRIVER");
  assert.equal(rider.id, "rider");
  assert.equal(rider.partnerId, null);
  assert.equal(actorForIdentity(adminIdentity, "PARTNER").partnerId, "partner");
  const revoked = {
    ...adminIdentity,
    grant: { ...adminIdentity.grant, active: false },
  };
  assert.deepEqual(actorForIdentity(revoked).workspaces, ["PARTNER"]);
  assert.throws(() => actorForIdentity(revoked, "ADMIN"));
  assert.throws(() => actorForIdentity(revoked, "DRIVER"));
  assert.equal(actorForIdentity(revoked, "DRIVER", false).role, "PARTNER");
});
test("retained rider access cannot be used to open a historical secondary partner profile", () => {
  const profiles = [
    { ...account, primary: false },
    {
      ...account,
      id: "retained_rider",
      role: "DRIVER" as const,
      partner: null,
      primary: true,
    },
  ];
  const ordinary = { userId: "user_ordinary", accounts: profiles, grant: null };
  assert.deepEqual(actorForIdentity(ordinary).workspaces, ["DRIVER"]);
  assert.throws(() => actorForIdentity(ordinary, "PARTNER"));
  assert.equal(
    actorForIdentity(ordinary, "PARTNER", false).id,
    "retained_rider",
  );
});
