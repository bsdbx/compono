import { expect, test } from "vitest";
import {
  addNode,
  addProp,
  changeProp,
  connect,
  disconnect,
  disconnectNode,
  disconnectNodes,
  duplicateNodes,
  duplicateProp,
  expose,
  freeName,
  type Graph,
  insertGroupRow,
  moveNodes,
  moveRow,
  newNode,
  OBJECT_FIELD_SOCKET,
  placeObjectField,
  placeRow,
  pruneDisconnectedRows,
  readGraph,
  removeNodes,
  removeObjectField,
  removeProp,
  removeRow,
  renameNode,
  renameObjectField,
  renameSocket,
  setNodeWidth,
  setProperty,
  setValue,
  toggleCollapsed,
  unexpose,
} from "./graph";

const at = (node: string, socket: string) => ({ node, socket });

test("Object fields retain their local values and wires through renaming, reordering and loading", () => {
  const empty: Graph = {
    format: 1,
    props: [],
    nodes: [
      newNode("object", { x: 0, y: 0 }, "item"),
      newNode("text", { x: 0, y: 0 }, "text"),
    ],
    wires: [],
  };
  const first = connect(
    empty,
    at("text", "value"),
    at("item", OBJECT_FIELD_SOCKET),
    "wire",
    { kind: "text" },
  );
  const connected = connect(
    first,
    at("text", "value"),
    at("item", OBJECT_FIELD_SOCKET),
    "wire2",
    { kind: "number", integer: true },
  );
  const labelId = connected.nodes[0]?.fields?.[0]?.id ?? "";
  const countId = connected.nodes[0]?.fields?.[1]?.id ?? "";
  expect(labelId).not.toBe(countId);
  expect(connected.wires[0]?.to.socket).toBe(labelId);
  const wired = setValue(connected, "item", labelId, "Local");
  const renamed = renameObjectField(wired, "item", labelId, "label");
  const ordered = placeObjectField(renamed, "item", countId, labelId);
  const loaded = readGraph(ordered);
  expect(loaded.nodes[0]?.fields?.map((field) => field.name)).toEqual([
    "field2",
    "label",
  ]);
  expect(loaded.nodes[0]?.fields?.[0]?.type).toEqual({
    kind: "number",
    integer: true,
  });
  expect(loaded.nodes[0]?.values).toEqual({ [labelId]: "Local" });
  expect(loaded.wires).toEqual(wired.wires);

  const disconnected = pruneDisconnectedRows(
    loaded,
    disconnect(loaded, new Set(["wire"])),
  );
  expect(disconnected.nodes[0]?.fields).toEqual(loaded.nodes[0]?.fields);
  const removed = removeObjectField(loaded, "item", labelId);
  expect(removed.nodes[0]?.fields?.map((field) => field.id)).toEqual([countId]);
  expect(removed.nodes[0]?.values).toEqual({});
  expect(removed.wires.map((wire) => wire.id)).toEqual(["wire2"]);
});

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

test("inserting wires between group entries preserves the existing row IDs and connections", () => {
  const start = graph();
  const next = connect(
    start,
    at("title", "value"),
    at("card", "children/+/r1"),
    "inserted",
  );
  const rows = next.nodes[1]?.groups.children ?? [];
  expect(rows).toHaveLength(2);
  expect(rows[1]).toBe("r1");
  expect(next.wires.find((wire) => wire.id === "w2")).toEqual(start.wires[1]);
  expect(next.wires.at(-1)?.to.socket).toBe(`children/${rows[0]}`);
});

test("removing a wire or its source removes only that wire's group row", () => {
  const start = insertGroupRow(
    graph(),
    "card",
    "children",
    undefined,
    "manual",
  );
  for (const changed of [
    disconnect(start, new Set(["w2"])),
    removeNodes(start, new Set(["badge"])),
    disconnectNodes(start, new Set(["card"])),
  ]) {
    const next = pruneDisconnectedRows(start, changed);
    expect(
      next.nodes.find((node) => node.id === "card")?.groups.children,
    ).toEqual(["manual"]);
  }
  expect(start.nodes[1]?.groups.children).toEqual(["r1", "manual"]);
});

test("replacing a connection in the same group row does not remove its slot", () => {
  const start = graph();
  const changed = connect(
    start,
    at("title", "value"),
    at("card", "children/r1"),
    "replacement",
  );
  expect(
    pruneDisconnectedRows(start, changed).nodes[1]?.groups.children,
  ).toEqual(["r1"]);
});

