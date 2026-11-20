import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type PreviewZoom = number | "fit";

const FRAME = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
<style>
html { color-scheme: dark; background: transparent; }
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: safe center; justify-content: safe center; }
html[data-panning], html[data-panning] * { cursor: grabbing !important; user-select: none !important; }
</style>
<script>
let pan;
function finishPan() {
  if (!pan) return;
  pan = undefined;
  document.documentElement.removeAttribute("data-panning");
  parent.postMessage({ type: "compono:preview-pan", phase: "end" }, "*");
}
addEventListener("message", (event) => {
  if (event.source !== parent) return;
  if (typeof event.data === "string") {
    finishPan();
    document.body.innerHTML = event.data;
  } else if (event.data?.type === "compono:preview-scroll" &&
      Number.isFinite(event.data.x) && Number.isFinite(event.data.y)) {
    scrollBy(event.data.x, event.data.y);
  } else if (event.data?.type === "compono:preview-reset") {
    finishPan();
    scrollTo(0, 0);
  }
});
addEventListener("pointerdown", (event) => {
  if (event.button !== 1) return;
  event.preventDefault();
  pan = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  document.documentElement.setPointerCapture(event.pointerId);
  document.documentElement.setAttribute("data-panning", "");
  parent.postMessage({ type: "compono:preview-pan", phase: "start" }, "*");
});
addEventListener("pointermove", (event) => {
  if (!pan || event.pointerId !== pan.pointer) return;
  event.preventDefault();
  const x = pan.x - event.clientX, y = pan.y - event.clientY;
  pan.x = event.clientX; pan.y = event.clientY;
  const beforeX = scrollX, beforeY = scrollY;
  scrollBy(x, y);
  parent.postMessage({ type: "compono:preview-pan", phase: "move",
    x: x - (scrollX - beforeX), y: y - (scrollY - beforeY) }, "*");
});
addEventListener("pointerup", finishPan);
addEventListener("pointercancel", finishPan);
addEventListener("lostpointercapture", finishPan);
addEventListener("blur", finishPan);
addEventListener("auxclick", (event) => { if (event.button === 1) event.preventDefault(); });
addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
}, true);
</script>
</head>
<body></body>
</html>`;

/** Scroll within real content bounds and return any movement it could not consume. */
function scrollWithin(element: HTMLElement, x: number, y: number) {
  const beforeX = element.scrollLeft,
    beforeY = element.scrollTop;
  element.scrollLeft = Math.max(
    0,
    Math.min(element.scrollWidth - element.clientWidth, beforeX + x),
  );
  element.scrollTop = Math.max(
    0,
    Math.min(element.scrollHeight - element.clientHeight, beforeY + y),
  );
  return {
    x: x - (element.scrollLeft - beforeX),
    y: y - (element.scrollTop - beforeY),
  };
}

/** The selected width is the iframe viewport; panel size and zoom only affect its visible area. */
export function PreviewFrame({
  html,
  width,
  zoom = 1,
  componentId,
}: {
  html: string;
  width: number;
  zoom?: PreviewZoom;
  componentId?: string | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number }>(undefined);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 172 });
  const [panning, setPanning] = useState(false);
  const view = useRef<{
    component: string | undefined;
    width: number;
    height: number;
    x: number;
    y: number;
  }>(undefined);
  const scale =
    zoom === "fit"
      ? boxSize.width > 0
        ? Math.min(1, boxSize.width / width)
        : 1
      : zoom;
  const stageWidth = Math.max(boxSize.width, width * scale);
  const stageHeight = Math.max(boxSize.height, boxSize.height * scale);
  const left = (stageWidth - width * scale) / 2;
  const top = (stageHeight - boxSize.height * scale) / 2;

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const next = {
        width: element.clientWidth,
        height: element.clientHeight || 172,
      };
      setBoxSize((before) =>
        before.width === next.width && before.height === next.height
          ? before
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || boxSize.width <= 0) return;
    const previous = view.current;
    const reset =
      !previous ||
      previous.component !== componentId ||
      previous.width !== width;
    const x = reset ? width / 2 : previous.x;
    const y = reset
      ? boxSize.height / 2
      : previous.y + (boxSize.height - previous.height) / 2;
    scrollWithin(
      element,
      x * scale + left - boxSize.width / 2 - element.scrollLeft,
      y * scale + top - boxSize.height / 2 - element.scrollTop,
    );
    view.current = {
      component: componentId,
      width,
      height: boxSize.height,
      x: (element.scrollLeft + boxSize.width / 2 - left) / scale,
      y: (element.scrollTop + boxSize.height / 2 - top) / scale,
    };
    if (reset)
      frame.current?.contentWindow?.postMessage(
        { type: "compono:preview-reset" },
        "*",
      );
  }, [componentId, width, boxSize.width, boxSize.height, left, top, scale]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(html, "*");
  }, [html]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "compono:preview-pan"
      )
        return;
      const { phase, x, y } = event.data;
      if (phase === "start") setPanning(true);
      else if (phase === "end") setPanning(false);
      else if (
        phase === "move" &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        box.current
      ) {
        scrollWithin(box.current, x * scale, y * scale);
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [scale]);

  function finishPan() {
    drag.current = undefined;
    setPanning(false);
  }

  return (
    <section
      ref={box}
      aria-label="Preview viewport"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable viewport needs keyboard scrolling.
      tabIndex={0}
      data-preview-viewport
      className={`absolute inset-0 overflow-auto overscroll-contain outline-none ${panning ? "cursor-grabbing select-none" : ""}`}
      onScroll={(event) => {
        if (!view.current) return;
        const element = event.currentTarget;
        view.current.x =
          (element.scrollLeft + element.clientWidth / 2 - left) / scale;
        view.current.y =
          (element.scrollTop + element.clientHeight / 2 - top) / scale;
      }}
      onPointerDown={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPanning(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        event.preventDefault();
        const remaining = scrollWithin(
          event.currentTarget,
          current.x - event.clientX,
          current.y - event.clientY,
        );
        current.x = event.clientX;
        current.y = event.clientY;
        if (remaining.x || remaining.y)
          frame.current?.contentWindow?.postMessage(
            {
              type: "compono:preview-scroll",
              x: remaining.x / scale,
              y: remaining.y / scale,
            },
            "*",
          );
      }}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
      onLostPointerCapture={finishPan}
    >
      <div
        className="relative"
        style={{
          width: stageWidth,
          height: stageHeight,
        }}
      >
        <iframe
          ref={frame}
          title="Preview"
          sandbox="allow-scripts"
          srcDoc={FRAME}
          onLoad={() => frame.current?.contentWindow?.postMessage(html, "*")}
          className="absolute origin-top-left border-0"
          style={{
            width,
            height: boxSize.height,
            left,
            top,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </section>
  );
}
