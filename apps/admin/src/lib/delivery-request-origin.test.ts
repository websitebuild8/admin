import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedDeliveryOrigin } from "./delivery/request-origin";

const site = "https://igodelivery.netlify.app";
const internal = "http://localhost:8888/api/partner-applications";
function request(
  origin: string | undefined,
  url = internal,
  extra: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: { ...(origin === undefined ? {} : { origin }), ...extra },
  });
}

test("delivery mutations retain exact same-origin support for local and hosted requests", () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", site])
    assert.equal(
      isAllowedDeliveryOrigin(
        request(origin, `${origin}/api/delivery/command`),
      ),
      true,
    );
});

test("Netlify public site origin survives an internal request URL and HTTPS termination", () => {
  assert.equal(isAllowedDeliveryOrigin(request(site), [undefined, site]), true);
  assert.equal(
    isAllowedDeliveryOrigin(
      request(site, "http://igodelivery.netlify.app/api/partner-applications"),
      [undefined, site],
    ),
    true,
  );
  assert.equal(isAllowedDeliveryOrigin(request(site)), false);
});

test("explicit public URL supports a custom domain and an optional trailing slash", () => {
  assert.equal(
    isAllowedDeliveryOrigin(request("https://delivery.example"), [
      "https://delivery.example/",
      site,
    ]),
    true,
  );
});

test("missing, opaque, malformed and non-web browser origins fail closed", () => {
  for (const origin of [
    undefined,
    "",
    "null",
    "not a URL",
    `${site}/`,
    `${site}/join`,
    `${site}?source=join`,
    `${site}#join`,
    `https://user:password@igodelivery.netlify.app`,
    `${site}, https://evil.example`,
    "file://igodelivery.netlify.app",
  ])
    assert.equal(isAllowedDeliveryOrigin(request(origin), [site]), false);
});

test("cross-site fetch metadata is rejected even when the supplied origin is trusted", () => {
  assert.equal(
    isAllowedDeliveryOrigin(
      request(site, internal, { "sec-fetch-site": "cross-site" }),
      [site],
    ),
    false,
  );
  assert.equal(
    isAllowedDeliveryOrigin(
      request(undefined, internal, { "sec-fetch-site": "same-origin" }),
      [site],
    ),
    false,
  );
});

test("lookalikes, unrelated Netlify sites and different schemes or ports are rejected", () => {
  for (const origin of [
    "https://evil.example",
    "https://igodelivery.netlify.app.evil.example",
    "https://evil--igodelivery.netlify.app",
    "https://another-site.netlify.app",
    "http://igodelivery.netlify.app",
    "https://igodelivery.netlify.app:8443",
  ])
    assert.equal(
      isAllowedDeliveryOrigin(
        request(origin, internal, { "sec-fetch-site": "same-site" }),
        [site],
      ),
      false,
    );
});

test("client-supplied host and forwarding headers never authorize another origin", () => {
  assert.equal(
    isAllowedDeliveryOrigin(
      request("https://evil.example", internal, {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
        forwarded: "host=evil.example;proto=https",
        "sec-fetch-site": "same-origin",
      }),
      [site],
    ),
    false,
  );
});

test("invalid public URL configuration cannot silently grant access", () => {
  for (const configured of [
    "*",
    "https://*.netlify.app",
    "http://igodelivery.netlify.app",
    `${site}/join`,
    `${site}?allow=all`,
    `${site}#join`,
    "https://user:password@igodelivery.netlify.app",
  ])
    assert.equal(isAllowedDeliveryOrigin(request(site), [configured]), false);
});
