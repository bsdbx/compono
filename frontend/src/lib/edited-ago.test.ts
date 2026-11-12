import { expect, test } from "vitest";
import { editedAgo } from "./edited-ago";

const NOW = new Date("2026-11-12T12:00:00Z");
const before = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test.each([
  [30_000, "just now"],
  [2 * MINUTE, "2m ago"],
  [59 * MINUTE, "59m ago"],
  [HOUR, "1h ago"],
  [23 * HOUR, "23h ago"],
  [DAY, "yesterday"],
  [2 * DAY, "2d ago"],
  [6 * DAY, "6d ago"],
  [7 * DAY, "last week"],
  [13 * DAY, "last week"],
])("%i ms ago is %s", (ms, text) => {
  expect(editedAgo(before(ms), NOW)).toBe(text);
});

test("older edits say the date", () => {
  expect(editedAgo(before(20 * DAY), NOW)).toMatch(/^on /);
});
