import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PreviewFrame } from "./preview-frame";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("resizing the panel changes the visible area while the selected iframe width stays fixed at 100%", () => {
  let width = 300,
    height = 180;
  let resize = () => {};
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => height,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(<PreviewFrame html="<button>Compono</button>" width={1280} />);
  const frame = screen.getByTitle("Preview");
  expect(frame).toHaveStyle({
    width: "1280px",
    height: "180px",
    transform: "scale(1)",
  });
  width = 600;
  height = 400;
  act(() => resize());
  expect(frame).toHaveStyle({
    width: "1280px",
    height: "400px",
    transform: "scale(1)",
  });
});

test("zoom changes the view scale without changing the iframe's CSS viewport", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  const { rerender } = render(<PreviewFrame html="" width={1280} zoom="fit" />);
  const frame = screen.getByTitle("Preview");
  expect(frame).toHaveStyle({
    width: "1280px",
    height: "200px",
    transform: "scale(0.25)",
  });
  rerender(<PreviewFrame html="" width={1280} zoom={2} />);
  expect(frame).toHaveStyle({
    width: "1280px",
    height: "200px",
    transform: "scale(2)",
  });
});

test("iframe panning is bounded and ignores messages from other windows", () => {
  render(<PreviewFrame html="" width={1280} />);
  const viewport = screen.getByRole("region", { name: "Preview viewport" });
  Object.defineProperties(viewport, {
    clientWidth: { value: 200 },
    clientHeight: { value: 100 },
    scrollWidth: { value: 1000 },
    scrollHeight: { value: 500 },
  });
  viewport.scrollLeft = 100;
  viewport.scrollTop = 50;
  const frame = screen.getByTitle("Preview") as HTMLIFrameElement;
  function move(source: MessageEventSource | null, x: number, y: number) {
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          data: { type: "compono:preview-pan", phase: "move", x, y },
        }),
      ),
    );
  }
  move(window, 10000, 10000);
  expect(viewport.scrollLeft).toBe(100);
  expect(viewport.scrollTop).toBe(50);
  move(frame.contentWindow, 10000, 10000);
  expect(viewport.scrollLeft).toBe(800);
  expect(viewport.scrollTop).toBe(400);
  move(frame.contentWindow, -10000, -10000);
  expect(viewport.scrollLeft).toBe(0);
  expect(viewport.scrollTop).toBe(0);
  move(frame.contentWindow, Number.NaN, 100);
  expect(viewport.scrollTop).toBe(0);
});

test("left clicks keep interacting with the component instead of starting panning", () => {
  render(<PreviewFrame html="<button>Compono</button>" width={1280} />);
  const viewport = screen.getByRole("region", { name: "Preview viewport" });
  fireEvent.pointerDown(viewport, { button: 0 });
  expect(viewport).not.toHaveClass("cursor-grabbing");
});
