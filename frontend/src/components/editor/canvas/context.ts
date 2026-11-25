import { createContext, use } from "react";
import type {
  EvaluatedNode,
  InputSocket,
  NodeSockets,
  NodeTypeInfo,
  Wire,
} from "@/api/types";
import {
  type Graph,
  type GraphNode,
  groupDrop,
  groupPropertyId,
  type SocketType,
} from "./graph";
import type { NodeMatch } from "./node-find";
import type { NodeSize } from "./node-size";
import type { SnapGuide } from "./node-snap";

export type ResizePreview = NodeSize & { guides?: readonly SnapGuide[] };

/** A menu opened at the pointer, with what it's for. */
export type Menu =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "node"; x: number; y: number; node: string };

export type CanvasState = {
  graph: Graph;
  nodeTypes: ReadonlyMap<string, NodeTypeInfo>;
  /** The API's word on each node, once it's evaluated */
  evaluated: ReadonlyMap<string, EvaluatedNode>;
  /** Wires the evaluator refused */
  refused: ReadonlySet<string>;
  /** Changes the graph. Changes with one key in a row undo together, like typing in a field */
  edit: (change: (graph: Graph) => Graph, key?: string) => void;
  openMenu: (menu: Menu) => void;
  renaming: string | undefined;
  startRename: (node: string) => void;
  finishRename: () => void;
  find?: { query: string; active: NodeMatch | undefined } | undefined;
  /** Preview a resize, commit it once, or cancel it with undefined. */
  resizeNode: (
    node: string,
    size: ResizePreview | undefined,
    commit?: boolean,
  ) => void;
  /** The wire temporarily picked up from its input; its graph entry stays until the drop commits. */
  rewiring?: Wire | undefined;
};

export const CanvasContext = createContext<CanvasState | null>(null);

export function useCanvas(): CanvasState {
  const canvas = use(CanvasContext);
  if (canvas === null) {
    throw new Error("useCanvas needs a CanvasContext around it.");
  }
  return canvas;
}

/** A node's sockets: as the API last worked them out, or as a new node of its type has them. */
export function socketsOf(
  canvas: Pick<CanvasState, "evaluated" | "nodeTypes">,
  id: string,
  type: string,
): NodeSockets {
  return (
    canvas.evaluated.get(id)?.sockets ??
    canvas.nodeTypes.get(type)?.sockets ?? {
      inputs: [],
      groups: [],
      outputs: [],
    }
  );
}

export type Known = Pick<CanvasState, "evaluated" | "nodeTypes">;

/** The node type's own inputs, including those moved into the properties panel. */
export function defaultInputsOf(canvas: Known, node: GraphNode): InputSocket[] {
  const properties = canvas.nodeTypes.get(node.type)?.properties ?? [];
  return socketsOf(canvas, node.id, node.type).inputs.filter(
    (input) => !properties.some((property) => property.id === input.id),
  );
}

/** A node's visible inputs, followed by its exposed properties. */
export function inputsOf(
  canvas: Known,
  node: GraphNode,
  includeHidden = false,
): InputSocket[] {
  const properties = canvas.nodeTypes.get(node.type)?.properties ?? [];
  const own = defaultInputsOf(canvas, node).filter(
    (input) => includeHidden || !node.unexposed?.includes(input.id),
  );
  const exposed = properties
    .filter((property) => node.exposed.includes(property.id))
    .map((property) => ({
      id: property.id,
      label: property.label,
      type: property.type,
      default: node.properties[property.id] ?? property.default,
    }));
  return [...own, ...exposed];
}

/** The current type of an input, including exposed properties and existing group rows. */
export function inputType(
  graph: Graph,
  known: Known,
  node: string,
  socket: string,
): SocketType | undefined {
  const into = graph.nodes.find((each) => each.id === node);
  if (into === undefined) return undefined;
  const sockets = socketsOf(known, into.id, into.type);
  const group = socket.split("/")[0] ?? "";
  if (socket.includes("/") && into.unexposed?.includes(groupPropertyId(group)))
    return undefined;
  const drop = groupDrop(socket);
  if (drop) return sockets.groups.find((each) => each.id === drop.group)?.type;
  return (
    inputsOf(known, into).find((each) => each.id === socket)?.type ??
    (socket.includes("/") &&
    (into.groups[group] ?? []).includes(socket.slice(group.length + 1))
      ? sockets.groups.find((each) => each.id === group)?.type
      : undefined)
  );
}

export function outputType(
  graph: Graph,
  known: Known,
  node: string,
  socket: string,
): SocketType | undefined {
  const from = graph.nodes.find((each) => each.id === node);
  return from
    ? socketsOf(known, from.id, from.type).outputs.find(
        (each) => each.id === socket,
      )?.type
    : undefined;
}

/** The options a Choice node offers: those of the inputs it's wired into. */
export function choiceOptions(
  canvas: Known & Pick<CanvasState, "graph">,
  node: string,
): string[] {
  const options = canvas.graph.wires
    .filter((wire) => wire.from.node === node)
    .flatMap((wire) => {
      const into = canvas.graph.nodes.find((each) => each.id === wire.to.node);
      const input =
        into &&
        inputsOf(canvas, into).find((each) => each.id === wire.to.socket);
      return input?.type.kind === "choice" ? input.type.options : [];
    });
  return [...new Set(options)];
}
