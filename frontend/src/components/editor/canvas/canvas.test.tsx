import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import type { Content, Draft } from "../draft";
import { Canvas } from "./canvas";
import { type Graph, newNode, readGraph, type SocketType } from "./graph";

const refreshHandles = vi.hoisted(() => vi.fn());
// JSDOM has no layout; actual handle alignment is checked in the browser.
vi.mock("@xyflow/react", async (original) => ({
  ...(await original<typeof import("@xyflow/react")>()),
  useUpdateNodeInternals: () => refreshHandles,
}));

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

function selectionCanvas(
  hidden = false,
  count = 2,
  initialGraph?: Graph,
  groupType?: SocketType,
) {
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
                groups: initialGraph
                  ? [
                      {
                        id: "children",
                        label: "Children",
                        type: groupType ?? type,
                        before: null,
                      },
                    ]
                  : [],
              },
            },
          ]
        : { nodes: {}, wires: {}, rendered: null, milliseconds: 0 },
    ),
  );
  let snapshot = {
    status: "saved",
    content: {
      graph: initialGraph ?? {
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

function orderedInputs(groupType?: SocketType) {
  const first = {
    ...newNode("pass", { x: 0, y: 0 }, "first"),
    name: "Heading",
  };
  const second = {
    ...newNode("pass", { x: 300, y: 0 }, "second"),
    groups: { children: ["r1", "r2", "manual"] },
  };
  return selectionCanvas(
    false,
    2,
    {
      format: 1,
      props: [],
      nodes: [first, second],
      wires: ["r1", "r2"].map((row) => ({
        id: `wire-${row}`,
        from: { node: "first", socket: "value" },
        to: { node: "second", socket: `children/${row}` },
      })),
    },
    groupType,
  );
}

test.each<[SocketType, string]>([
  [{ kind: "element" }, "Element"],
  [{ kind: "number", integer: true }, "Number"],
])(
  "group labels describe the accepted type rather than the connected source",
  async (type, name) => {
    orderedInputs(type);
    const list = await screen.findByLabelText("Children inputs");
    expect(
      [...list.querySelectorAll("[data-group-row-label]")].map(
        (element) => element.textContent,
      ),
    ).toEqual([name, name, name]);
    expect(list).not.toHaveTextContent("Heading");
  },
);

test("only the drag handle reorders children, showing the row and release slot without saving until drop", async () => {
  const canvas = orderedInputs();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  const list = await screen.findByLabelText("Children inputs");
  const group = list.closest<HTMLElement>("[data-socket-group]") as HTMLElement;
  const order = () =>
    [...list.querySelectorAll<HTMLElement>("[data-row]")].map(
      (element) => element.dataset.row,
    );
  const first = list.querySelector<HTMLElement>(
    '[data-row="r1"]',
  ) as HTMLElement;
  vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    bottom: 26,
    left: 0,
    right: 188,
    width: 188,
    height: 26,
    toJSON: () => ({}),
  });
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    bottom: 78,
    left: 0,
    right: 188,
    width: 188,
    height: 78,
    toJSON: () => ({}),
  });
  const label = first.querySelector("[data-group-row-label]") as HTMLElement;
  fireEvent.pointerDown(label, {
    button: 0,
    pointerId: 1,
    clientX: 50,
    clientY: 13,
  });
  fireEvent.pointerMove(group, { pointerId: 1, clientX: 50, clientY: 48 });
  fireEvent.pointerUp(group, { pointerId: 1, clientX: 50, clientY: 48 });
  expect(order()).toEqual(["r1", "r2", "manual"]);
  expect(
    document.querySelector("[data-row-drag-preview]"),
  ).not.toBeInTheDocument();
  expect(canvas.change).not.toHaveBeenCalled();
  const start = () => {
    fireEvent.pointerDown(screen.getByLabelText("Reorder Children 1"), {
      button: 0,
      pointerId: 1,
      clientX: 50,
      clientY: 13,
    });
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 50, clientY: 48 });
  };
  start();
  expect(order()).toEqual(["r2", "r1", "manual"]);
  expect(document.querySelector("[data-row-drag-preview]")).toHaveTextContent(
    "Text",
  );
  expect(list.querySelector('[data-row="r1"]')).toHaveAttribute(
    "data-row-placeholder",
    "true",
  );
  expect(canvas.change).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(order()).toEqual(["r1", "r2", "manual"]);
  expect(
    document.querySelector("[data-row-drag-preview]"),
  ).not.toBeInTheDocument();
  expect(canvas.change).not.toHaveBeenCalled();

  start();
  fireEvent.pointerUp(group, { pointerId: 1, clientX: 50, clientY: 48 });
  expect(order()).toEqual(["r2", "r1", "manual"]);
  expect(canvas.graph().nodes[1]?.groups.children).toEqual([
    "r2",
    "r1",
    "manual",
  ]);
  expect(canvas.change).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(order()).toEqual(["r1", "r2", "manual"]);
});

