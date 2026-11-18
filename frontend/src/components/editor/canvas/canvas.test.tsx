import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import type { Draft } from "../draft";
import { Canvas } from "./canvas";

const captureMethods = ["setPointerCapture", "releasePointerCapture"] as const;
const beforeCapture = captureMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  captureMethods.forEach((name, index) => {
    const descriptor = beforeCapture[index];
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  });
});

test.each([
  { modifier: "Shift", reverse: false },
  { modifier: "Control", reverse: false },
  { modifier: "Shift", reverse: true },
  { modifier: "Control", reverse: true },
])(
  "$modifier selection uses the drag coordinates (reverse: $reverse)",
  async ({ modifier, reverse }) => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(500);
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    stubApi((request) =>
      Response.json(
        new URL(request.url).pathname === "/api/node-types"
          ? []
          : { nodes: {}, wires: {}, rendered: null, milliseconds: 0 },
      ),
    );
    const snapshot = {
      status: "saved",
      content: { graph: { nodes: [], wires: [], props: [] }, screen_sizes: [] },
    };
    const draft = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    } as unknown as Draft;
    renderWithClient(<Canvas draft={draft} />);
    await waitFor(() => {
      expect(document.querySelector(".react-flow__pane")).not.toBeNull();
    });
    const pane = document.querySelector(".react-flow__pane") as Element;
    const flow = pane.closest(".react-flow");
    const wrapper = flow?.parentElement as HTMLElement;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
      left: 150,
      top: 80,
      width: 600,
      height: 500,
      right: 750,
      bottom: 580,
      x: 150,
      y: 80,
      toJSON: () => ({}),
    });
    const keys = {
      shiftKey: modifier === "Shift",
      ctrlKey: modifier === "Control",
    };
    fireEvent.pointerDown(pane, {
      button: 0,
      ...keys,
      clientX: reverse ? 410 : 260,
      clientY: reverse ? 300 : 200,
    });
    fireEvent.pointerMove(wrapper, {
      ...keys,
      clientX: reverse ? 260 : 410,
      clientY: reverse ? 200 : 300,
    });
    expect(document.querySelector(".react-flow__selection")).toHaveStyle({
      left: "110px",
      top: "120px",
      width: "150px",
      height: "100px",
    });
  },
);
