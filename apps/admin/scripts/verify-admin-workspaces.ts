import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { ensureAdminWorkspaces } from "../src/lib/delivery/admin-workspaces";
import {
  manageAdministrator,
  type AdminDirectory,
} from "../src/lib/delivery/admin-access";
import { actorForIdentity } from "../src/lib/delivery/admin-policy";
import { deliveryCommand, notify } from "../src/lib/delivery/commands";
import { deliveryQuery } from "../src/lib/delivery/queries";
import {
  workspaceProfiles,
  updateWorkspaceProfile,
} from "../src/lib/delivery/workspace-profiles";
import { workspaceProfileInput } from "../src/lib/delivery/workspace-profile-input";
import type { Actor, DeliveryCommandInput } from "../src/lib/delivery/domain";

export async function verifyAdminWorkspaces(
  db: PrismaClient,
  root: Actor,
  originalPartner: Actor,
  originalRider: Actor,
  ok: (label: string) => void,
) {
  // Keep this verification independent of earlier grant/revoke tests, which
  // intentionally leave suspended secondary profiles as immutable history.
  async function ordinaryProfile(
    source: Actor,
    role: "PARTNER" | "DRIVER",
  ): Promise<Actor> {
    const account = await db.deliveryAccount.create({
      data: {
        clerkUserId: `qa_single_role_${randomUUID()}`,
        role,
        status: "APPROVED",
        name: source.name,
        phone: "7771234",
        ...(role === "PARTNER"
          ? {
              partner: {
                create: {
                  businessName: "QA ordinary business",
                  pageUrl: "",
                  pickupAddress: "QA pickup address",
                  pickupArea: "Malé",
                  operatingLocation: "MALE",
                },
              },
            }
          : {}),
      },
      include: { partner: true },
    });
    return {
      userId: account.clerkUserId,
      id: account.id,
      partnerId: account.partner?.id ?? null,
      role,
      status: account.status,
      name: account.name,
    };
  }
  const partner = await ordinaryProfile(originalPartner, "PARTNER"),
    rider = await ordinaryProfile(originalRider, "DRIVER");
  const cmd = (actor: Actor, input: DeliveryCommandInput, key = randomUUID()) =>
    deliveryCommand(actor, key, input);
  const accounts = (userId: string) =>
    db.deliveryAccount.findMany({
      where: { clerkUserId: userId },
      include: { partner: true },
      orderBy: [{ primary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  const actor = async (userId: string, role: "ADMIN" | "PARTNER" | "DRIVER") =>
    actorForIdentity(
      {
        userId,
        accounts: await accounts(userId),
        grant: await db.deliveryAdminGrant.findUnique({
          where: { clerkUserId: userId },
        }),
      },
      role,
    );
  const makeParcel = (
    ref: string,
    partnerId?: string,
  ): DeliveryCommandInput => ({
    type: "register",
    ...(partnerId ? { partnerId } : {}),
    parcel: {
      externalReference: ref,
      recipientName: "QA recipient",
      recipientPhone: "7771234",
      destination: "QA delivery address",
      zone: "MALE",
      description: "Isolated role check",
    },
  });
  for (const ordinary of [partner, rider]) {
    await assert.rejects(
      ensureAdminWorkspaces({ ...ordinary, role: "ADMIN", superAdmin: true }),
      { status: 403 },
    );
    await assert.rejects(workspaceProfiles(ordinary), { status: 403 });
    await assert.rejects(
      updateWorkspaceProfile(ordinary, randomUUID(), {
        role: "DRIVER",
        name: "Forged profile",
        phone: "7771234",
      }),
      { status: 403 },
    );
  }
  await assert.rejects(
    db.deliveryAccount.create({
      data: {
        clerkUserId: partner.userId,
        role: "DRIVER",
        primary: false,
        name: "Forbidden second profile",
        phone: "7771234",
      },
    }),
  );
  await assert.rejects(
    cmd(
      { ...partner, role: "APPLICANT", id: null, partnerId: null },
      {
        type: "apply",
        application: {
          role: "DRIVER",
          name: "Forbidden second profile",
          phone: "7771234",
        },
      },
    ),
    { status: 403 },
  );
  assert.equal((await accounts(partner.userId)).length, 1);
  ok(
    "ordinary partners/riders cannot initialize extra workspaces through APIs, stale applicant requests, forged admin flags or direct database inserts",
  );

  const beforeAccounts = await db.deliveryAccount.count();
  await Promise.all([ensureAdminWorkspaces(root), ensureAdminWorkspaces(root)]);
  const rootProfiles = await accounts(root.userId);
  assert.equal(rootProfiles.length, 2);
  assert(rootProfiles.every((profile) => profile.status === "APPROVED"));
  assert.equal(rootProfiles.filter((profile) => profile.primary).length, 1);
  assert.equal(await db.deliveryAccount.count(), beforeAccounts + 2);
  assert.equal(
    await db.deliveryActivity.count({
      where: { kind: "ADMIN_WORKSPACES_ENABLED", entityId: root.userId },
    }),
    1,
  );
  assert.equal(await ensureAdminWorkspaces(root), false);
  for (const role of ["ADMIN", "PARTNER", "DRIVER"] as const)
    assert.deepEqual((await actor(root.userId, role)).workspaces, [
      "ADMIN",
      "PARTNER",
      "DRIVER",
    ]);
  ok(
    "concurrent root sign-ins create exactly one approved Partner and Rider profile, with all three switcher choices and no registration",
  );

  const staffId = `qa_staff_all_roles_${randomUUID()}`;
  const directory: AdminDirectory = async (email) => ({
    userId:
      email === "existing-rider@example.test"
        ? rider.userId
        : email === "existing-partner@example.test"
          ? partner.userId
          : staffId,
    email,
    name: "QA administrator",
  });
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "GRANT",
      email: "staff@example.test",
      reason: "Isolated admin role verification",
    },
    directory,
  );
  const staffProfiles = await accounts(staffId);
  assert.equal(staffProfiles.length, 2);
  assert(staffProfiles.every((profile) => profile.status === "APPROVED"));
  const staffAdmin = await actor(staffId, "ADMIN"),
    staffPartner = await actor(staffId, "PARTNER"),
    staffRider = await actor(staffId, "DRIVER");
  let directoryCalled = false;
  await assert.rejects(
    manageAdministrator(
      { ...staffAdmin, superAdmin: true },
      randomUUID(),
      {
        action: "GRANT",
        email: "forbidden@example.test",
        reason: "Forbidden privilege escalation",
      },
      async () => {
        directoryCalled = true;
        return {
          userId: "forged",
          email: "forbidden@example.test",
          name: "Forged",
        };
      },
    ),
    { status: 403 },
  );
  assert(!directoryCalled);
  assert(!staffAdmin.superAdmin);
  assert(
    !workspaceProfileInput.safeParse({
      role: "ADMIN",
      name: "Forged",
      phone: "7771234",
      superAdmin: true,
    }).success,
  );
  ok(
    "a super-admin grant immediately initializes all operational profiles; ordinary admins cannot grant admin/super-admin access or spoof profile privileges",
  );

  const ownPartner = await actor(root.userId, "PARTNER"),
    ownRider = await actor(root.userId, "DRIVER");
  await assert.rejects(
    cmd(ownPartner, makeParcel(`UNCONFIGURED-${randomUUID()}`)),
    /operating location|pickup address/,
  );
  const profileInput = {
    role: "PARTNER" as const,
    name: "QA operator",
    phone: "7771234",
    businessName: "QA admin business",
    pickupAddress: "QA business pickup address",
    operatingLocation: "MALE" as const,
    pageUrl: "",
  };
  const saveKey = randomUUID();
  await Promise.all([
    updateWorkspaceProfile(root, saveKey, profileInput),
    updateWorkspaceProfile(root, saveKey, profileInput),
  ]);
  const ownRef = `OWN-ROLE-${randomUUID()}`,
    otherRef = `OTHER-ROLE-${randomUUID()}`;
  await cmd(ownPartner, makeParcel(ownRef));
  await cmd(partner, makeParcel(otherRef));
  const ownParcel = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: ownPartner.partnerId!, externalReference: ownRef },
  });
  const ownList = (await deliveryQuery(
    ownPartner,
    "packages",
    new URLSearchParams(),
  )) as { items: { partnerId: string }[] };
  assert(ownList.items.length > 0);
  assert(
    ownList.items.every((parcel) => parcel.partnerId === ownPartner.partnerId),
  );
  assert.notEqual(ownPartner.id, ownRider.id);
  assert.equal(ownRider.partnerId, null);
  await cmd(ownRider, { type: "claim", parcelId: ownParcel.id });
  await cmd(ownRider, { type: "pickup", parcelIds: [ownParcel.id] });
  await cmd(ownRider, { type: "deliver", parcelId: ownParcel.id });
  assert.equal(
    (await db.deliveryParcel.findUniqueOrThrow({ where: { id: ownParcel.id } }))
      .deliveredBy,
    root.userId,
  );
  ok(
    "auto-created business setup uses real details, requests no registration, preserves role-specific IDs and isolates partner data while the same identity completes rider work",
  );

  const notices = await db.$transaction(async (tx) => ({
    admin: await notify(
      tx,
      root.userId,
      "QA only admin",
      "Admin detail",
      "ADMIN",
    ),
    partner: await notify(
      tx,
      root.userId,
      "QA only partner",
      "Partner detail",
      "PARTNER",
    ),
    driver: await notify(
      tx,
      root.userId,
      "QA only rider",
      "Rider detail",
      "DRIVER",
    ),
  }));
  for (const [role, expected] of [
    ["ADMIN", "QA only admin"],
    ["PARTNER", "QA only partner"],
    ["DRIVER", "QA only rider"],
  ] as const) {
    const list = (await deliveryQuery(
      await actor(root.userId, role),
      "notifications",
      new URLSearchParams(),
    )) as { items: { title: string }[] };
    const actual = list.items.filter((notice) =>
      notice.title.startsWith("QA only"),
    );
    assert.deepEqual(
      actual.map((notice) => notice.title),
      [expected],
    );
  }
  await assert.rejects(
    cmd(ownRider, { type: "readNotice", id: notices.partner.id }),
    { status: 404 },
  );
  ok(
    "Admin, Partner and Rider notification inboxes remain isolated even when they share one email and Clerk identity",
  );

  await updateWorkspaceProfile(staffAdmin, randomUUID(), {
    ...profileInput,
    businessName: "QA staff business",
  });
  const cachedRegistration = makeParcel(`STAFF-CACHE-${randomUUID()}`),
    cachedKey = randomUUID();
  await cmd(staffPartner, cachedRegistration, cachedKey);
  const cachedAdminKey = randomUUID();
  const staffNotice = await db.deliveryNotification.findFirstOrThrow({
    where: { recipient: staffId, workspace: "ADMIN" },
  });
  await cmd(
    staffAdmin,
    { type: "readNotice", id: staffNotice.id },
    cachedAdminKey,
  );
  const otherParcel = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: partner.partnerId!, externalReference: otherRef },
  });
  await cmd(staffRider, { type: "claim", parcelId: otherParcel.id });
  await cmd(staffRider, { type: "pickup", parcelIds: [otherParcel.id] });
  const grant = await db.deliveryAdminGrant.findUniqueOrThrow({
    where: { clerkUserId: staffId },
  });
  await assert.rejects(
    manageAdministrator(
      root,
      randomUUID(),
      {
        action: "REVOKE",
        grantId: grant.id,
        reason: "Revocation check",
        retainRole: "PARTNER",
      },
      directory,
    ),
    { status: 409 },
  );
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "REVOKE",
      grantId: grant.id,
      reason: "Retain the active rider",
      retainRole: "DRIVER",
    },
    directory,
  );
  const retained = await actor(staffId, "DRIVER");
  assert.deepEqual(retained.workspaces, ["DRIVER"]);
  await assert.rejects(actor(staffId, "PARTNER"), { status: 403 });
  await assert.rejects(actor(staffId, "ADMIN"), { status: 403 });
  await assert.rejects(cmd(staffPartner, cachedRegistration, cachedKey), {
    status: 403,
  });
  await assert.rejects(
    cmd(staffAdmin, { type: "readNotice", id: staffNotice.id }, cachedAdminKey),
    { status: 403 },
  );
  await assert.rejects(workspaceProfiles(retained), { status: 403 });
  await cmd(retained, { type: "deliver", parcelId: otherParcel.id });
  assert.equal(
    await db.deliveryParcel.count({
      where: { partnerId: staffPartner.partnerId! },
    }),
    1,
  );
  ok(
    "revocation retains exactly one chosen role, protects in-transit work, suspends the extra role and denies stale cached admin/partner commands without deleting history",
  );

  const partnerOriginal = (await accounts(partner.userId))[0];
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "GRANT",
      email: "existing-partner@example.test",
      reason: "Original partner retained",
    },
    directory,
  );
  const extraRider = await actor(partner.userId, "DRIVER");
  const reassignRef = `UNASSIGN-${randomUUID()}`;
  await cmd(partner, makeParcel(reassignRef));
  const reassignParcel = await db.deliveryParcel.findFirstOrThrow({
    where: { partnerId: partner.partnerId!, externalReference: reassignRef },
  });
  await cmd(root, {
    type: "assign",
    parcelIds: [reassignParcel.id],
    driverId: extraRider.id!,
  });
  const partnerGrant = await db.deliveryAdminGrant.findUniqueOrThrow({
    where: { clerkUserId: partner.userId },
  });
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "REVOKE",
      grantId: partnerGrant.id,
      reason: "Keep original partner",
      retainRole: "PARTNER",
    },
    directory,
  );
  assert.equal(
    (
      await db.deliveryParcel.findUniqueOrThrow({
        where: { id: reassignParcel.id },
      })
    ).driverId,
    null,
  );
  assert.equal((await actor(partner.userId, "PARTNER")).id, partnerOriginal.id);
  await assert.rejects(
    cmd(extraRider, { type: "claim", parcelId: reassignParcel.id }),
    { status: 403 },
  );
  await assert.rejects(
    db.deliveryAccount.update({
      where: { id: extraRider.id! },
      data: { status: "APPROVED" },
    }),
  );
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "GRANT",
      email: "existing-partner@example.test",
      reason: "Restore staff access",
    },
    directory,
  );
  assert.equal((await actor(partner.userId, "DRIVER")).id, extraRider.id);
  ok(
    "retaining Partner releases unpicked rider assignments, database guards prevent extra-role reactivation and regrant restores the same profile IDs",
  );

  const riderOriginal = await db.deliveryAccount.findUniqueOrThrow({
    where: { id: rider.id! },
  });
  await manageAdministrator(
    root,
    randomUUID(),
    {
      action: "GRANT",
      email: "existing-rider@example.test",
      reason: "Existing rider becomes staff",
    },
    directory,
  );
  assert.deepEqual((await actor(rider.userId, "ADMIN")).workspaces, [
    "ADMIN",
    "PARTNER",
    "DRIVER",
  ]);
  assert.equal((await actor(rider.userId, "DRIVER")).id, riderOriginal.id);
  assert.equal(
    (
      await db.deliveryAccount.findUniqueOrThrow({ where: { id: rider.id! } })
    ).createdAt.getTime(),
    riderOriginal.createdAt.getTime(),
  );
  const schema = process.env.IGO_DELIVERY_TEST_SCHEMA!;
  const privilege = await db.$queryRawUnsafe<{ denied: boolean }[]>(
    `SELECT NOT has_function_privilege('anon','${schema}.igo_account_roles_guard()','EXECUTE') AS denied`,
  );
  assert(privilege[0].denied);
  ok(
    "existing riders retain their identity/history when granted all roles and direct browser clients cannot execute account-role guards",
  );
}
