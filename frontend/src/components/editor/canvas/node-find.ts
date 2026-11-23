import type { NodeTypeInfo } from "@/api/types";
import { textMatches } from "@/lib/text-matches";
import { type Graph, type GraphNode, renameNodes } from "./graph";
import { nodeName } from "./node-size";

type NodeTypes = ReadonlyMap<string, NodeTypeInfo>;

export type NodeMatch = { node: string; start: number; end: number };

export function findNodes(
  nodes: readonly GraphNode[],
  types: NodeTypes,
  query: string,
): NodeMatch[] {
  if (!query) return [];
  return nodes.flatMap((node) =>
    textMatches(
      nodeName(node.name ?? types.get(node.type)?.name ?? node.type),
      query,
    ).map((range) => ({ node: node.id, ...range })),
  );
}

/** Change the matched text within each name. The result is one graph edit. */
export function renameMatches(
  graph: Graph,
  types: NodeTypes,
  query: string,
  replacement: string,
  current?: NodeMatch,
) {
  const names = new Map<string, string>();
  let resumeAt = 0;
  for (const node of graph.nodes) {
    if (current && current.node !== node.id) continue;
    const fallback = nodeName(types.get(node.type)?.name ?? node.type);
    const name = nodeName(node.name ?? fallback);
    const matches = textMatches(name, query).filter(
      ({ start, end }) =>
        !current || (start === current.start && end === current.end),
    );
    if (!matches.length) continue;
    let next = "",
      offset = 0;
    for (const { start, end } of matches) {
      next += name.slice(offset, start) + replacement;
      offset = end;
    }
    const label = nodeName(next + name.slice(offset));
    if (current) resumeAt = label ? nodeName(next).length : fallback.length;
    if (label !== name) names.set(node.id, label === fallback ? "" : label);
  }
  const next = renameNodes(graph, names);
  if (!current) return { graph: next, index: 0 };

  // Skip matches in the inserted text and continue in graph order.
  const order = new Map(next.nodes.map((node, index) => [node.id, index]));
  const renamedAt = order.get(current.node) ?? -1;
  const index = findNodes(next.nodes, types, query).findIndex((match) =>
    match.node === current.node
      ? match.start >= resumeAt
      : (order.get(match.node) ?? -1) > renamedAt,
  );
  return { graph: next, index: Math.max(0, index) };
}
