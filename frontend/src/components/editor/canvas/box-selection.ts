import type { ReactFlowInstance } from "@xyflow/react";
import {
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
  useRef,
  useState,
} from "react";
import type { CanvasNode } from "./node-view";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };

/** Modified box gestures preserve their starting selection; ordinary clicks and boxes stay with React Flow. */
export function useBoxSelection(
  flow: ReactFlowInstance<CanvasNode>,
  wrapper: RefObject<HTMLDivElement | null>,
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>,
  setWires: Dispatch<SetStateAction<ReadonlySet<string>>>,
) {
  const [box, setBox] = useState<Box>();
  const gesture = useRef<{
    start: Point;
    nodes: Set<string>;
    wires: Set<string>;
    subtract: boolean;
    moved: boolean;
  }>(undefined);
  const suppressClick = useRef(false);

  function end(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return;
    event.stopPropagation();
    suppressClick.current = current.moved;
    gesture.current = undefined;
    setBox(undefined);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    box,
    handlers: {
      onPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
        suppressClick.current = false;
        if (
          event.button !== 0 ||
          !(event.shiftKey || event.ctrlKey) ||
          !(event.target instanceof Element) ||
          !event.target.classList.contains("react-flow__pane")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        gesture.current = {
          start: { x: event.clientX, y: event.clientY },
          nodes: new Set(
            flow
              .getNodes()
              .filter((node) => node.selected)
              .map((node) => node.id),
          ),
          wires: new Set(
            flow
              .getEdges()
              .filter((edge) => edge.selected)
              .map((edge) => edge.id),
          ),
          subtract: event.ctrlKey,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onMouseDownCapture(event: React.MouseEvent<HTMLDivElement>) {
        if (gesture.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
        const current = gesture.current;
        const bounds = wrapper.current?.getBoundingClientRect();
        if (!current || !bounds) return;
        event.stopPropagation();
        if (
          !current.moved &&
          Math.hypot(
            event.clientX - current.start.x,
            event.clientY - current.start.y,
          ) < 3
        )
          return;
        current.moved = true;
        const start = flow.screenToFlowPosition(current.start);
        const end = flow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        const hits = new Set(
          flow
            .getIntersectingNodes(
              {
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: Math.abs(start.x - end.x),
                height: Math.abs(start.y - end.y),
              },
              true,
            )
            .filter((node) => node.selectable !== false)
            .map((node) => node.id),
        );
        setNodes((nodes) =>
          nodes.map((node) => ({
            ...node,
            selected: current.subtract
              ? current.nodes.has(node.id) && !hits.has(node.id)
              : current.nodes.has(node.id) || hits.has(node.id),
          })),
        );
        setWires(
          new Set(
            flow
              .getEdges()
              .filter((edge) => {
                const hit = hits.has(edge.source) || hits.has(edge.target);
                return current.subtract
                  ? current.wires.has(edge.id) && !hit
                  : current.wires.has(edge.id) || hit;
              })
              .map((edge) => edge.id),
          ),
        );
        setBox({
          x: Math.min(current.start.x, event.clientX) - bounds.left,
          y: Math.min(current.start.y, event.clientY) - bounds.top,
          width: Math.abs(event.clientX - current.start.x),
          height: Math.abs(event.clientY - current.start.y),
        });
      },
      onPointerUpCapture: end,
      onPointerCancelCapture: end,
      onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
        if (suppressClick.current) {
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
    },
  };
}
