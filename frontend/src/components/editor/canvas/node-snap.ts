import type { ReactFlowInstance, Rect } from "@xyflow/react";
import type { XY } from "./graph";
import {
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  type NodeSize,
  type ResizeSide,
  resizedNode,
} from "./node-size";
import type { CanvasNode } from "./node-view";

export const GRID_GAP = 18;
const SNAP_DISTANCE = 8;
const GUIDE_REACH = 240;
const MATCHING_ANCHORS = [
  [0, 0],
  [0.5, 0.5],
  [1, 1],
] as const;
const VERTICAL_ANCHORS = [...MATCHING_ANCHORS, [0, 1], [1, 0]] as const;

type Axis = "x" | "y";
export type SnapGuide = { axis: Axis; at: number; from: number; to: number };
type Range = { start: number; end: number };
type Alignment = {
  at: number;
  delta: number;
  gap: number;
  moving: Range;
  target: Range;
  sharedEdge?: boolean;
  alignedWidth?: Range | undefined;
};
type SocketPair = { moving: XY; target: XY };

function span(box: Rect, axis: Axis) {
  const size = axis === "x" ? box.width : box.height;
  return { start: box[axis], end: box[axis] + size, size };
}

type Proximity = Pick<Alignment, "delta" | "gap">;

function closer(candidate: Proximity, best: Proximity | undefined) {
  const distance = Math.abs(candidate.delta);
  return (
    !best ||
    distance < Math.abs(best.delta) ||
    (distance === Math.abs(best.delta) && candidate.gap < best.gap)
  );
}

function rangeGap(a: Range, b: Range) {
  return Math.max(0, a.start - b.end, b.start - a.end);
}

const onGrid = (value: number) => Math.round(value / GRID_GAP) * GRID_GAP;

function guidesBetween(
  axis: Axis,
  points: readonly number[],
  moving: Range,
  target: Range,
  sharedEdge: boolean,
): SnapGuide[] {
  const from = Math.min(moving.end, target.end);
  const to = Math.max(moving.start, target.start);
  if (from < to || (axis === "x" && from === to)) {
    return points.map((at) => ({ axis, at, from, to }));
  }
  // Stacked edges can share part of a border.
  return sharedEdge && from > to
    ? points.map((at) => ({ axis, at, from: to, to: from }))
    : [];
}

function socketAlignment(pairs: readonly SocketPair[], limit: number) {
  let best: Alignment | undefined;
  for (const { moving, target } of pairs) {
    const delta = target.y - moving.y;
    if (Math.abs(delta) > limit) continue;
    const candidate = {
      at: target.y,
      delta,
      gap: Math.abs(target.x - moving.x),
      moving: { start: moving.x, end: moving.x },
      target: { start: target.x, end: target.x },
    };
    if (closer(candidate, best)) best = candidate;
  }
  return best;
}

/** Straighten connected wires first, then match nearby node edges and centers. */
export function snapBounds(
  moving: Rect,
  targets: readonly Rect[],
  zoom: number,
  sockets: readonly SocketPair[] = [],
) {
  const offset: XY = { x: 0, y: 0 };
  const matches: (Alignment & { axis: Axis })[] = [];
  const limit = SNAP_DISTANCE / zoom;
  for (const axis of ["x", "y"] as const) {
    const socket = axis === "y" ? socketAlignment(sockets, limit) : undefined;
    if (socket) {
      offset.y = socket.delta;
      matches.push({ axis, ...socket });
      continue;
    }
    const other = axis === "x" ? "y" : "x";
    const a = span(moving, axis);
    const across = span(moving, other);
    const anchors = axis === "y" ? VERTICAL_ANCHORS : MATCHING_ANCHORS;
    let best: Alignment | undefined;
    for (const target of targets) {
      const b = span(target, axis);
      const alongside = span(target, other);
      const gap = rangeGap(across, alongside);
      if (gap * zoom > GUIDE_REACH) continue;
      for (const [movingAnchor, targetAnchor] of anchors) {
        const at = b.start + b.size * targetAnchor;
        const delta = at - (a.start + a.size * movingAnchor);
        if (Math.abs(delta) > limit) continue;
        const candidate = {
          at,
          delta,
          gap,
          moving: across,
          target: alongside,
          sharedEdge: movingAnchor !== targetAnchor,
          alignedWidth: axis === "x" && a.size === b.size ? b : undefined,
        };
        if (closer(candidate, best)) best = candidate;
      }
    }
    if (best) {
      offset[axis] = best.delta;
      matches.push({ axis, ...best });
    } else {
      offset[axis] = onGrid(a.start) - a.start;
    }
  }

  const guides = matches.flatMap(
    ({ axis, at, moving, target, sharedEdge, alignedWidth }): SnapGuide[] => {
      const shift = axis === "x" ? offset.y : offset.x;
      const points = alignedWidth
        ? [
            alignedWidth.start,
            (alignedWidth.start + alignedWidth.end) / 2,
            alignedWidth.end,
          ]
        : [at];
      return guidesBetween(
        axis,
        points,
        { start: moving.start + shift, end: moving.end + shift },
        target,
        sharedEdge ?? false,
      );
    },
  );
  return { offset, guides };
}

