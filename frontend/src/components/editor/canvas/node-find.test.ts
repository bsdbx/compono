import { expect, test } from "vitest";
import { type Graph, newNode } from "./graph";
import { findNodes, renameMatches } from "./node-find";

test("find and rename treat punctuation and replacement text literally", () => {
  const graph: Graph = {
    format: 1,
    props: [],
    nodes: [
      { ...newNode("pass", { x: 0, y: 0 }, "first"), name: "A.B ab a.b" },
    ],
    wires: [],
  };
  const types = new Map();
  const matches = findNodes(graph.nodes, types, "a.b");
  expect(matches).toEqual([
    { node: "first", start: 0, end: 3 },
    { node: "first", start: 7, end: 10 },
  ]);
  const one = renameMatches(graph, types, "a.b", "A.B $&", matches[0]);
  expect(one.graph.nodes[0]?.name).toBe("A.B $& ab a.b");
  expect(one.index).toBe(1);
  const all = renameMatches(graph, types, "a.b", "$&");
  expect(all.graph.nodes[0]?.name).toBe("$& ab $&");
});
