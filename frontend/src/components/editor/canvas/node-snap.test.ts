import { expect, test } from "vitest";
import { snapBounds, snapResize } from "./node-snap";

const stationary = { x: 0, y: 100, width: 80, height: 120 };

test.each([
  { pairing: "left", x: 3, at: 0 },
  { pairing: "center", x: 13, at: 40 },
  { pairing: "right", x: 23, at: 80 },
])("aligns stacked nodes of different widths by $pairing", ({ x, at }) => {
  const moving = { x, y: 24, width: 60, height: 50 };
  expect(snapBounds(moving, [stationary], 1)).toEqual({
    offset: { x: -3, y: -6 },
    guides: [{ axis: "x", at, from: 68, to: 100 }],
  });
});

test("stacked nodes of equal width show all three vertical guides", () => {
  const moving = { x: 3, y: 24, width: 80, height: 50 };
  expect(snapBounds(moving, [stationary], 1)).toEqual({
    offset: { x: -3, y: -6 },
    guides: [
      { axis: "x", at: 0, from: 68, to: 100 },
      { axis: "x", at: 40, from: 68, to: 100 },
      { axis: "x", at: 80, from: 68, to: 100 },
    ],
  });
});

test("touching stacked nodes retain all three alignment points", () => {
  const moving = { x: 3, y: 53, width: 80, height: 50 };
  expect(snapBounds(moving, [stationary], 1)).toEqual({
    offset: { x: -3, y: -3 },
    guides: [
      { axis: "x", at: 0, from: 100, to: 100 },
      { axis: "x", at: 40, from: 100, to: 100 },
      { axis: "x", at: 80, from: 100, to: 100 },
      { axis: "y", at: 100, from: 0, to: 80 },
    ],
  });
});

test.each([
  { pairing: "top to top", y: 102, line: 100, delta: -2 },
  { pairing: "top to bottom", y: 223, line: 220, delta: -3 },
  { pairing: "bottom to top", y: 53, line: 100, delta: -3 },
  { pairing: "bottom to bottom", y: 173, line: 220, delta: -3 },
  { pairing: "middle to middle", y: 137, line: 160, delta: -2 },
])("aligns $pairing for unequal node heights", ({ y, line, delta }) => {
  const moving = { x: 227, y, width: 80, height: 50 };
  const { offset, guides } = snapBounds(moving, [stationary], 1);
  expect(moving.x + offset.x).toBe(234);
  expect(offset.y).toBe(delta);
  expect(guides).toEqual([{ axis: "y", at: line, from: 80, to: 234 }]);
});

test("stacking nodes draws the guide along only the shared edge", () => {
  const moving = { x: 24, y: 223, width: 80, height: 50 };
  expect(snapBounds(moving, [stationary], 1)).toEqual({
    offset: { x: -6, y: -3 },
    guides: [{ axis: "y", at: 220, from: 18, to: 80 }],
  });
});

test("the closest connected socket overrides a nearby node edge", () => {
  const moving = { x: 227, y: 102, width: 80, height: 50 };
  const { offset, guides } = snapBounds(moving, [stationary], 1, [
    { moving: { x: 227, y: 131 }, target: { x: 80, y: 124 } },
    { moving: { x: 307, y: 128 }, target: { x: 700, y: 134 } },
  ]);
  expect(offset).toEqual({ x: 7, y: 6 });
  expect(guides).toEqual([{ axis: "y", at: 134, from: 314, to: 700 }]);
});

test("snaps across zoom levels based on screen distance", () => {
  const moving = { x: 227, y: 107, width: 80, height: 50 };
  expect(snapBounds(moving, [stationary], 1).offset.y).toBe(-7);
  expect(snapBounds(moving, [stationary], 2)).toEqual({
    offset: { x: 7, y: 1 },
    guides: [],
  });
});

test("distant alignments do not override the grid", () => {
  const moving = { x: 828, y: 102, width: 80, height: 50 };
  expect(snapBounds(moving, [stationary], 1)).toEqual({
    offset: { x: 0, y: 6 },
    guides: [],
  });
});

test("grid snapping moves either resize border while its opposite stays fixed", () => {
  const start = { position: { x: 100, y: 40 }, width: 200 };
  expect(snapResize(start, "right", 37, 80, [], 1)).toEqual({
    size: { position: { x: 100, y: 40 }, width: 242 },
    guides: [],
  });
  expect(snapResize(start, "left", -37, 80, [], 1)).toEqual({
    size: { position: { x: 72, y: 40 }, width: 228 },
    guides: [],
  });
  expect(snapResize(start, "right", -500, 80, [], 1).size.width).toBe(168);
  expect(snapResize(start, "right", 5000, 80, [], 1).size.width).toBe(1024);
});

test("resizing to a stacked node's width shows all three guides", () => {
  const start = { position: { x: 0, y: 0 }, width: 188 };
  const target = { x: 0, y: 104, width: 220, height: 80 };
  expect(snapResize(start, "right", 29, 80, [target], 1)).toEqual({
    size: { position: { x: 0, y: 0 }, width: 220 },
    guides: [
      { axis: "x", at: 0, from: 80, to: 104 },
      { axis: "x", at: 110, from: 80, to: 104 },
      { axis: "x", at: 220, from: 80, to: 104 },
    ],
  });
});

test("left resize can snap to a facing border without moving the right edge", () => {
  const start = { position: { x: 400, y: 0 }, width: 188 };
  const target = { x: 100, y: 20, width: 190, height: 100 };
  expect(snapResize(start, "left", -107, 80, [target], 1)).toEqual({
    size: { position: { x: 290, y: 0 }, width: 298 },
    guides: [{ axis: "x", at: 290, from: 20, to: 80 }],
  });
});

test("a resize can align centers at different widths", () => {
  const start = { position: { x: 20, y: 0 }, width: 200 };
  const target = { x: 0, y: 104, width: 260, height: 80 };
  expect(snapResize(start, "right", 17, 80, [target], 1)).toEqual({
    size: { position: { x: 20, y: 0 }, width: 220 },
    guides: [{ axis: "x", at: 130, from: 80, to: 104 }],
  });
});
