import { expect, test } from "vitest";
import {
  inviteToken,
  safeNext,
  suggestUrl,
  TEAM_URL_PATTERN,
} from "./team-url";

test("a team URL is made from its name", () => {
  expect(suggestUrl("Acme")).toBe("acme");
  expect(suggestUrl("  Acme   Design!  ")).toBe("acme-design");
  expect(suggestUrl("Café Ünïcode")).toBe("cafe-unicode");
  expect(suggestUrl("---")).toBe("");
  const long = suggestUrl(`${"a".repeat(38)} b`);
  expect(long).toBe("a".repeat(38));
  expect(long).toMatch(TEAM_URL_PATTERN);
});

test("an invite link gives its token, pasted whole or alone", () => {
  expect(inviteToken("https://compono.app/join/abc123")).toBe("abc123");
  expect(inviteToken(" compono-app.vercel.app/join/abc123?x=1 ")).toBe(
    "abc123",
  );
  expect(inviteToken("abc123")).toBe("abc123");
  expect(inviteToken("   ")).toBe("");
});

test("after signing in, only this app's pages are opened", () => {
  expect(safeNext("/join/abc")).toBe("/join/abc");
  expect(safeNext(null)).toBe("/");
  expect(safeNext("https://evil.example")).toBe("/");
  expect(safeNext("//evil.example")).toBe("/");
  expect(safeNext("/\\evil.example")).toBe("/");
});
