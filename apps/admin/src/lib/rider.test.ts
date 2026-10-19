import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  allowedPushEndpoint,
  dropoffAddress,
  googleDirections,
  googleRouteEmbed,
  pickupAddress,
  pushRetry,
  pushSubscriptionInput,
  riderPushPayload,
  type RiderParcel,
} from "./delivery/rider-contract";
import {
  pushSchedulerHeaders,
  validPushScheduler,
} from "./delivery/push-scheduler";
const parcel = {
  destination: "H. Example, entrance A & B",
  zone: "HULHUMALE_2",
  partner: { pickupAddress: "M. Shop #2", pickupArea: "Malé" },
} as RiderParcel;
test("Google URLs encode saved Maldives addresses and omit a fabricated device origin", () => {
  const url = new URL(googleDirections(dropoffAddress(parcel))!);
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(
    url.searchParams.get("destination"),
    "H. Example, entrance A & B, Hulhumalé Phase 2, Maldives",
  );
  assert.equal(url.searchParams.get("origin"), null);
  assert.equal(url.searchParams.get("key"), null);
  const embed = new URL(googleRouteEmbed("test-key", parcel)!);
  assert.equal(embed.searchParams.get("origin"), pickupAddress(parcel));
  assert.equal(embed.searchParams.get("mode"), "driving");
  assert.equal(googleDirections("a".repeat(2100)), null);
});
test("boat deliveries show a place map rather than inventing a driving route across the sea", () => {
  const boat = { ...parcel, zone: "BOAT", destination: "Jetty 5, Malé" };
  const url = new URL(googleRouteEmbed("test-key", boat)!);
  assert.equal(url.pathname, "/maps/embed/v1/place");
  assert.equal(url.searchParams.get("q"), "Jetty 5, Malé, Maldives");
  assert.equal(url.searchParams.has("origin"), false);
});
test("subscription endpoints cannot turn the push sender into an arbitrary HTTP client", () => {
  for (const value of [
    "http://fcm.googleapis.com/send/1",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://user:secret@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:444/x",
    "https://fcm.googleapis.com/",
    "https://web.push.apple.com/x#fragment",
  ])
    assert.equal(allowedPushEndpoint(value), false, value);
  for (const value of [
    "https://fcm.googleapis.com/fcm/send/1",
    "https://updates.push.services.mozilla.com/wpush/v2/1",
    "https://web.push.apple.com/Q1",
    "https://wns2-db5p.notify.windows.com/w/?token=a",
  ])
    assert.equal(allowedPushEndpoint(value), true, value);
  assert.equal(
    pushSubscriptionInput.safeParse({
      action: "subscribe",
      endpoint: "https://fcm.googleapis.com/x",
      keys: { p256dh: "a", auth: "b" },
    }).success,
    false,
  );
  assert.equal(
    pushSubscriptionInput.safeParse({
      action: "unsubscribe",
      endpoint: "https://fcm.googleapis.com/x",
      driverId: "forged",
    }).success,
    false,
  );
});
test("lock-screen push payloads contain no customer names, money or addresses", () => {
  const payload = riderPushPayload({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Collection assigned",
  });
  assert.equal(payload.url, "/rider/collections");
  assert.equal(payload.tag, "igo-11111111-1111-4111-8111-111111111111");
  assert.deepEqual(Object.keys(payload), ["title", "body", "tag", "url"]);
  assert.equal(
    riderPushPayload({
      id: "x",
      title: "Private account detail",
    }).body.includes("Private"),
    false,
  );
});
test("push retries back off, retire expired endpoints and stop permanent failures", () => {
  assert.equal(pushRetry(1, 503), 60000);
  assert.equal(pushRetry(3, 429), 240000);
  assert.equal(pushRetry(1, 410), "expired");
  assert.equal(pushRetry(1, 404), "expired");
  assert.equal(pushRetry(1, 401), "failed");
  assert.equal(pushRetry(5), "failed");
});
test("scheduler uses a short-lived signature without exposing its signing secret", () => {
  const secret = "s".repeat(64),
    now = 1792100000000;
  const headers = new Headers(pushSchedulerHeaders(secret, now));
  assert.equal(validPushScheduler(headers, secret, now), true);
  assert.equal(validPushScheduler(headers, "wrong".repeat(8), now), false);
  assert.equal(validPushScheduler(headers, secret, now + 91000), false);
  assert.equal(validPushScheduler(headers, secret, now - 91000), false);
  assert.equal(JSON.stringify([...headers]).includes(secret), false);
});
test("service worker always displays an alert and restricts notification navigation", async () => {
  const handlers: Record<string, (event: unknown) => void> = {},
    shown: unknown[] = [],
    opened: string[] = [];
  const worker = {
    IGO_WORKSPACE: "DRIVER",
    location: { origin: "https://igo.example" },
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers[name] = handler;
    },
    registration: {
      showNotification: async (title: string, options: unknown) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  vm.runInNewContext(await readFile("public/delivery-notifications-sw.js", "utf8"), {
    self: worker,
    URL,
  });
  let work: Promise<unknown> | undefined;
  handlers.push({
    data: {
      json: () => ({
        title: "Sensitive name",
        body: "Private address",
        url: "https://evil.test/",
        tag: "bad",
      }),
    },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise;
    },
  });
  await work;
  assert.equal(shown.length, 1);
  assert.equal(JSON.stringify(shown).includes("Private address"), false);
  handlers.notificationclick({
    notification: { close() {}, data: { url: "https://evil.test/" } },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise;
    },
  });
  await work;
  assert.deepEqual(opened, ["/rider/notifications"]);
});
