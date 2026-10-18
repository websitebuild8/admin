import assert from "node:assert/strict";
import test from "node:test";
import { maldivesToday } from "./delivery/dashboard-filters";

test("today's delivery window changes at Maldives midnight, with an exclusive end", () => {
  const beforeMidnight = maldivesToday(new Date("2026-10-18T18:59:59.999Z"));
  assert.equal(beforeMidnight.gte.toISOString(), "2026-10-17T19:00:00.000Z");
  assert.equal(beforeMidnight.lt.toISOString(), "2026-10-18T19:00:00.000Z");
  const midnight = maldivesToday(new Date("2026-10-18T19:00:00Z"));
  assert.equal(midnight.gte.toISOString(), "2026-10-18T19:00:00.000Z");
  assert.equal(midnight.lt.toISOString(), "2026-10-19T19:00:00.000Z");
});

test("delivery windows cross month and leap-year boundaries in Maldives Time", () => {
  const leapDay = maldivesToday(new Date("2024-02-29T12:00:00Z"));
  assert.equal(leapDay.gte.toISOString(), "2024-02-28T19:00:00.000Z");
  assert.equal(leapDay.lt.toISOString(), "2024-02-29T19:00:00.000Z");
  const newYear = maldivesToday(new Date("2025-12-31T20:00:00Z"));
  assert.equal(newYear.gte.toISOString(), "2025-12-31T19:00:00.000Z");
  assert.equal(newYear.lt.toISOString(), "2026-01-01T19:00:00.000Z");
});
