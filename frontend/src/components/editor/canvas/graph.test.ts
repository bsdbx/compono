import { expect, test } from "vitest";
import {
  addNode,
  addProp,
  changeProp,
  connect,
  disconnect,
  disconnectNode,
  duplicateNodes,
  duplicateProp,
  expose,
  freeName,
  type Graph,
  moveNodes,
  moveRow,
  newNode,
  readGraph,
  removeNodes,
  removeProp,
  removeRow,
  setProperty,
  setValue,
  unexpose,
} from "./graph";

const at = (node: string, socket: string) => ({ node, socket });

function graph(): Graph {
  return {
    format: 1,
    props: [],
    nodes: [
      newNode("text", { x: 0, y: 0 }, "title"),
      {
        ...newNode("element", { x: 300, y: 0 }, "card"),
        groups: { children: ["r1"] },
      },
      newNode("element", { x: 300, y: 200 }, "badge"),
    ],
    wires: [
      { id: "w1", from: at("title", "value"), to: at("card", "text") },
      { id: "w2", from: at("badge", "element"), to: at("card", "children/r1") },
    ],
  };
}

test("a stored graph reads with every field there, and {} is a graph of nothing", () => {
  expect(readGraph({})).toEqual({ format: 1, props: [], nodes: [], wires: [] });
  expect(
    readGraph({
      format: 1,
      nodes: [{ id: "a", type: "text", values: { value: "Hi" } }],
      wires: [],
    }).nodes,
  ).toEqual([
    {
      id: "a",
      type: "text",
      position: { x: 0, y: 0 },
      values: { value: "Hi" },
      properties: {},
      exposed: [],
      groups: {},
    },
  ]);
});

test("removing nodes takes their wires too", () => {
  const next = removeNodes(graph(), new Set(["badge"]));

  expect(next.nodes.map((node) => node.id)).toEqual(["title", "card"]);
  expect(next.wires.map((wire) => wire.id)).toEqual(["w1"]);
});

test("a new wire into an input replaces the one that was there", () => {
  const next = connect(
    graph(),
    at("badge", "element"),
    at("card", "text"),
    "w3",
  );

  expect(next.wires).toEqual([
    { id: "w2", from: at("badge", "element"), to: at("card", "children/r1") },
    { id: "w3", from: at("badge", "element"), to: at("card", "text") },
  ]);
});

test("wiring into a group's Add row adds a row for the wire", () => {
  const next = connect(
    graph(),
    at("title", "value"),
    at("card", "children/+"),
    "w3",
  );

  const rows =
    next.nodes.find((node) => node.id === "card")?.groups.children ?? [];
  expect(rows).toHaveLength(2);
  expect(next.wires.at(-1)).toEqual({
    id: "w3",
    from: at("title", "value"),
    to: at("card", `children/${rows[1]}`),
  });
  // The first row keeps its wire
  expect(next.wires.map((wire) => wire.id)).toEqual(["w1", "w2", "w3"]);
});

test("disconnecting wires, or every wire of a node", () => {
  expect(
    disconnect(graph(), new Set(["w1"])).wires.map((wire) => wire.id),
  ).toEqual(["w2"]);
  expect(disconnectNode(graph(), "card").wires).toEqual([]);
  expect(disconnectNode(graph(), "title").wires.map((wire) => wire.id)).toEqual(
    ["w2"],
  );
});