test("row reordering preserves wires and ignores stale or unchanged destinations", () => {
  const start = insertGroupRow(
    insertGroupRow(graph(), "card", "children", undefined, "r2"),
    "card",
    "children",
    undefined,
    "r3",
  );
  const next = placeRow(start, "card", "children", "r3", "r1");
  expect(next.nodes[1]?.groups.children).toEqual(["r3", "r1", "r2"]);
  expect(next.wires).toBe(start.wires);
  expect(placeRow(start, "card", "children", "r1", "r1")).toBe(start);
  expect(placeRow(start, "card", "children", "r1", "missing")).toBe(start);
  expect(placeRow(start, "card", "children", "r3")).toBe(start);
});

test("child names survive reading, duplication and reordering while socket and wire IDs stay fixed", () => {
  const start = renameSocket(
    graph(),
    "card",
    "children",
    "r1",
    "  Header    content  ",
  );
  expect(start.nodes[1]?.socketNames).toEqual({
    "children/r1": "Header content",
  });
  expect(readGraph(start as unknown as Record<string, unknown>)).toEqual(start);
  const copy = duplicateNodes(start, ["card"], { newId: () => "copy" });
  expect(copy.graph.nodes.at(-1)?.socketNames).toEqual(
    start.nodes[1]?.socketNames,
  );
  const next = placeRow(
    insertGroupRow(start, "card", "children", undefined, "other"),
    "card",
    "children",
    "r1",
  );
  expect(next.nodes[1]?.socketNames).toEqual(start.nodes[1]?.socketNames);
  expect(next.wires).toBe(start.wires);
  expect(renameSocket(start, "card", "children", "missing", "Ignored")).toBe(
    start,
  );
});

