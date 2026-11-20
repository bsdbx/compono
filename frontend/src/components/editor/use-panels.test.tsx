import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePanels } from "./use-panels";

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 1000);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("all panel dimensions and the collapsed library survive leaving the editor", () => {
  const first = renderHook(usePanels);
  act(() => {
    first.result.current.library.onChange(264);
    first.result.current.inspector.onChange(440);
    first.result.current.preview.onChange(360);
  });
  act(() => first.result.current.library.onCollapsedChange(true));
  first.unmount();
  const next = renderHook(usePanels);
  expect(next.result.current.library.width).toBe(44);
  expect(next.result.current.library.collapsed).toBe(true);
  expect(next.result.current.library.animate).toBe(false);
  expect(next.result.current.inspector.width).toBe(440);
  expect(next.result.current.preview.height).toBe(360);
  act(() => next.result.current.library.onCollapsedChange(false));
  expect(next.result.current.library.width).toBe(264);
});

test("a smaller window clamps the visible panels without overwriting the preferred layout", () => {
  const first = renderHook(usePanels);
  act(() => {
    first.result.current.library.onChange(320);
    first.result.current.inspector.onChange(600);
    first.result.current.preview.onChange(500);
  });
  first.unmount();
  vi.stubGlobal("innerWidth", 800);
  vi.stubGlobal("innerHeight", 400);
  const small = renderHook(usePanels);
  expect(small.result.current.library.width).toBe(180);
  expect(small.result.current.inspector.width).toBe(300);
  expect(small.result.current.preview.height).toBe(199);
  small.unmount();
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 1000);
  const restored = renderHook(usePanels);
  expect(restored.result.current.library.width).toBe(320);
  expect(restored.result.current.inspector.width).toBe(600);
  expect(restored.result.current.preview.height).toBe(500);
});

test("corrupt saved dimensions fall back to the defaults", () => {
  localStorage.setItem(
    "compono:editor-layout",
    '{"library":null,"inspector":-1,"preview":1e999}',
  );
  const { result } = renderHook(usePanels);
  expect(result.current.library.width).toBe(224);
  expect(result.current.inspector.width).toBe(314);
  expect(result.current.preview.height).toBe(226);
});

test("panel resizing works without access to browser storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  const { result } = renderHook(usePanels);
  act(() => result.current.inspector.onChange(440));
  expect(result.current.inspector.width).toBe(440);
});
