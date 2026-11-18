import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** A panel divider, draggable by pointer and adjustable with arrows, Home and End. */
export function ResizeHandle({
  label,
  axis,
  value,
  min,
  max,
  collapsedSize,
  reverse = false,
  onChange,
}: {
  label: string;
  axis: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  collapsedSize?: number;
  reverse?: boolean;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ pointer: number; start: number; value: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const horizontal = axis === "horizontal";
  const direction = reverse ? -1 : 1;
  const cursor = horizontal ? "cursor-col-resize" : "cursor-row-resize";
  const lowest = collapsedSize ?? min;

  function change(next: number) {
    onChange(
      collapsedSize !== undefined && next < (collapsedSize + min) / 2
        ? collapsedSize
        : Math.max(min, Math.min(max, next)),
    );
  }

  function stop() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <>
      <hr
        aria-label={label}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuemin={lowest}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        className={cn(
          "relative z-20 shrink-0 touch-none border-0 outline-none after:absolute after:bg-primary/40 after:opacity-0 hover:bg-sidebar hover:after:opacity-100 focus-visible:bg-sidebar focus-visible:after:opacity-100",
          horizontal
            ? "-mx-0.75 h-auto w-1.5 self-stretch after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2"
            : "-my-0.75 h-1.5 w-full after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2",
          cursor,
          dragging ? "bg-sidebar after:opacity-100" : "",
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = {
            pointer: event.pointerId,
            start: horizontal ? event.clientX : event.clientY,
            value,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || event.pointerId !== current.pointer) return;
          const at = horizontal ? event.clientX : event.clientY;
          change(current.value + (at - current.start) * direction);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(event) => {
          const decrease = horizontal ? "ArrowLeft" : "ArrowUp";
          const increase = horizontal ? "ArrowRight" : "ArrowDown";
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            change(event.key === "Home" ? lowest : max);
          } else if (event.key === decrease || event.key === increase) {
            event.preventDefault();
            const by = (event.key === increase ? 1 : -1) * direction;
            const next =
              collapsedSize !== undefined && value < min && by > 0
                ? min
                : collapsedSize !== undefined && value === min && by < 0
                  ? collapsedSize
                  : value + by * (event.shiftKey ? 40 : 10);
            change(next);
          }
        }}
      />
      {dragging
        ? createPortal(
            <div
              aria-hidden
              className={cn(
                "fixed inset-0 z-100 touch-none select-none",
                cursor,
              )}
            />,
            document.body,
          )
        : null}
    </>
  );
}
