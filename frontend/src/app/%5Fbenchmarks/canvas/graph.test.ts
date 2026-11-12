import { expect, test } from "vitest";
import {
  type BenchmarkGraph,
  benchmarkGraph,
  COLUMN_WIDTH,
  handleId,
  nodeAt,
  ROW_HEIGHT,
} from "./graph";

function nodeById(graph: BenchmarkGraph) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function handlesOf(graph: BenchmarkGraph, id: string) {
  return (
    nodeById(graph)
      .get(id)
      ?.data.rows.map((row, index) => ({
        type: row.type,
        id: handleId(row, index),
      })) ?? []
  );
}

test.each([200, 300, 400])(
  "a graph of %i nodes fills a grid wider than it's high",
  (count) => {
    const graph = benchmarkGraph(count);

    expect(graph.nodes).toHaveLength(count);
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(count);
    expect(graph.columns).toBeGreaterThan(graph.rows);
    // Only the last row can be short
    expect(graph.columns * graph.rows).toBeGreaterThanOrEqual(count);
    expect(graph.columns * (graph.rows - 1)).toBeLessThan(count);
  },
);

test("a node's id gives its place in the grid", () => {
  const graph = benchmarkGraph(200);
  const nodes = nodeById(graph);

  for (const [column, row] of [
    [0, 0],
    [3, 0],
    [0, 4],
    [graph.columns - 1, graph.rows - 1],
  ] as const) {
    expect(nodes.get(nodeAt(graph, column, row))?.position).toEqual({
      x: column * COLUMN_WIDTH,
      y: row * ROW_HEIGHT,
    });
  }
});

test("every wire goes from an output to an input in the next column", () => {
  const graph = benchmarkGraph(200);
  const nodes = nodeById(graph);

  for (const edge of graph.edges) {
    expect(handlesOf(graph, edge.source)).toContainEqual({
      type: "output",
      id: edge.sourceHandle,
    });
    expect(handlesOf(graph, edge.target)).toContainEqual({
      type: "input",
      id: edge.targetHandle,
    });
    const source = nodes.get(edge.source)?.position.x ?? Number.NaN;
    const target = nodes.get(edge.target)?.position.x ?? Number.NaN;
    expect(target - source).toBe(COLUMN_WIDTH);
  }
});

test("an input has one wire at most, and every node after the first column has one", () => {
  const graph = benchmarkGraph(200);
  const inputs = graph.edges.map(
    (edge) => `${edge.target} ${edge.targetHandle}`,
  );
  const wired = new Set(graph.edges.map((edge) => edge.target));

  expect(new Set(inputs).size).toBe(inputs.length);
  for (const node of graph.nodes) {
    expect(wired.has(node.id)).toBe(node.position.x > 0);
  }
});

test("the graph is the same every time, with 1.7 wires a node", () => {
  const graph = benchmarkGraph(200);

  expect(benchmarkGraph(200)).toEqual(graph);
  expect(graph.edges).toHaveLength(340);
});