/** Snap the moving border or center while keeping the opposite border anchored. */
export function snapResize(
  start: NodeSize,
  side: ResizeSide,
  delta: number,
  height: number,
  targets: readonly Rect[],
  zoom: number,
) {
  const leftMoves = side === "left";
  const edge = start.position.x + (leftMoves ? 0 : start.width);
  const fixed = start.position.x + (leftMoves ? start.width : 0);
  const raw = edge + delta;
  const vertical = { start: start.position.y, end: start.position.y + height };
  let best:
    | (Proximity & {
        size: NodeSize;
        at: number;
        target: Rect;
        sharedEdge: boolean;
      })
    | undefined;
  for (const target of targets) {
    const gap = rangeGap(vertical, span(target, "y"));
    if (gap * zoom > GUIDE_REACH) continue;
    for (const anchor of [0, 0.5, 1]) {
      const at = target.x + target.width * anchor;
      // The center moves at half the rate of the dragged border.
      const border = anchor === 0.5 ? 2 * at - fixed : at;
      const width = leftMoves ? fixed - border : border - fixed;
      const correction = border - raw;
      if (
        width < NODE_MIN_WIDTH ||
        width > NODE_MAX_WIDTH ||
        Math.abs(correction) * zoom > SNAP_DISTANCE
      )
        continue;
      const size = resizedNode(start, side, border - edge);
      const aligned =
        size.position.x +
        size.width * (anchor === 0.5 ? 0.5 : leftMoves ? 0 : 1);
      if (Math.abs(aligned - at) > 0.001) continue;
      const candidate = {
        size,
        at,
        target,
        gap,
        delta: correction,
        sharedEdge: leftMoves ? anchor === 1 : anchor === 0,
      };
      if (closer(candidate, best)) best = candidate;
    }
  }

  if (!best) {
    return { size: resizedNode(start, side, onGrid(raw) - edge), guides: [] };
  }
  const { size, at, target, sharedEdge } = best;
  const points = new Set([at]);
  for (const anchor of [0, 0.5, 1]) {
    const point = target.x + target.width * anchor;
    if (Math.abs(point - (size.position.x + size.width * anchor)) < 0.001)
      points.add(point);
  }
  return {
    size,
    guides: guidesBetween(
      "x",
      [...points].sort((a, b) => a - b),
      vertical,
      span(target, "y"),
      sharedEdge,
    ),
  };
}

export function alignmentTargets(
  flow: ReactFlowInstance<CanvasNode>,
  moving: { has(id: string): boolean },
) {
  const targets: Rect[] = [];
  for (const node of flow.getNodes()) {
    if (moving.has(node.id) || node.hidden) continue;
    const internal = flow.getInternalNode(node.id);
    const width = internal?.measured.width,
      height = internal?.measured.height;
    if (internal && width && height) {
      targets.push({ ...internal.internals.positionAbsolute, width, height });
    }
  }
  return targets;
}

function socketPairs(
  flow: ReactFlowInstance<CanvasNode>,
  positions: ReadonlyMap<string, XY>,
) {
  function center(
    id: string,
    side: "source" | "target",
    socket?: string | null,
  ) {
    const node = flow.getInternalNode(id);
    if (!node || node.hidden) return;
    const handle = node.internals.handleBounds?.[side]?.find(
      (handle) => handle.id === socket,
    );
    if (!handle) return;
    const position = positions.get(id) ?? node.internals.positionAbsolute;
    return {
      x: position.x + handle.x + handle.width / 2,
      y: position.y + handle.y + handle.height / 2,
    };
  }

  const pairs: SocketPair[] = [];
  for (const edge of flow.getEdges()) {
    const sourceMoves = positions.has(edge.source);
    // A wire within the selection already moves both ends together.
    if (sourceMoves === positions.has(edge.target)) continue;
    const source = center(edge.source, "source", edge.sourceHandle);
    const target = center(edge.target, "target", edge.targetHandle);
    if (source && target) {
      pairs.push(
        sourceMoves
          ? { moving: source, target }
          : { moving: target, target: source },
      );
    }
  }
  return pairs;
}

/** One offset for every moving node keeps their relative positions intact. */
export function snapPositions(
  flow: ReactFlowInstance<CanvasNode>,
  positions: ReadonlyMap<string, XY>,
) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [id, position] of positions) {
    const { width = 0, height = 0 } = flow.getInternalNode(id)?.measured ?? {};
    left = Math.min(left, position.x);
    top = Math.min(top, position.y);
    right = Math.max(right, position.x + width);
    bottom = Math.max(bottom, position.y + height);
  }
  const result = positions.size
    ? snapBounds(
        { x: left, y: top, width: right - left, height: bottom - top },
        alignmentTargets(flow, positions),
        flow.getZoom(),
        socketPairs(flow, positions),
      )
    : { offset: { x: 0, y: 0 }, guides: [] };
  return {
    ...result,
    positions: new Map(
      [...positions].map(([id, { x, y }]) => [
        id,
        { x: x + result.offset.x, y: y + result.offset.y },
      ]),
    ),
  };
}
