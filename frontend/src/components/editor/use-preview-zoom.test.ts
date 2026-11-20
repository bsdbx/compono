import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePreviewZoom } from "./use-preview-zoom";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("zoom follows each component across switches, remounts and successive wheel updates", () => {
  const first = renderHook(({ id }) => usePreviewZoom(id), {
    initialProps: { id: "card-a" },
  });
  act(() => first.result.current[1](2));
  first.rerender({ id: "card-b" });
  expect(first.result.current[0]).toBe(1);
  act(() => first.result.current[1]("fit"));
  first.rerender({ id: "card-a" });
  expect(first.result.current[0]).toBe(2);
  act(() => {
    first.result.current[1]((value) => Number(value) + 0.1);
    first.result.current[1]((value) => Number(value) + 0.1);
  });
  expect(first.result.current[0]).toBeCloseTo(2.2);
  first.unmount();
  const reopened = renderHook(({ id }) => usePreviewZoom(id), {
    initialProps: { id: "card-a" },
  });
  expect(reopened.result.current[0]).toBeCloseTo(2.2);
  reopened.rerender({ id: "card-b" });
  expect(reopened.result.current[0]).toBe("fit");
});

test.each(["broken", "Infinity", "0", "5"])(
  "invalid saved zoom %s falls back to 100%%",
  (value) => {
    localStorage.setItem("compono:preview-zoom:card", value);
    expect(renderHook(() => usePreviewZoom("card")).result.current[0]).toBe(1);
  },
);

test("zoom works when browser storage cannot be read or written", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  const { result } = renderHook(() => usePreviewZoom("card"));
  expect(result.current[0]).toBe(1);
  act(() => result.current[1](1.5));
  expect(result.current[0]).toBe(1.5);
});