test("double-clicking child names edits inline; Enter saves, Escape cancels and clearing restores the type", async () => {
  const canvas = orderedInputs();
  const list = await screen.findByLabelText("Children inputs");
  const label = () =>
    list.querySelector('[data-row="r1"] [data-group-row-label]') as HTMLElement;
  fireEvent.doubleClick(label());
  const field = screen.getByLabelText("Child name");
  expect(field).toHaveFocus();
  expect(field).toHaveValue("Text");
  fireEvent.change(field, { target: { value: "  Header   content  " } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(label()).toHaveTextContent("Header content");
  expect(canvas.graph().nodes[1]?.socketNames).toEqual({
    "children/r1": "Header content",
  });
  expect(canvas.graph().wires[0]?.to.socket).toBe("children/r1");
  fireEvent.doubleClick(label());
  fireEvent.change(screen.getByLabelText("Child name"), {
    target: { value: "Discard" },
  });
  fireEvent.keyDown(screen.getByLabelText("Child name"), { key: "Escape" });
  expect(label()).toHaveTextContent("Header content");
  fireEvent.keyDown(screen.getByLabelText("Reorder Children 1"), {
    key: "ArrowDown",
    altKey: true,
  });
  expect(
    list.querySelector('[data-row="r1"] [data-group-row-label]'),
  ).toHaveTextContent("Header content");
  fireEvent.doubleClick(label());
  fireEvent.change(screen.getByLabelText("Child name"), {
    target: { value: "" },
  });
  fireEvent.keyDown(screen.getByLabelText("Child name"), { key: "Enter" });
  expect(label()).toHaveTextContent("Text");
  expect(canvas.graph().nodes[1]?.socketNames).toBeUndefined();
});

test("ordered inputs have direct add/remove and keyboard reordering controls instead of a row menu", async () => {
  const canvas = orderedInputs();
  const list = await screen.findByLabelText("Children inputs");
  expect(within(list).getAllByRole("listitem", { hidden: true })).toHaveLength(
    3,
  );
  fireEvent.keyDown(screen.getByLabelText("Reorder Children 1"), {
    key: "ArrowDown",
    altKey: true,
  });
  expect(canvas.graph().nodes[1]?.groups.children).toEqual([
    "r2",
    "r1",
    "manual",
  ]);
  fireEvent.click(screen.getByLabelText("Remove Children 3"));
  expect(canvas.graph().nodes[1]?.groups.children).toEqual(["r2", "r1"]);
  const group = document.querySelector(
    '.react-flow__node[data-id="second"]',
  ) as HTMLElement;
  fireEvent.click(within(group).getByLabelText("Add Children input"));
  expect(canvas.graph().nodes[1]?.groups.children).toHaveLength(3);
  fireEvent.contextMenu(
    within(list).getAllByRole("listitem", { hidden: true })[0] as HTMLElement,
    { clientX: 100, clientY: 100 },
  );
  expect(
    await screen.findByRole("menuitem", { name: /^Rename/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("menuitem", { name: "Move up" }),
  ).not.toBeInTheDocument();
});

test("disconnecting a selection prunes connected rows, preserves manual empty slots, and undoes atomically", async () => {
  const canvas = orderedInputs();
  await screen.findByLabelText("Children inputs");
  fireEvent.keyDown(window, { key: "a" });
  fireEvent.keyDown(window, { key: "d", altKey: true });
  expect(canvas.graph().wires).toHaveLength(0);
  expect(canvas.graph().nodes[1]?.groups.children).toEqual(["manual"]);
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(canvas.graph().wires).toHaveLength(2);
  expect(canvas.graph().nodes[1]?.groups.children).toEqual([
    "r1",
    "r2",
    "manual",
  ]);
});

test("A selects every node and Alt+A clears selection without changing the graph", async () => {
  const canvas = selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  expect(fireEvent.keyDown(window, { key: "a" })).toBe(false);
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    2,
  );
  expect(fireEvent.keyDown(window, { key: "a", altKey: true })).toBe(false);
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    0,
  );
  fireEvent.keyDown(window, { key: "Delete" });
  expect(canvas.change).not.toHaveBeenCalled();
  expect(canvas.graph().nodes).toHaveLength(2);
});

test("H collapses and expands a whole selection with one-step undo and retained sockets", async () => {
  const canvas = selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  const handles = document.querySelectorAll(".react-flow__handle").length;
  const fields = document.querySelectorAll(".react-flow__node input").length;
  fireEvent.keyDown(window, { key: "h" });
  expect(canvas.change).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "a" });
  fireEvent.keyDown(window, { key: "h" });
  expect(canvas.change).toHaveBeenCalledOnce();
  expect(canvas.graph().nodes.every((node) => node.collapsed)).toBe(true);
  for (const modifier of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { repeat: true },
  ])
    fireEvent.keyDown(window, { key: "h", ...modifier });
  expect(canvas.change).toHaveBeenCalledOnce();
  expect(
    document.querySelectorAll('[data-node-collapsed="true"]'),
  ).toHaveLength(2);
  expect(document.querySelectorAll(".react-flow__node input")).toHaveLength(0);
  expect(document.querySelectorAll(".react-flow__handle")).toHaveLength(
    handles,
  );
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(canvas.graph().nodes.some((node) => node.collapsed)).toBe(false);
  expect(document.querySelectorAll(".react-flow__node input")).toHaveLength(
    fields,
  );
  fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
  expect(canvas.graph().nodes.every((node) => node.collapsed)).toBe(true);
  fireEvent.keyDown(window, { key: "h" });
  expect(canvas.graph().nodes.some((node) => node.collapsed)).toBe(false);
  expect(canvas.graph().wires).toHaveLength(1);
});

