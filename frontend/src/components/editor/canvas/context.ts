import { createContext, use } from "react";
import type {
  EvaluatedNode,
  InputSocket,
  NodeSockets,
  NodeTypeInfo,
} from "@/api/types.gen";
import type { Graph, GraphNode } from "./graph";

/** A menu opened at the pointer, with what it's for. */
export type Menu =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "node"; x: number; y: number; node: string }
  | {
      kind: "row";
      x: number;
      y: number;
      node: string;
      group: string;
      row: string;
    };

export type CanvasState = {
  graph: Graph;
  nodeTypes: ReadonlyMap<string, NodeTypeInfo>;
  /** The API's word on each node, once it's evaluated */
  evaluated: ReadonlyMap<string, EvaluatedNode>;
  /** Wires the API refused, or whose types don't fit */
  refused: ReadonlySet<string>;
  /** Changes the graph. Changes with one key in a row undo together, like typing in a field */
  edit: (change: (graph: Graph) => Graph, key?: string) => void;
  openMenu: (menu: Menu) => void;
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

type Known = Pick<CanvasState, "evaluated" | "nodeTypes">;

/** A node's inputs: its own, then its exposed properties, as the graph has them before the API says so. */
export function inputsOf(canvas: Known, node: GraphNode): InputSocket[] {
  const properties = canvas.nodeTypes.get(node.type)?.properties ?? [];
  const own = socketsOf(canvas, node.id, node.type).inputs.filter(
    (input) => !properties.some((property) => property.id === input.id),
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
