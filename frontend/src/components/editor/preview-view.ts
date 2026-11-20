export type PreviewZoom = number | "fit";
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Bounds = Point & Size;

const PAN_MARGIN = 24;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function previewScale(zoom: PreviewZoom, box: Size, size: Size) {
  return zoom === "fit"
    ? clamp(
        Math.min(
          (box.width - 32) / size.width,
          (box.height - 32) / size.height,
        ),
        0.01,
        1,
      )
    : clamp(zoom, 0.01, 4);
}

export const previewZoom = (scale: number, delta: number) =>
  Math.round(
    clamp(scale * Math.exp(-clamp(delta, -500, 500) * 0.002), 0.01, 4) * 1000,
  ) / 1000;

/** One screen-space pan, allowing content to move only 24px past the visible area. */
export function previewView(
  box: Size,
  size: Size,
  content: Bounds,
  requested: Point,
  scale: number,
) {
  const limitX =
    Math.max(0, (content.width * scale - box.width) / 2) + PAN_MARGIN;
  const limitY =
    Math.max(0, (content.height * scale - box.height) / 2) + PAN_MARGIN;
  const pan = {
    x: clamp(requested.x, -limitX, limitX),
    y: clamp(requested.y, -limitY, limitY),
  };
  const overflowX = Math.max(0, (content.width - size.width) / 2);
  const overflowY = Math.max(0, (content.height - size.height) / 2);
  const innerX = clamp(pan.x / scale, -overflowX, overflowX);
  const innerY = clamp(pan.y / scale, -overflowY, overflowY);
  return {
    pan,
    frame: {
      x: (box.width - size.width * scale) / 2 + pan.x - innerX * scale,
      y: (box.height - size.height * scale) / 2 + pan.y - innerY * scale,
    },
    content: {
      x: size.width / 2 - (content.x + content.width / 2) + innerX,
      y: size.height / 2 - (content.y + content.height / 2) + innerY,
    },
  };
}
