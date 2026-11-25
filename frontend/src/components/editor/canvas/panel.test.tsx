import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { NodeTypeInfo } from "@/api/types";
import { Toasts } from "@/components/ui/toast";
import { CanvasContext, type CanvasState } from "./context";
import {
  type Graph,
  newNode,
  pruneDisconnectedRows,
  readGraph,
  setValue,
} from "./graph";
import { PropertiesPanel } from "./panel";

const ELEMENT: NodeTypeInfo = {
  type: "element",
  name: "Element",
  category: "Elements",
  single: false,
  properties: [
    {
      id: "id",
      label: "ID",
      type: { kind: "text" },
      default: "",
      on_node: false,
    },
    {
      id: "title",
      label: "Title",
      type: { kind: "text" },
      default: "",
      on_node: false,
    },
    {
      id: "hidden",
      label: "Hidden",
      type: { kind: "boolean" },
      default: false,
      on_node: false,
    },
  ],
  sockets: {
    inputs: [
      {
        id: "tag",
        label: "Tag",
        type: { kind: "choice", options: ["div", "h3"] },
        default: "div",
      },
      { id: "text", label: "Text", type: { kind: "text" }, default: "" },
      { id: "class", label: "Class name", type: { kind: "text" }, default: "" },
    ],
    groups: [
      {
        id: "children",
        label: "Children",
        type: { kind: "element" },
        before: "class",
      },
    ],
    outputs: [{ id: "element", label: "Element", type: { kind: "element" } }],
  },
};

const INPUT: NodeTypeInfo = {
  type: "component-input",
  name: "Component Input",
  category: "Component",
  single: true,
  properties: [],
  sockets: { inputs: [], groups: [], outputs: [] },
};

const TEXT: NodeTypeInfo = {
  type: "text",
  name: "Text",
  category: "Values",
  single: false,
  properties: [
    {
      id: "value",
      label: "Value",
      type: { kind: "text" },
      default: "",
      on_node: true,
    },
  ],
  sockets: {
    inputs: [],
    groups: [],
    outputs: [{ id: "value", label: "Value", type: { kind: "text" } }],
  },
};

function graph(change: Partial<Graph> = {}): Graph {
  return {
    format: 1,
    props: [
      { id: "p1", name: "price", type: { kind: "number", integer: true } },
      { id: "p2", name: "ctaHref", type: { kind: "text", link: true } },
    ],
    nodes: [
      {
        ...newNode("element", { x: 0, y: 0 }, "h3"),
        values: { tag: "h3", class: "uppercase" },
      },
      newNode("component-input", { x: -300, y: 0 }, "input"),
    ],
    wires: [
      {
        id: "w1",
        from: { node: "input", socket: "p2" },
        to: { node: "h3", socket: "text" },
      },
    ],
    ...change,
  };
}

function show(selected: string[], current = graph(), refused: string[] = []) {
  const edit = vi.fn<CanvasState["edit"]>();
  const canvas: CanvasState = {
    graph: current,
    nodeTypes: new Map([
      ["element", ELEMENT],
      ["component-input", INPUT],
      ["text", TEXT],
    ]),
    evaluated: new Map(),
    refused: new Set(refused),
    edit,
    openMenu: () => {},
    renaming: undefined,
    startRename: () => {},
    finishRename: () => {},
    resizeNode: () => {},
  };
  const { unmount } = render(
    <Toasts>
      <CanvasContext value={canvas}>
        <PropertiesPanel selected={selected} />
      </CanvasContext>
    </Toasts>,
  );
  // What the panel's last edit makes of the graph
  const edited = () => edit.mock.calls.at(-1)?.[0](current);
  return { edit, edited, unmount };
}

test("with no node selected, or several, the panel asks for one", () => {
  show([]);
  expect(
    screen.getByText("Select a node to edit its properties."),
  ).toBeInTheDocument();
});

test("with several nodes selected, the panel asks for one", () => {
  show(["h3", "input"]);
  expect(
    screen.getByText("Select one node to edit its properties."),
  ).toBeInTheDocument();
});

