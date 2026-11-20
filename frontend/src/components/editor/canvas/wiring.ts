import type { Connection } from "@xyflow/react";
import type { Wire } from "@/api/types";
import { addRow, type Graph } from "./graph";

/** React Flow IDs include direction; stored socket IDs remain unchanged. */
export const flowHandle = (type: "source" | "target", socket: string) =>
  `${type}:${socket}`;
export function graphHandle(id: string | null | undefined) {
  if (id?.startsWith("source:"))
    return { type: "source" as const, socket: id.slice(7) };
  if (id?.startsWith("target:"))
    return { type: "target" as const, socket: id.slice(7) };
  return undefined;
}

/** Picking up a connected input keeps its original output; only its destination moves. */
export function connectionEnds(
  connection: Pick<Connection, "source" | "target"> &
    Partial<Pick<Connection, "sourceHandle" | "targetHandle">>,
  picked?: Wire,
) {
  const source = graphHandle(connection.sourceHandle),
    target = graphHandle(connection.targetHandle);
  if (picked) {
    return source?.type === "target" && target?.type === "target"
      ? {
          from: picked.from,
          to: { node: connection.source, socket: source.socket },
        }
      : undefined;
  }
  return source?.type === "source" && target?.type === "target"
    ? {
        from: { node: connection.source, socket: source.socket },
        to: { node: connection.target, socket: target.socket },
      }
    : undefined;
}

/** An occupied group attachment appends a new item; empty rows and ordinary inputs keep their position. */
export function groupDestination(graph: Graph, to: Wire["to"]) {
  const [group, row] = to.socket.split("/");
  return group &&
    row &&
    graph.nodes
      .find((node) => node.id === to.node)
      ?.groups[group]?.includes(row) &&
    graph.wires.some(
      (wire) => wire.to.node === to.node && wire.to.socket === to.socket,
    )
    ? { node: to.node, socket: addRow(group) }
    : to;
}
