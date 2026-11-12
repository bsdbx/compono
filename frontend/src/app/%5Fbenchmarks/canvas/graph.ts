import type { Edge, Node } from "@xyflow/react";

/** What a socket carries, which sets its colour. */
export type SocketKind = "element" | "tag" | "text" | "boolean" | "number";

/** The colours of the design's sockets, until the theme (#37) defines them. */
export const SOCKET_COLOR: Record<SocketKind, string> = {
  element: "#8b93f0",
  tag: "#b7a6f5",
  text: "#7ab8f5",
  boolean: "#f0a6ca",
  number: "#a1a1aa",
};

/** A row of a node: an output, an input, or an input with a value typed into it. */
export type Row =
  | { type: "output"; label: string; kind: SocketKind }
  | { type: "input"; label: string; kind: SocketKind }
  | { type: "field"; label: string; value: string; kind: SocketKind }
  | { type: "select"; value: string; kind: SocketKind };

export type BenchmarkNodeData = { title: string; rows: Row[] };
export type BenchmarkNode = Node<BenchmarkNodeData, "benchmark">;

/** The nodes of the design's PricingCard graph, which the benchmark repeats. */
const SHAPES: BenchmarkNodeData[] = [
  {
    title: "Element",
    rows: [
      { type: "output", label: "Element", kind: "element" },
      { type: "select", value: "span", kind: "tag" },
      { type: "input", label: "Text", kind: "text" },
      { type: "field", label: "Class name", value: "badge", kind: "text" },
    ],
  },
  {
    title: "Switch",
    rows: [
      { type: "output", label: "Result", kind: "element" },
      { type: "input", label: "Condition", kind: "boolean" },
      { type: "input", label: "True", kind: "element" },
      { type: "input", label: "False", kind: "element" },
    ],
  },
  {
    title: "Template",
    rows: [
      { type: "output", label: "Text", kind: "text" },
      { type: "input", label: "price", kind: "number" },
      { type: "input", label: "period", kind: "text" },
    ],
  },
  {
    title: "Element",
    rows: [
      { type: "output", label: "Element", kind: "element" },
      { type: "select", value: "div", kind: "tag" },
      { type: "input", label: "1  Switch", kind: "element" },
      { type: "input", label: "2  h3", kind: "element" },
      { type: "input", label: "3  p", kind: "element" },
      { type: "input", label: "4  a", kind: "element" },
      { type: "field", label: "Class name", value: "card", kind: "text" },
    ],
  },
];

/** The distance between the nodes of the grid. Nodes are 190 px wide, and the tallest is 243 px high. */
export const COLUMN_WIDTH = 260;
export const ROW_HEIGHT = 280;

/** Below this zoom, a node's 13 px text is under 7 px high, too small to read. */
export const SIMPLE_BELOW_ZOOM = 0.5;

/** The id of a row's handle, which a wire connects to. */
export function handleId(row: Row, index: number): string {
  return `${row.type === "output" ? "out" : "in"}-${index}`;
}

export type BenchmarkGraph = {
  nodes: BenchmarkNode[];
  edges: Edge[];
  columns: number;
  rows: number;
};

/** The id of the node in a column and row of the grid. */
export function nodeAt(graph: BenchmarkGraph, column: number, row: number) {
  return `n${row * graph.columns + column}`;
}

/**
 * A grid of nodes, twice as wide as it's high. Each node's inputs are wired to the outputs
 * of the column before it: the first input from the same row, the second from the row below.
 */
export function benchmarkGraph(count: number): BenchmarkGraph {
  const columns = Math.ceil(Math.sqrt(count * 2));
  const rows = Math.ceil(count / columns);
  const graph: BenchmarkGraph = { nodes: [], edges: [], columns, rows };

  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    graph.nodes.push({
      id: nodeAt(graph, column, row),
      type: "benchmark",
      position: { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT },
      data: SHAPES[index % SHAPES.length] as BenchmarkNodeData,
    });
  }

  graph.nodes.forEach((target, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    if (column === 0) {
      return;
    }
    const inputs = target.data.rows
      .map((input, rowIndex) => ({ input, id: handleId(input, rowIndex) }))
      .filter(({ input }) => input.type === "input")
      .slice(0, 2);

    inputs.forEach(({ id }, offset) => {
      // The last row can be short, so the row below may have no node to the left
      const source =
        graph.nodes[((row + offset) % rows) * columns + column - 1];
      const output = source?.data.rows[0];
      if (source === undefined || output === undefined) {
        return;
      }
      graph.edges.push({
        id: `${source.id}-${target.id}-${id}`,
        source: source.id,
        sourceHandle: handleId(output, 0),
        target: target.id,
        targetHandle: id,
        style: { stroke: SOCKET_COLOR[output.kind], strokeWidth: 1.5 },
      });
    });
  });

  return graph;
}
