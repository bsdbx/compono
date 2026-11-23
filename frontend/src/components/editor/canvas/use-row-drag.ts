import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { reorderedRows } from "./graph";

type Point = { x: number; y: number };
type RowPreview = {
  row: string;
  before: string | null;
  valid: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
};
type Gesture = {
  capture: HTMLElement;
  pointer: number;
  row: string;
  start: Point;
  offset: Point;
  width: number;
  height: number;
  zoom: number;
  targets: { row: string; center: number }[];
  active: boolean;
  before: string | null;
  valid: boolean;
};

/** A stable capture surface keeps a full-row drag working while the list reflows beneath it. */
export function useRowDrag(
  savedRows: string[],
  onDrop: (row: string, before?: string) => void,
  getZoom?: () => number,
) {
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  const suppressClick = useRef(false);
  const live = useRef({ rows: savedRows, onDrop });
  live.current = { rows: savedRows, onDrop };
  const [preview, setPreview] = useState<RowPreview>();

  const finish = useCallback((commit: boolean) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = undefined;
    suppressClick.current = current.active;
    setPreview(undefined);
    if (commit && current.active && current.valid)
      live.current.onDrop(current.row, current.before ?? undefined);
    if (current.capture.hasPointerCapture?.(current.pointer))
      current.capture.releasePointerCapture(current.pointer);
  }, []);

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key !== "Escape" || !gesture.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(false);
    }
    const blur = () => finish(false);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
      gesture.current = undefined;
    };
  }, [finish]);

  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointer) return;
    event.stopPropagation();
    if (
      !current.active &&
      Math.hypot(
        event.clientX - current.start.x,
        event.clientY - current.start.y,
      ) < 4
    )
      return;
    const bounds = list.current?.getBoundingClientRect();
    const rows = live.current.rows;
    if (!bounds || !rows.includes(current.row)) return finish(false);
    if (!current.active && region.current) {
      current.capture = region.current;
      current.capture.setPointerCapture?.(current.pointer);
    }
    current.active = true;
    const rowHeight = current.height || 26 * current.zoom;
    const centerY =
      event.clientY - current.offset.y + rowHeight / 2 - bounds.top;
    current.before =
      current.targets.find(
        ({ row, center }) => centerY < center && rows.includes(row),
      )?.row ?? null;
    current.valid =
      event.clientX >= bounds.left - 24 &&
      event.clientX <= bounds.right + 24 &&
      event.clientY >= bounds.top - rowHeight &&
      event.clientY <= bounds.bottom + rowHeight;
    setPreview({
      row: current.row,
      before: current.before,
      valid: current.valid,
      x: event.clientX - current.offset.x,
      y: event.clientY - current.offset.y,
      width: current.width / current.zoom,
      height: current.height / current.zoom,
      zoom: current.zoom,
    });
  }

  function start(event: PointerEvent<HTMLElement>, row: string) {
    if (event.button !== 0 || gesture.current) return;
    const element = event.currentTarget.closest<HTMLElement>("[data-row]");
    const ordered = list.current;
    if (!element || !ordered || !region.current) return;
    event.preventDefault();
    event.stopPropagation();
    const surface = element.querySelector("[data-row-drag-surface]") ?? element;
    const bounds = surface.getBoundingClientRect();
    const listBounds = ordered.getBoundingClientRect();
    const zoom = getZoom?.() ?? 1;
    const rowHeight = listBounds.height / savedRows.length || 26 * zoom;
    // Freeze the targets so shifting the preview cannot move the drop thresholds.
    const targets = Array.from(ordered.children).flatMap((child, index) => {
      const id = child.getAttribute("data-row");
      if (id === null || id === row) return [];
      const rect = child.getBoundingClientRect();
      return [
        {
          row: id,
          center: rect.height
            ? rect.top - listBounds.top + rect.height / 2
            : (index + 0.5) * rowHeight,
        },
      ];
    });
    gesture.current = {
      capture: event.currentTarget,
      pointer: event.pointerId,
      row,
      start: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      width: bounds.width,
      height: bounds.height,
      zoom,
      targets,
      active: false,
      before: null,
      valid: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  return {
    region,
    list,
    preview,
    rows: preview?.valid
      ? reorderedRows(savedRows, preview.row, preview.before ?? undefined)
      : savedRows,
    start,
    handlers: {
      onPointerDownCapture() {
        if (!gesture.current) suppressClick.current = false;
      },
      onPointerMove: move,
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (!gesture.current || event.pointerId !== gesture.current.pointer)
          return;
        move(event);
        finish(true);
      },
      onPointerCancel() {
        finish(false);
      },
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        if (event.target === gesture.current?.capture) finish(false);
      },
      onClickCapture(event: {
        preventDefault: () => void;
        stopPropagation: () => void;
      }) {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
