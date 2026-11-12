import { expect, test } from "vitest";
import { avatarColor, initials } from "./avatar";

test("initials are the first letters of the first two words", () => {
  expect(initials("Mira Kovalenko")).toBe("MK");
  expect(initials("  ana   de la Cruz ")).toBe("AD");
  expect(initials("Mira")).toBe("M");
});

test("an account always gets the same color, and accounts get different ones", () => {
  const ids = Array.from({ length: 12 }, (_, index) => `account-${index}`);

  expect(ids.map(avatarColor)).toEqual(ids.map(avatarColor));
  expect(new Set(ids.map(avatarColor)).size).toBeGreaterThan(3);
});
