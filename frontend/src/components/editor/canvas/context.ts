import { createContext, use } from "react";
import type { EvaluatedNode, NodeSockets, NodeTypeInfo } from "@/api/types.gen";
import type { Graph } from "./graph";

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
