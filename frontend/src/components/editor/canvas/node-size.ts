import type { XY } from "./graph";

export const NODE_DEFAULT_WIDTH = 188;
export const NODE_MIN_WIDTH = 168;
export const NODE_MAX_WIDTH = 1024;
export const NODE_NAME_LIMIT = 128;
// The header's horizontal padding and the node's border.
const HEADER_INSET = 30;

export type NodeSize = { width: number; position: XY };
export type ResizeSide = "left" | "right";

export const nodeName = (value: string) =>
  Array.from(value.replace(/\s+/gu, " ").trim())
    .slice(0, NODE_NAME_LIMIT)
    .join("")
    .trimEnd();

export const nodeWidth = (width: number) =>
  Number.isFinite(width)
    ? Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, Math.round(width)))
    : NODE_DEFAULT_WIDTH;

export const labelWidth = (textWidth: number, minimum = NODE_DEFAULT_WIDTH) =>
  nodeWidth(Math.max(minimum, Math.ceil(textWidth) + HEADER_INSET));

/** Move either side horizontally, preserving the opposite side and the vertical position. */
export function resizedNode(
  size: NodeSize,
  side: ResizeSide,
  delta: number,
): NodeSize {
  const width = nodeWidth(size.width + (side === "left" ? -delta : delta));
  return {
    width,
    position: {
      x: size.position.x + (side === "left" ? size.width - width : 0),
      y: size.position.y,
    },
  };
}