test("Ctrl+A and Meta+A no longer select canvas nodes", async () => {
  selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    expect(fireEvent.keyDown(window, { key: "a", ...modifier })).toBe(true);
    expect(
      document.querySelectorAll(".react-flow__node.selected"),
    ).toHaveLength(0);
  }
});

test("the canvas menu shows A and Alt+A and performs both selection actions", async () => {
  const canvas = selectionCanvas();
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(2),
  );
  const pane = document.querySelector(".react-flow__pane") as Element;
  fireEvent.contextMenu(pane);
  const select = await screen.findByRole("menuitem", { name: "Select all" });
  const deselect = screen.getByRole("menuitem", { name: "Deselect all" });
  expect(select).toHaveAttribute("aria-keyshortcuts", "A");
  expect(deselect).toHaveAttribute("aria-keyshortcuts", "Alt+A");
  expect(
    select.querySelector('[data-slot="dropdown-menu-shortcut"]'),
  ).toHaveTextContent(/^A$/);
  expect(
    deselect.querySelector('[data-slot="dropdown-menu-shortcut"]'),
  ).toHaveTextContent(/^Alt\+A$/);
  fireEvent.click(select);
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    2,
  );
  fireEvent.contextMenu(pane);
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Deselect all" }),
  );
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    0,
  );
  expect(canvas.change).not.toHaveBeenCalled();
});

