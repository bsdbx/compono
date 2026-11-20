import { expect, test } from "vitest";
import { previewScale, previewView, previewZoom } from "./preview-view";

const box = { width: 300, height: 180 },
  size = { width: 1280, height: 720 };

test("small components have only 40px of pan in either direction", () => {
  const result = previewView(
    box,
    size,
    { x: 605, y: 348, width: 70, height: 24 },
    { x: 10000, y: -10000 },
    1,
  );
  expect(result.pan).toEqual({ x: 40, y: -40 });
  expect(result.frame.x + (605 + result.content.x + 35)).toBe(
    box.width / 2 + 40,
  );
  expect(result.frame.y + (348 + result.content.y + 12)).toBe(
    box.height / 2 - 40,
  );
});

test("oversized content remains reachable beyond the fixed document edges without scrolling", () => {
  const content = { x: -360, y: -240, width: 2000, height: 1200 };
  const result = previewView(box, size, content, { x: 10000, y: 10000 }, 1);
  expect(result.pan).toEqual({ x: 890, y: 550 });
  expect(result.frame.x + content.x + result.content.x).toBe(40);
  expect(result.frame.y + content.y + result.content.y).toBe(40);
  const other = previewView(box, size, content, { x: -10000, y: -10000 }, 1);
  expect(other.frame.x + content.x + other.content.x + content.width).toBe(
    box.width - 40,
  );
  expect(other.frame.y + content.y + other.content.y + content.height).toBe(
    box.height - 40,
  );
});

test("resizing and zoom preserve the content center while Fit respects both bounds", () => {
  const content = { x: 10, y: 20, width: 100, height: 40 };
  for (const scale of [0.25, 1, 2]) {
    const result = previewView(box, size, content, { x: 0, y: 0 }, scale);
    expect(
      result.frame.x +
        (content.x + content.width / 2 + result.content.x) * scale,
    ).toBeCloseTo(box.width / 2);
    expect(
      result.frame.y +
        (content.y + content.height / 2 + result.content.y) * scale,
    ).toBeCloseTo(box.height / 2);
  }
  expect(previewScale("fit", { width: 320, height: 200 }, size)).toBe(0.225);
  expect(previewZoom(1, -100)).toBe(1.221);
  expect(previewZoom(4, -10000)).toBe(4);
  expect(previewZoom(0.01, 10000)).toBe(0.01);
});
