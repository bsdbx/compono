import type { Wire } from "@/api/types";
import { accepts } from "./accepts";
import {
  inputsOf,
  inputType,
  type Known,
  outputType,
  socketsOf,
} from "./context";
import { type Graph, removeNodes, type SocketType } from "./graph";

/** Removes a selection, reconnecting its surviving consumers to compatible upstream outputs. */
export function dissolveNodes(
  graph: Graph,
  ids: ReadonlySet<string>,
  known: Known,
  refused: ReadonlySet<string> = new Set(),
): Graph {
  if (!graph.nodes.some((node) => ids.has(node.id))) return graph;
  let next = removeNodes(graph, ids);
  const incoming = new Map<string, Wire[]>();
  for (const wire of graph.wires) {
    if (ids.has(wire.to.node) && !refused.has(wire.id)) {
      const wires = incoming.get(wire.to.node) ?? [];
      wires.push(wire);
      incoming.set(wire.to.node, wires);
    }
  }

  function upstream(
    from: Wire["from"],
    into: SocketType,
    visited: ReadonlySet<string>,
  ): Wire["from"] | undefined {
    const out = outputType(graph, known, from.node, from.socket);
    if (!ids.has(from.node))
      return out && accepts(into, out) ? from : undefined;
    if (visited.has(from.node)) return undefined;
    const node = graph.nodes.find((node) => node.id === from.node);
    if (!node) return undefined;
    const sockets = socketsOf(known, node.id, node.type);
    const order = [
      ...inputsOf(known, node).map((input) => input.id),
      ...sockets.groups.flatMap((group) =>
        (node.groups[group.id] ?? []).map((row) => `${group.id}/${row}`),
      ),
    ];
    const named = (wire: Wire) => Number(wire.to.socket !== from.socket);
    const typed = (wire: Wire) =>
      Number(
        inputType(graph, known, wire.to.node, wire.to.socket)?.kind !==
          out?.kind,
      );
    const candidates = (incoming.get(from.node) ?? []).toSorted(
      (a, b) =>
        named(a) - named(b) ||
        typed(a) - typed(b) ||
        order.indexOf(a.to.socket) - order.indexOf(b.to.socket),
    );
    for (const wire of candidates) {
      const input = inputType(graph, known, wire.to.node, wire.to.socket);
      const output = outputType(graph, known, wire.from.node, wire.from.socket);
      if (
        !input ||
        !output ||
        !accepts(input, output) ||
        (out && !accepts(out, output))
      )
        continue;
      const source = upstream(
        wire.from,
        into,
        new Set([...visited, from.node]),
      );
      if (source) return source;
    }
    return undefined;
  }

  function cyclic(from: string, to: string): boolean {
    const pending = [to];
    const visited = new Set<string>();
    while (pending.length) {
      const node = pending.pop() as string;
      if (node === from) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      pending.push(
        ...next.wires
          .filter((wire) => !refused.has(wire.id) && wire.from.node === node)
          .map((wire) => wire.to.node),
      );
    }
    return false;
  }

  for (const wire of graph.wires) {
    if (
      !ids.has(wire.from.node) ||
      ids.has(wire.to.node) ||
      refused.has(wire.id)
    )
      continue;
    const into = inputType(graph, known, wire.to.node, wire.to.socket);
    const from = into && upstream(wire.from, into, new Set());
    if (from && !cyclic(from.node, wire.to.node)) {
      next = { ...next, wires: [...next.wires, { ...wire, from }] };
    }
  }
  return next;
}