test("a selected node lists properties and default inputs together", () => {
  const { edited } = show(["h3"]);

  expect(
    screen.getByRole("heading", { level: 2, name: "Properties" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("heading")).toHaveLength(1);
  const properties = screen.getByRole("region", { name: "Properties" });
  expect(within(properties).getByLabelText("ID")).toHaveValue("");
  expect(
    within(properties).getByRole("switch", { name: "Hidden" }),
  ).toBeInTheDocument();
  // Text has a wire, so the row offers actions instead of a field
  expect(screen.queryByRole("region", { name: "Inputs" })).toBeNull();
  expect(
    within(properties).getByRole("combobox", { name: "Tag" }),
  ).toHaveTextContent("h3");
  const className = within(properties).getByLabelText("Class name");
  expect(className).toHaveValue("uppercase");
  expect(className.closest("[data-menu]")).toHaveAttribute(
    "data-exposed",
    "true",
  );
  expect(within(properties).getByText("Wired")).toBeInTheDocument();
  expect(
    within(within(properties).getByTitle("Children")).getByText("0"),
  ).toBeInTheDocument();
  expect(within(properties).queryByLabelText("Text")).toBeNull();

  fireEvent.change(className, {
    target: { value: "card" },
  });
  expect(edited()?.nodes[0]?.values).toEqual({ tag: "h3", class: "card" });
});

test("wired children can be reordered and renamed inside their group", () => {
  const current = graph({
    nodes: [
      {
        ...newNode("element", { x: 0, y: 0 }, "parent"),
        groups: { children: ["first", "refused", "unwired", "second"] },
        socketNames: { "children/first": "Heading" },
      },
      { ...newNode("element", { x: -300, y: 0 }, "child"), name: "Title" },
    ],
    wires: ["first", "second", "refused"].map((row) => ({
      id: row,
      from: { node: "child", socket: "element" },
      to: { node: "parent", socket: `children/${row}` },
    })),
  });
  const { edit, edited } = show(["parent"], current, ["refused"]);
  const properties = within(screen.getByRole("region", { name: "Properties" }));
  const children = properties.getByText("Children");
  expect(children.closest("[data-exposed]")).toBeInTheDocument();
  expect(
    within(properties.getByTitle("Children")).getByText("2"),
  ).toBeInTheDocument();
  const items = within(
    properties.getByRole("list", { name: "Children order" }),
  );
  expect(items.getAllByRole("listitem")).toHaveLength(2);
  expect(items.getByText("Heading")).toBeInTheDocument();
  expect(items.getByText("Element")).toBeInTheDocument();
  expect(items.queryByText("Title")).toBeNull();

  fireEvent.contextMenu(items.getByText("Heading"));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(edit).not.toHaveBeenCalled();

  fireEvent.keyDown(items.getByRole("button", { name: "Reorder Children 1" }), {
    key: "ArrowDown",
    altKey: true,
  });
  expect(edited()?.nodes[0]?.groups.children).toEqual([
    "second",
    "refused",
    "unwired",
    "first",
  ]);
  expect(edited()?.wires).toEqual(current.wires);

  fireEvent.keyDown(
    properties.getByRole("button", { name: "Reorder Children" }),
    {
      key: "ArrowDown",
      altKey: true,
    },
  );
  expect(edited()?.nodes[0]?.propertyOrder?.slice(-2)).toEqual([
    "class",
    "group:children",
  ]);
  expect(edited()?.nodes[0]?.groups.children).toEqual(
    current.nodes[0]?.groups.children,
  );

  fireEvent.doubleClick(items.getByRole("button", { name: "Heading" }));
  const name = items.getByRole("textbox", { name: "Child name" });
  expect(name).toHaveFocus();
  expect(name).toHaveValue("Heading");
  fireEvent.change(name, { target: { value: "Discard" } });
  fireEvent.keyDown(name, { key: "Escape" });
  expect(edit).toHaveBeenCalledTimes(2);

  fireEvent.keyDown(items.getByRole("button", { name: "Heading" }), {
    key: "F2",
  });
  const nextName = items.getByRole("textbox", { name: "Child name" });
  fireEvent.change(nextName, { target: { value: "  Hero   title " } });
  fireEvent.keyDown(nextName, { key: "Enter" });
  expect(edited()?.nodes[0]?.socketNames).toEqual({
    "children/first": "Hero title",
  });
  expect(edited()?.wires).toEqual(current.wires);
  expect(edited()?.nodes[1]?.name).toBe("Title");
});

test("Children can be unexposed and exposed again without changing other inputs", () => {
  const start = graph();
  start.nodes = [
    {
      ...newNode("element", { x: 0, y: 0 }, "h3"),
      groups: { children: ["wired", "manual"] },
      propertyOrder: ["class", "group:children", "text"],
      exposed: ["title"],
    },
    ...start.nodes.slice(1),
    newNode("element", { x: -300, y: 100 }, "child"),
  ];
  start.wires.push({
    id: "child",
    from: { node: "child", socket: "element" },
    to: { node: "h3", socket: "children/wired" },
  });
  const first = show(["h3"], start);
  fireEvent.contextMenu(screen.getByText("Children", { exact: true }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Unexpose" }));
  const hidden = pruneDisconnectedRows(start, first.edited() ?? start);
  expect(hidden.nodes[0]?.unexposed).toEqual(["group:children"]);
  expect(hidden.nodes[0]?.groups.children).toEqual(["manual"]);
  expect(hidden.wires.map((wire) => wire.id)).toEqual(["w1"]);
  first.unmount();

  const second = show(["h3"], readGraph(hidden));
  const row = screen.getByText("Children", { exact: true });
  expect(row.closest("[data-exposed]")).toBeNull();
  expect(screen.queryByRole("list", { name: "Children order" })).toBeNull();
  fireEvent.contextMenu(row);
  fireEvent.click(screen.getByRole("menuitem", { name: "Expose" }));
  const exposed = second.edited();
  expect(exposed?.nodes[0]?.unexposed).toBeUndefined();
  expect(exposed?.nodes[0]?.exposed).toEqual(["title"]);
  expect(exposed?.nodes[0]?.propertyOrder).toEqual(
    start.nodes[0]?.propertyOrder,
  );
  expect(exposed?.wires).toEqual(hidden.wires);
});

test("the handles reorder properties and default inputs across a reload", () => {
  const original = graph();
  const panel = show(["h3"], original);
  const list = () => screen.getByRole("list", { name: "Node property order" });
  const ids = () =>
    within(list())
      .getAllByRole("listitem")
      .map((row) => row.dataset.row);
  expect(ids()).toEqual([
    "id",
    "title",
    "hidden",
    "tag",
    "text",
    "group:children",
    "class",
  ]);

  const text = screen.getByRole("button", { name: "Reorder Text" });
  fireEvent.keyDown(text, { key: "ArrowUp", altKey: true });
  const reordered = panel.edited();
  expect(reordered?.nodes[0]?.propertyOrder).toEqual([
    "id",
    "title",
    "hidden",
    "text",
    "tag",
    "group:children",
    "class",
  ]);
  expect(reordered?.wires).toEqual(original.wires);
  expect(reordered?.nodes[0]?.values).toEqual(original.nodes[0]?.values);
  panel.unmount();

  show(["h3"], readGraph(reordered ?? {}));
  expect(ids()).toEqual(reordered?.nodes[0]?.propertyOrder);
  expect(within(list()).getByText("Wired")).toBeInTheDocument();
});

test("a property exposes from its menu, and then it's an input", () => {
  const { edited } = show(["h3"]);

  fireEvent.contextMenu(screen.getByLabelText("Title"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Expose" }));
  expect(edited()?.nodes[0]?.exposed).toEqual(["title"]);
});

test("an exposed property is marked in the list and can unexpose from its menu", () => {
  const exposed = graph();
  exposed.nodes[0] = {
    ...(exposed.nodes[0] as Graph["nodes"][number]),
    exposed: ["title"],
    properties: { title: "Pricing" },
  };
  const { edited } = show(["h3"], exposed);

  const properties = screen.getByRole("region", { name: "Properties" });
  const title = within(properties).getByLabelText("Title");
  expect(title).toHaveValue("Pricing");
  expect(title.closest("[data-menu]")).toHaveAttribute("data-exposed", "true");

  fireEvent.contextMenu(title);
  expect(screen.queryByRole("menuitem", { name: "Expose" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Unexpose" }));
  expect(edited()?.nodes[0]?.exposed).toEqual([]);
});

test("a wired default input can move into Properties and be exposed again with the same value and socket ID", () => {
  const original = setValue(graph(), "h3", "text", "Fallback text");
  const initial = show(["h3"], original);
  const initialProperties = screen.getByRole("region", { name: "Properties" });
  fireEvent.contextMenu(within(initialProperties).getByText("Text"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Unexpose" }));
  const hidden = initial.edited();
  expect(hidden?.nodes[0]?.unexposed).toEqual(["text"]);
  expect(hidden?.wires).toEqual([]);
  initial.unmount();

  const reopened = show(["h3"], readGraph(hidden ?? {}));
  const properties = screen.getByRole("region", { name: "Properties" });
  const text = within(properties).getByRole("textbox", { name: "Text" });
  expect(text).toHaveValue("Fallback text");
  expect(text.closest("[data-menu]")).not.toHaveAttribute("data-exposed");
  fireEvent.contextMenu(text);
  fireEvent.click(screen.getByRole("menuitem", { name: "Expose" }));
  expect(reopened.edited()?.nodes[0]).toEqual(original.nodes[0]);
  expect(reopened.edited()?.wires).toEqual([]);
});

test("inline output values can become inputs or move into Properties", () => {
  const graphWithText = graph({
    nodes: [
      {
        ...newNode("text", { x: 0, y: 0 }, "text"),
        properties: { value: "Hello" },
      },
    ],
    wires: [],
  });
  const initial = show(["text"], graphWithText);
  const properties = screen.getByRole("region", { name: "Properties" });
  const inline = within(properties).getByRole("textbox", { name: "Value" });
  expect(inline.closest("[data-menu]")).not.toHaveAttribute("data-exposed");
  fireEvent.contextMenu(inline);
  fireEvent.click(screen.getByRole("menuitem", { name: "Expose" }));
  const exposed = initial.edited();
  expect(exposed?.nodes[0]?.exposed).toEqual(["value"]);
  initial.unmount();

  const showExposed = show(["text"], exposed);
  const value = within(
    screen.getByRole("region", { name: "Properties" }),
  ).getByRole("textbox", { name: "Value" });
  expect(value).toHaveValue("Hello");
  expect(value.closest("[data-menu]")).toHaveAttribute("data-exposed", "true");
  expect(screen.queryByRole("region", { name: "Output" })).toBeNull();
  fireEvent.contextMenu(value);
  fireEvent.click(screen.getByRole("menuitem", { name: "Unexpose" }));
  const hidden = showExposed.edited();
  expect(hidden?.nodes[0]?.exposed).toEqual([]);
  expect(hidden?.nodes[0]?.unexposed).toEqual(["value"]);
  showExposed.unmount();
  show(["text"], hidden);
  expect(
    within(screen.getByRole("region", { name: "Properties" })).getByRole(
      "textbox",
      { name: "Value" },
    ),
  ).toHaveValue("Hello");
});

test("Component Input lists the props, and adds one", () => {
  const { edited } = show(["input"]);

  const props = screen.getByRole("region", { name: "Props" });
  expect(
    within(props).getByRole("button", { name: /price/ }),
  ).toHaveTextContent("Number · Integer");
  expect(
    within(props).getByRole("button", { name: /ctaHref/ }),
  ).toHaveTextContent("Text · Link");

  fireEvent.click(within(props).getByRole("button", { name: "Add prop" }));
  expect(edited()?.props.map((prop) => prop.name)).toEqual([
    "price",
    "ctaHref",
    "prop",
  ]);
});

test("a prop opens to edit it, and takes only a free name for React", async () => {
  const { edit, edited } = show(["input"]);

  fireEvent.click(screen.getByRole("button", { name: /price/ }));
  const name = screen.getByLabelText("Name");
  expect(name).toHaveValue("price");
  expect(screen.getByLabelText("Max")).toBeInTheDocument();

  // Taken, then not a name
  fireEvent.change(name, { target: { value: "ctaHref" } });
  fireEvent.change(name, { target: { value: "2 dollars" } });
  expect(edit).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: "amount" } });
  expect(edited()?.props[0]?.name).toBe("amount");

  fireEvent.keyDown(screen.getByRole("combobox", { name: "Type" }), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: "Choice" }));
  expect(edited()?.props[0]?.type).toEqual({ kind: "choice", options: [] });
});

test("a prop's menu duplicates and deletes it", () => {
  const { edited } = show(["input"]);

  fireEvent.contextMenu(screen.getByRole("button", { name: /ctaHref/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  const deleted = edited();
  expect(deleted?.props.map((prop) => prop.name)).toEqual(["price"]);
  // The wire that brought it goes too
  expect(deleted?.wires).toEqual([]);
});
