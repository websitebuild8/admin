import assert from "node:assert/strict";
import test from "node:test";
import {
  dateFilter,
  parcelPeriodWhere,
  periodQuery,
  periodSelection,
  reportingRange,
  withPeriod,
} from "./delivery/reporting-period";

test("shared periods retain Maldives boundaries, all-time defaults and legacy Today links", () => {
  const now = new Date("2026-10-19T05:00:00Z");
  const daily = reportingRange(new URLSearchParams("period=TODAY"), now);
  assert.equal(daily.start!.toISOString(), "2026-10-18T19:00:00.000Z");
  assert.equal(daily.end!.toISOString(), "2026-10-19T19:00:00.000Z");
  assert.equal(dateFilter(new URLSearchParams(), now), undefined);
  assert.equal(dateFilter(new URLSearchParams("period="), now), undefined);
  assert.equal(
    reportingRange(
      new URLSearchParams("period=MONTHLY&value=2024-02"),
      now,
    ).end!.toISOString(),
    "2024-02-29T19:00:00.000Z",
  );
  assert.equal(
    reportingRange(
      new URLSearchParams("period=YEARLY&value=2024"),
      now,
    ).end!.toISOString(),
    "2024-12-31T19:00:00.000Z",
  );
});
test("date changes preserve resource/status filters and remove obsolete values", () => {
  const selection = { period: "MONTHLY", value: "2024-02" } as const;
  const href = withPeriod(
    "/partner/packages?state=UNINVOICED&period=DAILY&value=2024-01-01",
    selection,
  );
  const parsed = new URL(href, "https://example.test");
  assert.equal(parsed.pathname, "/partner/packages");
  assert.equal(parsed.searchParams.get("state"), "UNINVOICED");
  assert.deepEqual(periodSelection(parsed.searchParams), selection);
  const all = new URL(
    withPeriod(href, { period: "ALL_TIME", value: "" }),
    "https://example.test",
  );
  assert(!all.searchParams.has("value"));
  assert.equal(all.searchParams.get("state"), "UNINVOICED");
  assert.equal(
    new URLSearchParams(periodQuery(selection)).get("value"),
    "2024-02",
  );
});
test("package date filters follow the selected operational milestone", () => {
  const params = new URLSearchParams("period=DAILY&value=2024-02-29");
  assert("registeredAt" in parcelPeriodWhere("PENDING", params));
  assert("pickedUpAt" in parcelPeriodWhere("PICKED_UP", params));
  assert("deliveredAt" in parcelPeriodWhere("DELIVERED", params));
  assert("deliveredAt" in parcelPeriodWhere("UNINVOICED", params));
});
test("all dated endpoints reject malformed, impossible and future periods", () => {
  const now = new Date("2026-10-19T05:00:00Z");
  for (const value of [
    "period=WEEKLY",
    "period=DAILY&value=2024-02-30",
    "period=MONTHLY&value=2024-13",
    "period=YEARLY&value=20",
    "period=YEARLY&value=2027",
    "period=DAILY&value=2026-10-20",
  ])
    assert.throws(() => dateFilter(new URLSearchParams(value), now));
});