test("moving and adding nodes", () => {
  const moved = moveNodes(graph(), new Map([["title", { x: 10, y: 20 }]]));
  expect(moved.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  expect(moved.nodes[1]).toEqual(graph().nodes[1]);

  const added = addNode(graph(), newNode("boolean", { x: 5, y: 5 }, "flag"));
  expect(added.nodes.at(-1)).toEqual(
    newNode("boolean", { x: 5, y: 5 }, "flag"),
  );
});

test("a duplicate sits to the side, with its values but no wires or rows", () => {
  const start = setValue(graph(), "card", "class", "card");
  let count = 0;
  const { graph: next, copies } = duplicateNodes(
    start,
    ["card"],
    () => `copy${++count}`,
  );

  expect(copies).toEqual(["copy1"]);
  expect(next.nodes.at(-1)).toEqual({
    id: "copy1",
    type: "element",
    position: { x: 340, y: 40 },
    values: { class: "card" },
    properties: {},
    exposed: [],
    groups: {},
  });
  expect(next.wires).toEqual(start.wires);
});

test("typing a value in, and clearing it back to the default", () => {
  const typed = setValue(graph(), "card", "class", "card");
  expect(typed.nodes[1]?.values).toEqual({ class: "card" });
  expect(setValue(typed, "card", "class", undefined).nodes[1]?.values).toEqual(
    {},
  );
  expect(
    setProperty(graph(), "title", "subtype", "Link").nodes[0]?.properties,
  ).toEqual({
    subtype: "Link",
  });
});

test("rows move up and down, and go with their wire", () => {
  const two = connect(
    graph(),
    at("title", "value"),
    at("card", "children/+"),
    "w3",
  );
  const rows = two.nodes[1]?.groups.children ?? [];
  const second = rows[1] as string;

  expect(
    moveRow(two, "card", "children", second, -1).nodes[1]?.groups.children,
  ).toEqual([second, "r1"]);
  // Not past the ends
  expect(
    moveRow(two, "card", "children", "r1", -1).nodes[1]?.groups.children,
  ).toEqual(rows);
  const removed = removeRow(two, "card", "children", "r1");
  expect(removed.nodes[1]?.groups.children).toEqual([second]);
  expect(removed.wires.map((wire) => wire.id)).toEqual(["w1", "w3"]);
});

test("exposing a property makes it an input, once; unexposing takes its wire away too", () => {
  const exposed = expose(
    expose(setProperty(graph(), "card", "title", "Pricing"), "card", "title"),
    "card",
    "title",
  );
  const card = exposed.nodes.find((node) => node.id === "card");
  expect(card?.exposed).toEqual(["title"]);
  expect(card?.properties).toEqual({ title: "Pricing" });

  const wired = connect(
    exposed,
    at("title", "value"),
    at("card", "title"),
    "w3",
  );
  const back = unexpose(wired, "card", "title");
  expect(back.nodes.find((node) => node.id === "card")?.exposed).toEqual([]);
  // Its value stays, and only its own wire goes
  expect(back.nodes.find((node) => node.id === "card")?.properties).toEqual({
    title: "Pricing",
  });
  expect(back.wires.map((wire) => wire.id)).toEqual(["w1", "w2"]);
});

test("a new prop is Text, with a name no prop has", () => {
  const one = addProp(graph(), "p1");
  const two = addProp(one, "p2");
  expect(two.props).toEqual([
    { id: "p1", name: "prop", type: { kind: "text" } },
    { id: "p2", name: "prop2", type: { kind: "text" } },
  ]);
  expect(freeName(two, "prop2")).toBe("prop3");
  expect(freeName(two, "price")).toBe("price");
});

test("changing a prop changes only it", () => {
  const props = addProp(addProp(graph(), "p1"), "p2");
  const changed = changeProp(props, "p2", {
    name: "price",
    type: { kind: "number", integer: true },
  });
  expect(changed.props.map((prop) => [prop.name, prop.type.kind])).toEqual([
    ["prop", "text"],
    ["price", "number"],
  ]);
});

test("removing a prop takes the wires that brought it away", () => {
  const withInput = addNode(
    addProp(graph(), "p1"),
    newNode("component-input", { x: -300, y: 0 }, "input"),
  );
  const wired = connect(
    withInput,
    at("input", "p1"),
    at("card", "class"),
    "w3",
  );
  const removed = removeProp(wired, "p1");
  expect(removed.props).toEqual([]);
  expect(removed.wires.map((wire) => wire.id)).toEqual(["w1", "w2"]);
});

test("a duplicate prop comes right after the original, with a free name", () => {
  const props = changeProp(addProp(addProp(graph(), "p1"), "p2"), "p1", {
    name: "price",
    description: "Per month",
  });
  const copied = duplicateProp(props, "p1", "p3");
  expect(
    copied.props.map((prop) => [prop.id, prop.name, prop.description]),
  ).toEqual([
    ["p1", "price", "Per month"],
    ["p3", "price2", "Per month"],
    ["p2", "prop2", undefined],
  ]);
  expect(duplicateProp(props, "gone")).toBe(props);
});
