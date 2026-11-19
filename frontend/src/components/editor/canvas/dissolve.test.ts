import { expect, test } from "vitest";
import type { NodeSockets, NodeTypeInfo, Wire } from "@/api/types";
import type { Known } from "./context";
import { dissolveNodes } from "./dissolve";
import { type Graph, newNode, type SocketType } from "./graph";

const text: SocketType = { kind: "text" };
const element: SocketType = { kind: "element" };
const slot: SocketType = { kind: "slot" };
const number: SocketType = { kind: "number" };
const any: SocketType = { kind: "any" };
const type = (
  name: string,
  inputs: Record<string, SocketType>,
  outputs: Record<string, SocketType>,
): NodeTypeInfo => ({
  type: name,
  name,
  category: "Test",
  single: false,
  properties: [],
  sockets: {
    inputs: Object.entries(inputs).map(([id, type]) => ({
      id,
      label: id,
      type,
      default: null,
    })),
    groups: [],
    outputs: Object.entries(outputs).map(([id, type]) => ({
      id,
      label: id,
      type,
    })),
  },
});
const known: Known = {
  evaluated: new Map(),
  nodeTypes: new Map(
    [
      type("source", {}, { value: text }),
      type("pass", { value: text }, { value: text }),
      type("sink", { value: text }, {}),
      type("numeric", {}, { value: number }),
      type("convert", { value: number }, { value: text }),
      type("element", {}, { element }),
      type("wrapper", { child: element }, { element }),
      type("render", { render: slot }, {}),
      type(
        "switch",
        { condition: { kind: "boolean" }, true: text, false: text },
        { result: text },
      ),
      type("boolean", {}, { value: { kind: "boolean" } }),
      type("any", { value: any }, {}),
    ].map((node) => [node.type, node]),
  ),
};
const wire = (
  id: string,
  from: string,
  to: string,
  source = "value",
  target = "value",
): Wire => ({
  id,
  from: { node: from, socket: source },
  to: { node: to, socket: target },
});
const graph = (nodes: [string, string][], wires: Wire[]): Graph => ({
  format: 1,
  props: [],
  nodes: nodes.map(([id, type]) => newNode(type, { x: 0, y: 0 }, id)),
  wires,
});

test("dissolving reconnects every consumer and preserves unrelated wires", () => {
  const start = graph(
    [
      ["a", "source"],
      ["b", "pass"],
      ["c", "sink"],
      ["d", "sink"],
      ["e", "sink"],
    ],
    [
      wire("ab", "a", "b"),
      wire("bc", "b", "c"),
      wire("bd", "b", "d"),
      wire("ae", "a", "e"),
    ],
  );
  const done = dissolveNodes(start, new Set(["b"]), known);
  expect(done.nodes.map((node) => node.id)).toEqual(["a", "c", "d", "e"]);
  expect(done.wires).toEqual([
    wire("ae", "a", "e"),
    wire("bc", "a", "c"),
    wire("bd", "a", "d"),
  ]);
  expect(start.wires[1]?.from.node).toBe("b");
});

test("dissolving a whole chain reconnects to a surviving source regardless of selection order", () => {
  const start = graph(
    [
      ["a", "source"],
      ["b", "pass"],
      ["c", "pass"],
      ["d", "sink"],
    ],
    [wire("ab", "a", "b"), wire("bc", "b", "c"), wire("cd", "c", "d")],
  );
  for (const ids of [
    ["b", "c"],
    ["c", "b"],
  ]) {
    expect(dissolveNodes(start, new Set(ids), known).wires).toEqual([
      wire("cd", "a", "d"),
    ]);
  }
});

test("incompatible upstream types are removed without inventing an invalid connection", () => {
  const start = graph(
    [
      ["a", "numeric"],
      ["b", "convert"],
      ["c", "sink"],
    ],
    [wire("ab", "a", "b"), wire("bc", "b", "c")],
  );
  expect(dissolveNodes(start, new Set(["b"]), known).wires).toEqual([]);
});

test("dissolve supports element-to-slot connections", () => {
  const start = graph(
    [
      ["a", "element"],
      ["b", "wrapper"],
      ["c", "render"],
    ],
    [
      wire("ab", "a", "b", "element", "child"),
      wire("bc", "b", "c", "element", "render"),
    ],
  );
  expect(dissolveNodes(start, new Set(["b"]), known).wires).toEqual([
    wire("bc", "a", "c", "element", "render"),
  ]);
});

