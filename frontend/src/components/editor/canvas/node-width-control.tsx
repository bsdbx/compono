import { useReactFlow, useStore } from "@xyflow/react";
import { type RefObject, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ResizePreview, useCanvas } from "./context";
import type { GraphNode } from "./graph";
import {
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  type NodeSize,
  type ResizeSide,
  resizedNode,
} from "./node-size";
import { alignmentTargets, snapResize } from "./node-snap";
import type { CanvasNode } from "./node-view";

/** An invisible side border: one horizontal resize, with Escape to cancel. */
export function NodeWidthControl({
  node,
  side,
  element,
  width,
}: {
  node: GraphNode;
  side: ResizeSide;
  element: RefObject<HTMLDivElement | null>;
  width: number;
}) {
  const canvas = useCanvas();
  const flow = useReactFlow<CanvasNode>();
  const zoom = useStore((state) => state.transform[2]);
  const drag = useRef<{
    pointer: number;
    x: number;
    lastX?: number;
    zoom: number;
    start: NodeSize;
    next: ResizePreview;
  }>(undefined);
  const [dragging, setDragging] = useState(false);

  function preview(clientX: number, snapping: boolean) {
    const current = drag.current;
    if (!current || (current.lastX === undefined && clientX === current.x))
      return;
    current.lastX = clientX;
    const delta = (clientX - current.x) / current.zoom;
    if (snapping) {
      const { size, guides } = snapResize(
        current.start,
        side,
        delta,
        element.current?.offsetHeight ?? 0,
        alignmentTargets(flow, new Set([node.id])),
        flow.getZoom(),
      );
      current.next = { ...size, guides };
    } else {
      current.next = resizedNode(current.start, side, delta);
    }
    canvas.resizeNode(node.id, current.next);
  }

  function finish(control: HTMLElement, commit: boolean) {
    const current = drag.current;
    if (!current) return;
    drag.current = undefined;
    setDragging(false);
    const moved =
      current.next.width !== current.start.width ||
      current.next.position.x !== current.start.position.x;
    canvas.resizeNode(
      node.id,
      commit && moved ? current.next : undefined,
      commit && moved,
    );
    if (control.hasPointerCapture?.(current.pointer))
      control.releasePointerCapture(current.pointer);
  }

  return (
    <>
      <hr
        aria-label={`Resize node width from ${side}`}
        aria-orientation="vertical"
        aria-valuemin={NODE_MIN_WIDTH}
        aria-valuemax={NODE_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        data-node-resize={side}
        style={{ width: 6 / zoom }}
        className={`nodrag nopan absolute inset-y-0 z-5 m-0 h-full w-1.5 cursor-ew-resize touch-none border-0 bg-transparent outline-none ${side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          const start = {
            width: element.current?.offsetWidth ?? node.width ?? NODE_MIN_WIDTH,
            position: { ...node.position },
          };
          drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            zoom: flow.getZoom(),
            start,
            next: start,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          canvas.resizeNode(node.id, start);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || event.pointerId !== current.pointer) return;
          event.preventDefault();
          event.stopPropagation();
          preview(event.clientX, event.ctrlKey);
        }}
        onPointerUp={(event) => {
          if (event.pointerId !== drag.current?.pointer) return;
          event.preventDefault();
          event.stopPropagation();
          preview(event.clientX, event.ctrlKey);
          finish(event.currentTarget, true);
        }}
        onPointerCancel={(event) => finish(event.currentTarget, false)}
        onLostPointerCapture={(event) => finish(event.currentTarget, false)}
        onKeyUp={(event) => {
          if (event.key === "Control" && drag.current?.lastX !== undefined)
            preview(drag.current.lastX, event.ctrlKey);
        }}
        onKeyDown={(event) => {
          if (
            drag.current &&
            event.key === "Control" &&
            drag.current.lastX !== undefined
          ) {
            preview(drag.current.lastX, event.ctrlKey);
          } else if (event.key === "Escape" && drag.current) {
            event.preventDefault();
            event.stopPropagation();
            finish(event.currentTarget, false);
          } else if (
            !drag.current &&
            ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
          ) {
            event.preventDefault();
            event.stopPropagation();
            const start = {
              width:
                element.current?.offsetWidth ?? node.width ?? NODE_MIN_WIDTH,
              position: node.position,
            };
            const direction = side === "left" ? -1 : 1;
            const delta =
              event.key === "Home"
                ? (NODE_MIN_WIDTH - start.width) * direction
                : event.key === "End"
                  ? (NODE_MAX_WIDTH - start.width) * direction
                  : (event.key === "ArrowRight" ? 1 : -1) *
                    (event.shiftKey ? 40 : 10);
            canvas.resizeNode(node.id, resizedNode(start, side, delta), true);
          }
        }}
      />
      {dragging
        ? createPortal(
            <div
              aria-hidden
              className="fixed inset-0 z-100 cursor-ew-resize select-none"
            />,
            document.body,
          )
        : null}
    </>
  );
}
