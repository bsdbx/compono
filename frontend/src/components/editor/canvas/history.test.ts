import { expect, test } from "vitest";
import { History } from "./history";

test("undo goes back a change at a time, and redo forward again", () => {
  const history = new History<string>();
  history.record("a");
  history.record("b");

  expect(history.undo("c")).toBe("b");
  expect(history.undo("b")).toBe("a");
  expect(history.undo("a")).toBeUndefined();
  expect(history.redo("a")).toBe("b");
  expect(history.redo("b")).toBe("c");
  expect(history.redo("c")).toBeUndefined();
});

test("changes with the same key in a row undo together, and a new change forgets what was undone", () => {
  const history = new History<string>();
  history.record("", "title");
  history.record("P", "title");
  history.record("Pr", "title");
  history.record("Pro", "class");

  expect(history.undo("Pro c")).toBe("Pro");
  expect(history.undo("Pro")).toBe("");
  history.record("x");
  expect(history.redo("y")).toBeUndefined();
});

test("after undo, the same key starts a new step", () => {
  const history = new History<string>();
  history.record("a", "field");
  expect(history.undo("ab")).toBe("a");
  history.record("a", "field");
  history.record("ax", "field");
  expect(history.undo("axy")).toBe("a");
});
