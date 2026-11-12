import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { NodeTypeInfo } from "@/api/types.gen";
import { Toasts } from "@/components/ui/toast";
import { CanvasContext, type CanvasState } from "./context";
import { type Graph, newNode } from "./graph";
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
    groups: [],
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

function show(selected: string[], current = graph()) {
  const edit = vi.fn<CanvasState["edit"]>();
  const canvas: CanvasState = {
    graph: current,
    nodeTypes: new Map([
      ["element", ELEMENT],
      ["component-input", INPUT],
    ]),
    evaluated: new Map(),
    refused: new Set(),
    edit,
    openMenu: () => {},
  };
  render(
    <Toasts>
      <CanvasContext value={canvas}>
        <PropertiesPanel selected={selected} />
      </CanvasContext>
    </Toasts>,
  );
  // What the panel's last edit makes of the graph
  const edited = () => edit.mock.calls.at(-1)?.[0](current);
  return { edit, edited };
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

test("a selected node shows its properties, and the inputs typed on it", () => {
  const { edited } = show(["h3"]);

  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Element",
  );
  const properties = screen.getByRole("region", { name: "Properties" });
  expect(within(properties).getByLabelText("ID")).toHaveValue("");
  expect(
    within(properties).getByRole("switch", { name: "Hidden" }),
  ).toBeInTheDocument();
  // Text has a wire, so it isn't typed here
  const inputs = screen.getByRole("region", { name: "Inputs" });
  expect(within(inputs).getByLabelText("Tag")).toHaveValue("h3");
  expect(within(inputs).getByLabelText("Class name")).toHaveValue("uppercase");
  expect(within(inputs).queryByText("Text")).toBeNull();

  fireEvent.change(within(inputs).getByLabelText("Class name"), {
    target: { value: "card" },
  });
  expect(edited()?.nodes[0]?.values).toEqual({ tag: "h3", class: "card" });
});

test("a property exposes from its menu, and then it's an input", () => {
  const { edited } = show(["h3"]);

  fireEvent.contextMenu(screen.getByLabelText("Title"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Expose" }));
  expect(edited()?.nodes[0]?.exposed).toEqual(["title"]);
});

test("an exposed property is an input, and unexposes from its menu", () => {
  const exposed = graph();
  exposed.nodes[0] = {
    ...(exposed.nodes[0] as Graph["nodes"][number]),
    exposed: ["title"],
    properties: { title: "Pricing" },
  };
  const { edited } = show(["h3"], exposed);

  expect(
    within(screen.getByRole("region", { name: "Properties" })).queryByLabelText(
      "Title",
    ),
  ).toBeNull();
  const inputs = screen.getByRole("region", { name: "Inputs" });
  expect(within(inputs).getByLabelText("Title")).toHaveValue("Pricing");

  fireEvent.contextMenu(within(inputs).getByLabelText("Title"));
  expect(screen.queryByRole("menuitem", { name: "Expose" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Unexpose" }));
  expect(edited()?.nodes[0]?.exposed).toEqual([]);
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

test("a prop opens to edit it, and takes only a free name for React", () => {
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

  fireEvent.change(screen.getByLabelText("Type"), {
    target: { value: "choice" },
  });
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
