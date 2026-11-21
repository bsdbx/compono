import type { OnNodeDrag, ReactFlowInstance } from "@xyflow/react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { XY } from "./graph";
import { type SnapGuide, snapPositions } from "./node-snap";
import type { CanvasNode } from "./node-view";

function positionsOf(nodes: readonly CanvasNode[]) {
  return new Map(nodes.map((node) => [node.id, node.position]));
}

export function useNodeSnapping(
  flow: ReactFlowInstance<CanvasNode>,
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>,
) {
  // React Flow supplies the raw drag position even when we display a snapped preview.
  const drag = useRef<{ nodes: CanvasNode[]; snapping: boolean }>(undefined);
  const [guides, setGuides] = useState<readonly SnapGuide[]>([]);

  const show = useCallback(
    (positions: ReadonlyMap<string, XY>) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, position } : node;
        }),
      );
    },
    [setNodes],
  );

  const preview = useCallback(
    (snapping: boolean) => {
      const current = drag.current;
      if (!current || (!snapping && !current.snapping)) return;
      current.snapping = snapping;
      const raw = positionsOf(current.nodes);
      const snapped = snapping ? snapPositions(flow, raw) : undefined;
      show(snapped?.positions ?? raw);
      setGuides(snapped?.guides ?? []);
    },
    [flow, show],
  );

  useEffect(() => {
    function modifier(event: KeyboardEvent) {
      if (event.key === "Control") preview(event.ctrlKey);
    }
    const blur = () => preview(false);
    window.addEventListener("keydown", modifier);
    window.addEventListener("keyup", modifier);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", modifier);
      window.removeEventListener("keyup", modifier);
      window.removeEventListener("blur", blur);
    };
  }, [preview]);

  const start: OnNodeDrag<CanvasNode> = (_, __, nodes) => {
    drag.current = { nodes, snapping: false };
  };
  const move: OnNodeDrag<CanvasNode> = (event, _, nodes) => {
    if (drag.current) drag.current.nodes = nodes;
    preview(event.ctrlKey);
  };

  function finish(event: MouseEvent | TouchEvent, moved: CanvasNode[]) {
    drag.current = undefined;
    setGuides([]);
    const raw = positionsOf(moved);
    if (event.ctrlKey) {
      const { positions } = snapPositions(flow, raw);
      show(positions);
      return positions;
    }
    return new Map(
      [...raw].map(([id, { x, y }]) => [
        id,
        { x: Math.round(x), y: Math.round(y) },
      ]),
    );
  }

  return { guides, start, move, finish };
}
