import test from "node:test";
import assert from "node:assert/strict";
import { earningsRange } from "./delivery/earnings-period";
const now = new Date("2026-10-17T19:15:00Z"); // 18 October in Maldives
function range(period: string, value?: string) {
  return earningsRange(
    new URLSearchParams({ period, ...(value ? { value } : {}) }),
    now,
  );
}
test("daily earnings use Maldives midnight with an exclusive next-day boundary", () => {
  const day = range("DAILY", "2024-02-29");
  assert.equal(day.start!.toISOString(), "2024-02-28T19:00:00.000Z");
  assert.equal(day.end!.toISOString(), "2024-02-29T19:00:00.000Z");
  assert.equal(range("DAILY").value, "2026-10-18");
});
test("each calendar month handles leap years and December rollover", () => {
  const feb = range("MONTHLY", "2024-02"),
    dec = range("MONTHLY", "2023-12");
  assert.equal(feb.start!.toISOString(), "2024-01-31T19:00:00.000Z");
  assert.equal(feb.end!.toISOString(), "2024-02-29T19:00:00.000Z");
  assert.equal(dec.end!.toISOString(), "2023-12-31T19:00:00.000Z");
  assert.equal(range("MONTHLY").value, "2026-10");
});
test("yearly earnings include the entire selected Maldives calendar year", () => {
  const year = range("YEARLY", "2024");
  assert.equal(year.start!.toISOString(), "2023-12-31T19:00:00.000Z");
  assert.equal(year.end!.toISOString(), "2024-12-31T19:00:00.000Z");
  assert.equal(range("YEARLY").value, "2026");
});
test("all-time earnings have no artificial start date", () => {
  const all = earningsRange(new URLSearchParams(), now);
  assert.equal(all.period, "ALL_TIME");
  assert.equal(all.start, undefined);
  assert.equal(all.end, undefined);
});
test("earnings reject invalid dates, malformed periods and future choices", () => {
  for (const [period, value] of [
    ["DAILY", "2023-02-29"],
    ["DAILY", "2024-02-30"],
    ["DAILY", "2026-10-19"],
    ["MONTHLY", "2026-11"],
    ["MONTHLY", "2026-1"],
    ["YEARLY", "2027"],
    ["YEARLY", "26"],
    ["ALL", "2026"],
  ])
    assert.throws(() => range(period, value));
});
