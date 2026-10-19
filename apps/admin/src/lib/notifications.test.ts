import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { commandInput } from "./delivery/domain";
import {
  noticeId,
  workspacePushPayload,
} from "./delivery/notification-contract";
const id = "11111111-1111-4111-8111-111111111111";
test("notification commands accept known targets and reject arbitrary recipients/redirects", () => {
  assert(commandInput.safeParse({ type: "openNotice", id }).success);
  assert(
    !commandInput.safeParse({
      type: "openNotice",
      id,
      href: "https://evil.example",
    }).success,
  );
  assert(
    !commandInput.safeParse({
      type: "sendPartnerMessage",
      partnerId: id,
      title: "Hi!",
      message: "Short",
      recipient: "other",
    }).success,
  );
  assert(
    !commandInput.safeParse({
      type: "sendPartnerMessage",
      partnerId: id,
      title: "Hi!",
      message: "",
    }).success,
  );
  assert(
    commandInput.safeParse({
      type: "sendPartnerMessage",
      partnerId: id,
      invoiceId: id,
      title: "Reminder",
      message: "",
    }).success,
  );
  assert.equal(noticeId("bad-id"), null);
});
test("browser push contains a protected inbox link, with no message or payment details", () => {
  for (const role of ["PARTNER", "DRIVER"]) {
    const payload = workspacePushPayload({ id }, role);
    assert.equal(
      payload.url,
      `/${role === "PARTNER" ? "partner" : "rider"}/notifications?open=${id}`,
    );
    assert.equal(payload.body, "You have an update in your iGO workspace.");
  }
});
test("service workers reject external, cross-workspace and arbitrary notification targets", () => {
  const source = readFileSync("public/delivery-notifications-sw.js", "utf8");
  for (const [role, base] of [
    ["PARTNER", "/partner"],
    ["DRIVER", "/rider"],
  ]) {
    const sandbox = vm.createContext({
      URL,
      self: {
        IGO_WORKSPACE: role,
        location: { origin: "https://igo.example" },
        addEventListener() {},
      },
    });
    vm.runInContext(source, sandbox);
    const path = (url: string) =>
      vm.runInContext(`safePath(${JSON.stringify(url)})`, sandbox);
    assert.equal(
      path(`${base}/notifications?open=${id}`),
      `${base}/notifications?open=${id}`,
    );
    for (const raw of [
      "https://evil.example/rider/notifications",
      "//evil.example",
      "/api/delivery/receipt",
      "/delivery/overview",
      `${base}/notifications?open=invalid`,
    ])
      assert.equal(path(raw), `${base}/notifications`);
    assert.equal(
      path(
        role === "PARTNER" ? "/rider/notifications" : "/partner/notifications",
      ),
      `${base}/notifications`,
    );
  }
});
