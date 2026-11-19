import { expect, test } from "vitest";
import {
  collapsedHeight,
  collapsedSocket,
  collapsedWidth,
  labelWidth,
  NODE_DEFAULT_WIDTH,
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  nodeName,
  nodeWidth,
  resizedNode,
} from "./node-size";

test("compact pills fit their labels and keep sockets apart along the rounded ends", () => {
  expect(collapsedHeight(0, 1)).toBe(32);
  expect(collapsedHeight(5, 2)).toBe(80);
  expect(collapsedWidth(20, 32)).toBe(80);
  expect(collapsedWidth(100, 80)).toBe(204);
  expect(collapsedWidth(2000, 32)).toBe(NODE_MAX_WIDTH);
  const sockets = Array.from({ length: 5 }, (_, index) =>
    collapsedSocket(index, 5, 80),
  );
  expect(sockets.map((socket) => socket.top)).toEqual([8, 24, 40, 56, 72]);
  expect(sockets[0]?.inset).toBe(sockets[4]?.inset);
  expect(sockets[2]?.inset).toBe(0);
  for (const { top, inset } of sockets)
    expect((40 - inset) ** 2 + (top - 40) ** 2).toBeCloseTo(40 ** 2);
  expect(collapsedSocket(0, 1, 80)).toEqual({ top: 40, inset: 0 });
});

test("nodes share a default width, grow with their label, and respect resize bounds", () => {
  expect(labelWidth(50)).toBe(NODE_DEFAULT_WIDTH);
  expect(labelWidth(300)).toBe(330);
  expect(labelWidth(50, NODE_MIN_WIDTH)).toBe(NODE_MIN_WIDTH);
  expect(labelWidth(2000)).toBe(NODE_MAX_WIDTH);
  expect(nodeWidth(0)).toBe(NODE_MIN_WIDTH);
  expect(nodeWidth(5000)).toBe(NODE_MAX_WIDTH);
  expect(nodeWidth(220.4)).toBe(220);
  expect(nodeWidth(Number.NaN)).toBe(NODE_DEFAULT_WIDTH);
});

test("resizing either border preserves the opposite side and never changes y", () => {
  const start = { width: 200, position: { x: 100, y: 40 } };
  expect(resizedNode(start, "right", 80)).toEqual({
    width: 280,
    position: { x: 100, y: 40 },
  });
  expect(resizedNode(start, "left", -80)).toEqual({
    width: 280,
    position: { x: 20, y: 40 },
  });
  expect(resizedNode(start, "left", 500)).toEqual({
    width: NODE_MIN_WIDTH,
    position: { x: 132, y: 40 },
  });
  const large = resizedNode(start, "left", -5000);
  expect(large.width).toBe(NODE_MAX_WIDTH);
  expect(large.position.x + large.width).toBe(300);
});

test("labels are trimmed and capped at 128 complete Unicode characters", () => {
  expect(nodeName("  Title  ")).toBe("Title");
  expect(nodeName("  Card\t   title \n  text  ")).toBe("Card title text");
  expect(nodeName("a".repeat(200))).toHaveLength(128);
  expect(Array.from(nodeName("🎨".repeat(200)))).toHaveLength(128);
});