test("multiple inputs prefer the output's type over a control input, in socket order", () => {
  const start = graph(
    [
      ["flag", "boolean"],
      ["a", "source"],
      ["b", "source"],
      ["s", "switch"],
      ["c", "any"],
    ],
    [
      wire("false", "b", "s", "value", "false"),
      wire("condition", "flag", "s", "value", "condition"),
      wire("true", "a", "s", "value", "true"),
      wire("out", "s", "c", "result"),
    ],
  );
  expect(dissolveNodes(start, new Set(["s"]), known).wires).toEqual([
    wire("out", "a", "c"),
  ]);
});

test("socket name matches take precedence over another compatible input", () => {
  const custom = type("pair", { other: text, value: text }, { value: text });
  const context = {
    ...known,
    nodeTypes: new Map([...known.nodeTypes, [custom.type, custom]]),
  };
  const start = graph(
    [
      ["a", "source"],
      ["b", "source"],
      ["p", "pair"],
      ["c", "sink"],
    ],
    [
      wire("other", "a", "p", "value", "other"),
      wire("value", "b", "p"),
      wire("out", "p", "c"),
    ],
  );
  expect(dissolveNodes(start, new Set(["p"]), context).wires).toEqual([
    wire("out", "b", "c"),
  ]);
});

test("evaluated dynamic inputs, exposed properties and group rows can be bypassed", () => {
  for (const socket of ["dynamic", "exposed", "children/r1"]) {
    const sockets: NodeSockets = {
      inputs: [{ id: "dynamic", label: "Dynamic", type: text, default: null }],
      outputs: [{ id: "value", label: "Value", type: text }],
      groups: [{ id: "children", label: "Children", type: text, before: null }],
    };
    const custom = {
      ...type("custom", {}, { value: text }),
      properties: [
        {
          id: "exposed",
          label: "Exposed",
          type: text,
          default: "",
          on_node: false,
        },
      ],
    };
    const start = graph(
      [
        ["a", "source"],
        ["b", "custom"],
        ["c", "sink"],
      ],
      [wire("ab", "a", "b", "value", socket), wire("bc", "b", "c")],
    );
    const node = start.nodes[1];
    if (node) {
      node.exposed = ["exposed"];
      node.groups = { children: ["r1"] };
    }
    const context: Known = {
      nodeTypes: new Map([...known.nodeTypes, ["custom", custom]]),
      evaluated: new Map([
        ["b", { sockets, outputs: {}, error: null, skipped: false }],
      ]),
    };
    expect(dissolveNodes(start, new Set(["b"]), context).wires).toEqual([
      wire("bc", "a", "c"),
    ]);
  }
});

test("refused links are not reused and cyclic input chains terminate", () => {
  const start = graph(
    [
      ["a", "source"],
      ["b", "pass"],
      ["c", "sink"],
    ],
    [wire("ab", "a", "b"), wire("bc", "b", "c")],
  );
  expect(
    dissolveNodes(start, new Set(["b"]), known, new Set(["ab"])).wires,
  ).toEqual([]);
  expect(
    dissolveNodes(start, new Set(["b"]), known, new Set(["bc"])).wires,
  ).toEqual([]);
  const cycle = graph(
    [
      ["a", "pass"],
      ["b", "pass"],
      ["c", "sink"],
    ],
    [wire("ab", "a", "b"), wire("reverse", "b", "a"), wire("bc", "b", "c")],
  );
  expect(dissolveNodes(cycle, new Set(["a", "b"]), known).wires).toEqual([]);
});

test("dissolve never creates self connections or closes a surviving cycle", () => {
  const start = graph(
    [
      ["a", "pass"],
      ["b", "pass"],
      ["c", "pass"],
    ],
    [
      wire("ab", "a", "b"),
      wire("reverse", "b", "a"),
      wire("bc", "b", "c"),
      wire("ca", "c", "a"),
    ],
  );
  expect(dissolveNodes(start, new Set(["b"]), known).wires).toEqual([
    wire("ca", "c", "a"),
  ]);
});

test("empty selections are no-ops and source nodes fall back to deletion", () => {
  const start = graph(
    [
      ["a", "source"],
      ["c", "sink"],
    ],
    [wire("ac", "a", "c")],
  );
  expect(dissolveNodes(start, new Set(), known)).toBe(start);
  expect(dissolveNodes(start, new Set(["a"]), known).wires).toEqual([]);
});