test("clearing names and deleting their rows removes the saved child-name metadata", () => {
  const start = renameSocket(graph(), "card", "children", "r1", "Header");
  expect(
    renameSocket(start, "card", "children", "r1", "").nodes[1]?.socketNames,
  ).toBeUndefined();
  expect(
    removeRow(start, "card", "children", "r1").nodes[1]?.socketNames,
  ).toBeUndefined();
  expect(
    pruneDisconnectedRows(start, disconnect(start, new Set(["w2"]))).nodes[1]
      ?.socketNames,
  ).toBeUndefined();
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

test("a duplicate preserves its position, values and socket rows independently", () => {
  const start = setValue(graph(), "card", "class", "card");
  let count = 0;
  const { graph: next, copies } = duplicateNodes(start, ["card"], {
    newId: () => `copy${++count}`,
  });

  expect(copies).toEqual(["copy1"]);
  expect(next.nodes.at(-1)).toEqual({
    id: "copy1",
    type: "element",
    position: { x: 300, y: 0 },
    values: { class: "card" },
    properties: {},
    exposed: [],
    groups: { children: ["r1"] },
  });
  expect(next.wires).toEqual(start.wires);
  next.nodes.at(-1)?.groups.children?.push("r2");
  expect(start.nodes[1]?.groups.children).toEqual(["r1"]);
});

test("duplicates keep internal connections without copying external inputs", () => {
  const start = graph();
  let count = 0;
  const done = duplicateNodes(start, ["title", "card"], {
    newId: () => `copy${++count}`,
  });
  expect(done.copies).toEqual(["copy1", "copy2"]);
  expect(done.graph.wires).toEqual([
    ...start.wires,
    {
      id: "copy3",
      from: at("copy1", "value"),
      to: at("copy2", "text"),
    },
  ]);
});

test("linked duplicates reuse external inputs and remap internal inputs without stealing outputs", () => {
  const start = graph();
  let count = 0;
  const done = duplicateNodes(start, ["card", "badge"], {
    linked: true,
    newId: () => `copy${++count}`,
  });
  expect(done.graph.wires).toEqual([
    ...start.wires,
    { id: "copy3", from: at("title", "value"), to: at("copy1", "text") },
    {
      id: "copy4",
      from: at("copy2", "element"),
      to: at("copy1", "children/r1"),
    },
  ]);
  expect(done.graph.nodes.find((node) => node.id === "copy1")?.groups).toEqual({
    children: ["r1"],
  });
});

test("an empty duplication is a no-op", () => {
  const start = graph();
  expect(duplicateNodes(start, ["missing"]).graph).toBe(start);
});

test("node labels survive reading and duplication without changing type or sockets", () => {
  const start = graph();
  const renamed = renameNode(start, "card", "  Pricing card  ");
  const card = renamed.nodes.find((node) => node.id === "card");
  expect(card).toEqual({ ...start.nodes[1], name: "Pricing card" });
  expect(renamed.wires).toBe(start.wires);
  expect(readGraph(renamed as unknown as Record<string, unknown>)).toEqual(
    renamed,
  );
  expect(
    duplicateNodes(renamed, ["card"], { newId: () => "copy" }).graph.nodes.at(
      -1,
    )?.name,
  ).toBe("Pricing card");
  expect(start.nodes[1]?.name).toBeUndefined();
  expect(renameNode(renamed, "card", "Pricing card")).toBe(renamed);
  const cleared = renameNode(renamed, "card", "  ");
  expect(cleared.nodes).toEqual(start.nodes);
  expect(renameNode(start, "card", "")).toBe(start);
  expect(renameNode(start, "missing", "Label")).toBe(start);
});

test("node width persists, duplicates independently, and resizing only changes layout", () => {
  const start = graph();
  const resized = setNodeWidth(start, "card", 320, { x: 250, y: 0 });
  expect(resized.nodes[1]).toEqual({
    ...start.nodes[1],
    width: 320,
    position: { x: 250, y: 0 },
  });
  expect(resized.wires).toBe(start.wires);
  expect(readGraph(resized as unknown as Record<string, unknown>)).toEqual(
    resized,
  );
  const copy = duplicateNodes(resized, ["card"], {
    newId: () => "copy",
  }).graph.nodes.at(-1);
  expect(copy?.width).toBe(320);
  expect(setNodeWidth(resized, "card", 320)).toBe(resized);
  expect(setNodeWidth(resized, "missing", 320)).toBe(resized);
  expect(setNodeWidth(resized, "card", 1).nodes[1]?.width).toBe(168);
  expect(
    renameNode(start, "card", "x".repeat(200)).nodes[1]?.name,
  ).toHaveLength(128);
});

test("collapsed nodes retain their content, wires and expanded widths through saves and duplication", () => {
  const start = setNodeWidth(graph(), "card", 320);
  const ids = new Set(["title", "card"]);
  const collapsed = toggleCollapsed(start, ids);
  expect(collapsed.nodes.map((node) => node.collapsed)).toEqual([
    true,
    true,
    undefined,
  ]);
  expect(collapsed.wires).toBe(start.wires);
  expect(collapsed.props).toBe(start.props);
  expect(collapsed.nodes[2]).toBe(start.nodes[2]);
  expect(start.nodes[0]?.collapsed).toBeUndefined();
  expect(readGraph(collapsed as unknown as Record<string, unknown>)).toEqual(
    collapsed,
  );
  const copy = duplicateNodes(collapsed, ["card"], {
    newId: () => "copy",
  }).graph.nodes.at(-1);
  expect(copy?.collapsed).toBe(true);
  expect(copy?.width).toBe(320);
  expect(toggleCollapsed(collapsed, ids)).toEqual(start);
  expect(toggleCollapsed(start, new Set(["missing"]))).toBe(start);
});

test("a mixed selection collapses together before expanding together", () => {
  const mixed = toggleCollapsed(graph(), new Set(["card"]));
  const collapsed = toggleCollapsed(mixed, new Set(["title", "card"]));
  expect(collapsed.nodes.map((node) => node.collapsed)).toEqual([
    true,
    true,
    undefined,
  ]);
  expect(collapsed.nodes[1]).toBe(mixed.nodes[1]);
  expect(toggleCollapsed(collapsed, new Set(["title", "card"]))).toEqual(
    graph(),
  );
});

test("linked duplication leaves external consumers connected to the original", () => {
  const start = graph();
  const done = duplicateNodes(start, ["title"], {
    linked: true,
    newId: () => "copy",
  });
  expect(done.graph.wires).toEqual(start.wires);
  expect(done.graph.wires[0]?.from.node).toBe("title");
});

test("disconnecting a selection removes all touching wires and preserves socket rows", () => {
  const start = graph();
  const done = disconnectNodes(start, new Set(["title", "badge"]));
  expect(done.wires).toEqual([]);
  expect(done.nodes).toBe(start.nodes);
  expect(done.nodes[1]?.groups.children).toEqual(["r1"]);
  expect(disconnectNodes(start, new Set())).toBe(start);
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

test("disconnecting a typed row preserves its fallback and deleting it clears that value", () => {
  const start: Graph = {
    format: 1,
    props: [],
    nodes: [
      newNode("text", { x: 0, y: 0 }, "source"),
      {
        ...newNode("join", { x: 0, y: 0 }, "join"),
        groups: { items: ["typed", "wire-only"] },
        values: { "items/typed": "", separator: "/" },
        socketNames: { "items/typed": "Optional", "items/wire-only": "Wired" },
      },
    ],
    wires: ["typed", "wire-only"].map((id) => ({
      id,
      from: at("source", "value"),
      to: at("join", `items/${id}`),
    })),
  };
  const disconnected = pruneDisconnectedRows(
    start,
    disconnect(start, new Set(["typed", "wire-only"])),
  );
  expect(disconnected.nodes[1]).toMatchObject({
    groups: { items: ["typed"] },
    values: { "items/typed": "", separator: "/" },
    socketNames: { "items/typed": "Optional" },
  });
  expect(disconnected.nodes[1]?.socketNames).not.toHaveProperty(
    "items/wire-only",
  );
  expect(
    removeRow(disconnected, "join", "items", "typed").nodes[1]?.values,
  ).toEqual({ separator: "/" });
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
