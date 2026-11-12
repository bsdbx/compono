import { expect, test } from "vitest";
import { accepts } from "./accepts";
import type { SocketType } from "./graph";

const NUMBER: SocketType = { kind: "number" };
const INTEGER: SocketType = { kind: "number", integer: true };
const TEXT: SocketType = { kind: "text" };
const LINK: SocketType = { kind: "text", link: true };
const TAG: SocketType = { kind: "choice", options: ["div", "span"] };

// The same table as the API's tests, so that the two rules can't drift apart
test.each<[SocketType, SocketType, boolean]>([
  [{ kind: "boolean" }, { kind: "boolean" }, true],
  [{ kind: "boolean" }, NUMBER, false],
  [NUMBER, NUMBER, true],
  [NUMBER, INTEGER, true],
  [INTEGER, NUMBER, false],
  [INTEGER, { kind: "number", integer: true, minimum: 0 }, true],
  [TEXT, TEXT, true],
  [TEXT, LINK, true],
  [LINK, TEXT, false],
  [TEXT, NUMBER, false],
  [TAG, { kind: "choice", options: ["div"] }, true],
  [{ kind: "choice", options: ["div"] }, TAG, false],
  [TAG, TEXT, false],
  [
    { kind: "object", fields: { title: TEXT } },
    { kind: "object", fields: { title: LINK, price: NUMBER } },
    true,
  ],
  [
    { kind: "object", fields: { title: LINK } },
    { kind: "object", fields: { title: TEXT } },
    false,
  ],
  [
    { kind: "object", fields: { title: TEXT } },
    { kind: "object", fields: {} },
    false,
  ],
  [{ kind: "date" }, { kind: "date" }, true],
  [{ kind: "date" }, TEXT, false],
  [{ kind: "element" }, { kind: "element" }, true],
  [{ kind: "slot" }, { kind: "element" }, true],
  [{ kind: "slot" }, TEXT, false],
  [{ kind: "element" }, { kind: "slot" }, false],
  [{ kind: "any" }, { kind: "date" }, true],
  [NUMBER, { kind: "nothing" }, true],
  [NUMBER, { kind: "any" }, true],
  [{ kind: "nothing" }, NUMBER, false],
])("%j takes %j: %s", (into, out, allowed) => {
  expect(accepts(into, out)).toBe(allowed);
});
