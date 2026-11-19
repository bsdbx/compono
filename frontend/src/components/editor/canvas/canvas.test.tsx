import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import type { Content, Draft } from "../draft";
import { Canvas } from "./canvas";
import { newNode, readGraph } from "./graph";

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

function selectionCanvas(hidden = false, count = 2) {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(500);
  const type = { kind: "text" };
  stubApi((request) =>
    Response.json(
      new URL(request.url).pathname === "/api/node-types"
        ? [
            {
              type: "pass",
              name: "Pass",
              category: "Test",
              single: false,
              properties: [],
              sockets: {
                inputs: [{ id: "value", label: "Value", type, default: "" }],
                outputs: [{ id: "value", label: "Value", type }],
                groups: [],
              },
            },
          ]
        : { nodes: {}, wires: {}, rendered: null, milliseconds: 0 },
    ),
  );
  let snapshot = {
    status: "saved",
    content: {
      graph: {
        format: 1,
        props: [],
        nodes: [
          newNode("pass", { x: 10, y: 20 }, "first"),
          newNode("pass", { x: 200, y: 50 }, "second"),
        ].slice(0, count),
        wires:
          count === 2
            ? [
                {
                  id: "wire",
                  from: { node: "first", socket: "value" },
                  to: { node: "second", socket: "value" },
                },
              ]
            : [],
      },
      screen_sizes: [],
    } as Content,
  };
  const listeners = new Set<() => void>();
  const change = vi.fn((content: Content) => {
    snapshot = { status: "saved", content };
    for (const listener of listeners) listener();
  });
  const draft = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change,
  } as unknown as Draft;
  renderWithClient(<Canvas draft={draft} hidden={hidden} />);
  return { change, graph: () => readGraph(snapshot.content.graph) };
}

test("F2 renames one selected node and the rename supports undo and redo", async () => {
  const canvas = selectionCanvas(false, 1);
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(1),
  );
  fireEvent.keyDown(window, { key: "a", ctrlKey: true });
  fireEvent.keyDown(window, { key: "F2" });
  const field = await screen.findByLabelText("Node name");
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: "  Price  " } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(canvas.change).toHaveBeenCalledOnce();
  expect(canvas.graph().nodes[0]?.name).toBe("Price");
  expect(document.querySelector("[data-node-header]")).toHaveTextContent(
    "Price",
  );
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(canvas.graph().nodes[0]?.name).toBeUndefined();
  fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
  expect(canvas.graph().nodes[0]?.name).toBe("Price");
});

test("double-clicking one node header starts renaming, and an unchanged name does not save", async () => {
  const canvas = selectionCanvas(false, 1);
  await waitFor(() =>
    expect(document.querySelector("[data-node-header]")).not.toBeNull(),
  );
  fireEvent.keyDown(window, { key: "a", ctrlKey: true });
  fireEvent.doubleClick(
    document.querySelector("[data-node-header]") as Element,
  );
  fireEvent.keyDown(await screen.findByLabelText("Node name"), {
    key: "Enter",
  });
  expect(screen.queryByLabelText("Node name")).toBeNull();
  expect(canvas.change).not.toHaveBeenCalled();
});

test("a multi-node selection cannot be renamed from F2, a double-click, or the menu", async () => {
  const canvas = selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  fireEvent.keyDown(window, { key: "a", ctrlKey: true });
  fireEvent.keyDown(window, { key: "F2" });
  fireEvent.doubleClick(
    document.querySelector("[data-node-header]") as Element,
  );
  expect(screen.queryByLabelText("Node name")).toBeNull();
  fireEvent.contextMenu(
    document.querySelector('.react-flow__node[data-id="first"]') as Element,
  );
  expect(
    await screen.findByRole("menuitem", { name: "Rename" }),
  ).toHaveAttribute("data-disabled");
  expect(canvas.change).not.toHaveBeenCalled();
});

test.each([false, true])(
  "duplicate shortcuts place the selection together and undo in one step (linked: %s)",
  async (linked) => {
    const canvas = selectionCanvas();
    await waitFor(() =>
      expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
    );
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.pointerMove(document, { clientX: 100, clientY: 100 });
    fireEvent.keyDown(window, { key: "D", shiftKey: true, altKey: linked });
    await waitFor(() =>
      expect(
        document.querySelectorAll(".react-flow__node.selected"),
      ).toHaveLength(2),
    );
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(4);
    expect(canvas.change).not.toHaveBeenCalled();
    fireEvent.pointerMove(document, { clientX: 160, clientY: 180 });
    fireEvent.pointerDown(
      document.querySelector(".react-flow__pane") as Element,
      { button: 0, clientX: 160, clientY: 180 },
    );
    await waitFor(() => expect(canvas.change).toHaveBeenCalledTimes(1));
    expect(
      canvas
        .graph()
        .nodes.slice(2)
        .map((node) => node.position),
    ).toEqual([
      { x: 70, y: 100 },
      { x: 260, y: 130 },
    ]);
    expect(canvas.graph().wires).toHaveLength(2);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(canvas.graph().nodes).toHaveLength(2);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(canvas.graph().nodes).toHaveLength(4);
  },
);

test("Escape cancels a duplicate and restores the original selection without saving", async () => {
  const canvas = selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  fireEvent.keyDown(window, { key: "a", ctrlKey: true });
  fireEvent.keyDown(window, { key: "D", shiftKey: true });
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(4),
  );
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    2,
  );
  expect(canvas.change).not.toHaveBeenCalled();
});

test.each(["Delete", "Backspace", "Control+x", "Alt+d"])(
  "%s acts on the whole selection and can be undone",
  async (shortcut) => {
    const canvas = selectionCanvas();
    await waitFor(() =>
      expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
    );
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.keyDown(window, {
      key: shortcut.split("+").at(-1),
      ctrlKey: shortcut.startsWith("Control"),
      altKey: shortcut.startsWith("Alt"),
    });
    expect(canvas.graph().nodes).toHaveLength(shortcut === "Alt+d" ? 2 : 0);
    expect(canvas.graph().wires).toEqual([]);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(canvas.graph().nodes).toHaveLength(2);
    expect(canvas.graph().wires).toHaveLength(1);
  },
);

test("the shortcuts leave focused text fields alone", async () => {
  const canvas = selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  const field = document.querySelector(
    ".react-flow__node input",
  ) as HTMLInputElement;
  fireEvent.keyDown(field, { key: "a", ctrlKey: true });
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    0,
  );
  fireEvent.keyDown(window, { key: "a", ctrlKey: true });
  for (const keys of [
    { key: "D", shiftKey: true },
    { key: "d", altKey: true },
    { key: "Delete" },
    { key: "Backspace" },
    { key: "x", ctrlKey: true },
  ])
    fireEvent.keyDown(field, keys);
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    2,
  );
  expect(canvas.change).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2);
});

test("a hidden canvas ignores selection shortcuts", async () => {
  const canvas = selectionCanvas(true);
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  for (const keys of [
    { key: "a", ctrlKey: true },
    { key: "Delete" },
    { key: "D", shiftKey: true },
    { key: "x", ctrlKey: true },
  ])
    fireEvent.keyDown(window, keys);
  expect(canvas.change).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    0,
  );
  expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2);
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
