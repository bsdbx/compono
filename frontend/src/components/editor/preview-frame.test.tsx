import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PreviewFrame } from "./preview-frame";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function dimensions(width = 300, height = 200) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
    height,
  );
}
function message(
  frame: HTMLIFrameElement,
  type: string,
  data = {},
  source: MessageEventSource | null = frame.contentWindow,
) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source,
        data: { type: `compono:preview-${type}`, ...data },
      }),
    ),
  );
}
function content(frame: HTMLIFrameElement) {
  const post = vi.spyOn(frame.contentWindow as Window, "postMessage");
  fireEvent.load(frame);
  const payload = post.mock.calls.find(
    ([data]) => data.type === "compono:preview-html",
  )?.[0];
  message(frame, "bounds", {
    revision: payload.revision,
    width: 1280,
    height: 720,
    bounds: { x: 605, y: 348, width: 70, height: 24 },
  });
  return post;
}

test("resizing either panel dimension leaves the selected document dimensions fixed", () => {
  let width = 300,
    height = 180,
    resize = () => {};
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
  render(
    <PreviewFrame html="<button>Compono</button>" width={1280} height={720} />,
  );
  const frame = screen.getByTitle("Preview");
  expect(frame).toHaveStyle({ width: "1280px", height: "720px" });
  expect(frame.parentElement).toHaveStyle({
    left: "-490px",
    top: "-270px",
    transform: "scale(1)",
  });
  width = 600;
  height = 400;
  act(() => resize());
  expect(frame).toHaveStyle({ width: "1280px", height: "720px" });
  expect(frame.parentElement).toHaveStyle({
    left: "-340px",
    top: "-160px",
    transform: "scale(1)",
  });
});

test("Fit considers both fixed dimensions while percentage zoom changes only the camera", () => {
  dimensions(320, 200);
  const { rerender } = render(
    <PreviewFrame html="" width={1280} height={720} zoom="fit" />,
  );
  const frame = screen.getByTitle("Preview");
  expect(frame).toHaveStyle({ width: "1280px", height: "720px" });
  expect(frame.parentElement).toHaveStyle({ transform: "scale(0.225)" });
  rerender(<PreviewFrame html="" width={1280} height={720} zoom={2} />);
  expect(frame).toHaveStyle({ width: "1280px", height: "720px" });
  expect(frame.parentElement).toHaveStyle({ transform: "scale(2)" });
});

test("panning has a small bounded allowance, never scrolls, and ignores foreign messages", () => {
  dimensions();
  render(
    <PreviewFrame html="<button>Compono</button>" width={1280} height={720} />,
  );
  const frame = screen.getByTitle("Preview") as HTMLIFrameElement;
  content(frame);
  const view = screen.getByRole("region", { name: "Preview viewport" });
  expect(view).toHaveClass("overflow-clip");
  message(frame, "pan", { phase: "move", x: 10000, y: 10000 }, window);
  expect(view).toHaveAttribute("data-pan-x", "0");
  message(frame, "pan", { phase: "move", x: 10000, y: 10000 });
  expect(view).toHaveAttribute("data-pan-x", "40");
  expect(view).toHaveAttribute("data-pan-y", "40");
  expect(view.scrollLeft).toBe(0);
  expect(view.scrollTop).toBe(0);
  message(frame, "pan", { phase: "move", x: -10000, y: -10000 });
  expect(view).toHaveAttribute("data-pan-x", "-40");
  expect(view).toHaveAttribute("data-pan-y", "-40");
  message(frame, "pan", { phase: "move", x: Number.NaN, y: 100 });
  expect(view).toHaveAttribute("data-pan-y", "-40");
  message(frame, "center");
  expect(view).toHaveAttribute("data-pan-x", "0");
  expect(view).toHaveAttribute("data-pan-y", "0");
});

test("left clicks preserve interactions and changing components resets pan without remounting", () => {
  dimensions();
  const { rerender } = render(
    <PreviewFrame
      componentId="first"
      html="<button>First</button>"
      width={1280}
    />,
  );
  const frame = screen.getByTitle("Preview") as HTMLIFrameElement;
  const post = content(frame);
  const view = screen.getByRole("region", { name: "Preview viewport" });
  fireEvent.pointerDown(view, { button: 0 });
  expect(view).not.toHaveClass("cursor-grabbing");
  message(frame, "pan", { phase: "move", x: 20, y: 20 });
  expect(view).toHaveAttribute("data-pan-x", "20");
  rerender(
    <PreviewFrame
      componentId="second"
      html="<button>Second</button>"
      width={1280}
    />,
  );
  expect(screen.getByTitle("Preview")).toBe(frame);
  expect(view).toHaveAttribute("data-pan-x", "0");
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "compono:preview-html",
      html: "<button>Second</button>",
    }),
    "*",
  );
});

test("iframe zoom requests use the current camera scale", () => {
  dimensions();
  const zoom = vi.fn();
  render(<PreviewFrame html="" width={1280} zoom={2} onZoomChange={zoom} />);
  const frame = screen.getByTitle("Preview") as HTMLIFrameElement;
  message(frame, "zoom", { delta: -100 });
  expect(zoom).toHaveBeenCalledWith(2.443);
});