test("F2 renames one selected node and the rename supports undo and redo", async () => {
  const canvas = selectionCanvas(false, 1);
  await waitFor(() =>
    expect(document.querySelectorAll(".react-flow__node")).toHaveLength(1),
  );
  fireEvent.keyDown(window, { key: "a" });
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

test("find navigates occurrences, renames one or all, and gives one undo for the batch", async () => {
  const a = newNode("pass", { x: 0, y: 0 }, "first");
  const b = {
    ...newNode("pass", { x: 300, y: 0 }, "second"),
    name: "Pass pass",
    collapsed: true,
  };
  const wire = {
    id: "wire",
    from: { node: a.id, socket: "value" },
    to: { node: b.id, socket: "value" },
  };
  const canvas = selectionCanvas(false, 2, {
    format: 1,
    props: [],
    nodes: [a, b],
    wires: [wire],
  });
  await waitFor(() =>
    expect(document.querySelectorAll("[data-node-header]")).toHaveLength(2),
  );
  fireEvent.keyDown(window, { key: "a" });
  const openFind = () => fireEvent.keyDown(window, { key: "f", ctrlKey: true });
  expect(openFind()).toBe(false);
  const field = screen.getByRole("textbox", { name: "Find node names" });
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: "pAsS" } });
  const panel = within(
    screen.getByRole("region", { name: "Find and rename nodes" }),
  );
  const count = panel.getByRole("status");
  const active = () => document.querySelector("mark[data-active-match]");
  const selected = () =>
    Array.from(
      document.querySelectorAll(".react-flow__node.selected"),
      (node) => node.getAttribute("data-id"),
    );
  expect(count).toHaveTextContent("1 of 3");
  expect(selected()).toEqual(["first"]);
  expect(active()?.closest(".react-flow__node")).toHaveAttribute(
    "data-id",
    "first",
  );
  expect(document.querySelectorAll("mark")).toHaveLength(3);
  fireEvent.keyDown(field, { key: "Enter" });
  expect(count).toHaveTextContent("2 of 3");
  expect(selected()).toEqual(["second"]);
  expect(active()?.closest(".react-flow__node")).toHaveAttribute(
    "data-id",
    "second",
  );
  fireEvent.click(panel.getByRole("button", { name: "Next match" }));
  expect(active()).toHaveTextContent(/^pass$/);
  fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
  expect(active()).toHaveTextContent(/^Pass$/);
  fireEvent.click(panel.getByRole("button", { name: "Previous match" }));
  fireEvent.click(panel.getByRole("button", { name: "Previous match" }));
  expect(count).toHaveTextContent("3 of 3");
  expect(canvas.change).not.toHaveBeenCalled();

  fireEvent.click(panel.getByRole("button", { name: "Show rename" }));
  const replacement = panel.getByRole("textbox", { name: "Rename to" });
  fireEvent.change(replacement, { target: { value: "Layer" } });
  fireEvent.click(panel.getByRole("button", { name: "Rename" }));
  expect(canvas.graph().nodes.map((node) => node.name)).toEqual([
    undefined,
    "Pass Layer",
  ]);
  expect(count).toHaveTextContent("1 of 2");
  fireEvent.change(replacement, { target: { value: "Label" } });
  fireEvent.click(panel.getByRole("button", { name: "Rename all" }));
  expect(count).toHaveTextContent("No matches");
  expect(canvas.graph().nodes.map((node) => node.name)).toEqual([
    "Label",
    "Label Layer",
  ]);
  expect(canvas.graph().wires).toEqual([wire]);
  expect(canvas.change).toHaveBeenCalledTimes(2);

  fireEvent.keyDown(field, { key: "f", ctrlKey: true });
  expect(field).not.toBeInTheDocument();
  expect(document.querySelectorAll("mark")).toHaveLength(0);
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(canvas.graph().nodes.map((node) => node.name)).toEqual([
    undefined,
    "Pass Layer",
  ]);
  openFind();
  expect(screen.getByRole("textbox", { name: "Find node names" })).toHaveValue(
    "pAsS",
  );
});

test("node side borders resize width with the keyboard and support undo", async () => {
  const canvas = selectionCanvas(false, 1);
  await waitFor(() =>
    expect(document.querySelector("[data-node-type]")).not.toBeNull(),
  );
  const border = screen.getByLabelText("Resize node width from left");
  fireEvent.keyDown(border, { key: "ArrowLeft" });
  expect(canvas.graph().nodes[0]?.width).toBe(610);
  expect(canvas.graph().nodes[0]?.position).toEqual({ x: 0, y: 20 });
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(canvas.graph().nodes[0]?.width).toBeUndefined();
  expect(canvas.graph().nodes[0]?.position).toEqual({ x: 10, y: 20 });
});

test("double-clicking one node header starts renaming, and an unchanged name does not save", async () => {
  const canvas = selectionCanvas(false, 1);
  await waitFor(() =>
    expect(document.querySelector("[data-node-header]")).not.toBeNull(),
  );
  fireEvent.keyDown(window, { key: "a" });
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
  fireEvent.keyDown(window, { key: "a" });
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
    fireEvent.keyDown(window, { key: "a" });
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
  fireEvent.keyDown(window, { key: "a" });
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
    fireEvent.keyDown(window, { key: "a" });
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
  fireEvent.keyDown(field, { key: "a" });
  expect(document.querySelectorAll(".react-flow__node.selected")).toHaveLength(
    0,
  );
  fireEvent.keyDown(window, { key: "a" });
  for (const keys of [
    { key: "a", altKey: true },
    { key: "h" },
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
    { key: "a" },
    { key: "a", altKey: true },
    { key: "h" },
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
