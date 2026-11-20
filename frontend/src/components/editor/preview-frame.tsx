import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Bounds,
  type Point,
  type PreviewZoom,
  previewScale,
  previewView,
  previewZoom,
} from "./preview-view";

export type { PreviewZoom } from "./preview-view";

const FRAME = `<!doctype html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: clip; color-scheme: dark; background: transparent; }
#preview-content { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
#preview-content > * { flex-shrink: 0; }
html[data-panning], html[data-panning] * { cursor: grabbing !important; user-select: none !important; }
</style></head><body><div id="preview-content"></div>
<script>
const root = document.getElementById("preview-content");
let pan, revision = 0, shift = { x: 0, y: 0 }, scheduled = false, previous = "";
function send(action, data = {}) { parent.postMessage({ type: "compono:preview-" + action, ...data }, "*"); }
function measure() {
  scheduled = false;
  const rects = [...root.querySelectorAll("*")].flatMap(element =>
    getComputedStyle(element).visibility === "hidden" ? [] : [...element.getClientRects()]);
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      const range = document.createRange(); range.selectNodeContents(node); rects.push(...range.getClientRects());
    }
  }
  const visible = rects.filter(rect => rect.width || rect.height);
  const x = visible.length ? Math.min(...visible.map(rect => rect.left)) - shift.x : innerWidth / 2;
  const y = visible.length ? Math.min(...visible.map(rect => rect.top)) - shift.y : innerHeight / 2;
  const width = visible.length ? Math.max(...visible.map(rect => rect.right)) - shift.x - x : 0;
  const height = visible.length ? Math.max(...visible.map(rect => rect.bottom)) - shift.y - y : 0;
  const bounds = Object.fromEntries(Object.entries({ x, y, width, height }).map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
  const data = { revision, width: innerWidth, height: innerHeight, bounds };
  const key = JSON.stringify(data);
  if (key !== previous) { previous = key; send("bounds", data); }
}
function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(measure); } }
const resize = new ResizeObserver(schedule);
function observe() { resize.disconnect(); resize.observe(root); for (const child of root.querySelectorAll("*")) resize.observe(child); }
new MutationObserver(records => {
  if (records.some(record => record.type === "childList")) observe();
  if (records.some(record => record.target !== root || record.type !== "attributes")) schedule();
}).observe(root, { childList: true, subtree: true, attributes: true });
new MutationObserver(schedule).observe(document.head, { childList: true, subtree: true, characterData: true });
function finishPan() {
  const current = pan; if (!current) return;
  pan = undefined;
  document.documentElement.removeAttribute("data-panning");
  if (document.documentElement.hasPointerCapture(current.pointer)) document.documentElement.releasePointerCapture(current.pointer);
  send("pan", { phase: "end" });
}
addEventListener("message", event => {
  if (event.source !== parent) return;
  const data = event.data;
  if (data?.type === "compono:preview-html" && typeof data.html === "string") {
    finishPan(); revision = data.revision; root.innerHTML = data.html; observe(); schedule();
  } else if (data?.type === "compono:preview-view" && Number.isFinite(data.x) && Number.isFinite(data.y)) {
    shift = { x: data.x, y: data.y };
    root.style.transform = "translate(" + shift.x + "px," + shift.y + "px)";
  }
});
addEventListener("pointerdown", event => {
  if (event.button !== 1) return;
  event.preventDefault(); pan = { pointer: event.pointerId, x: event.screenX, y: event.screenY };
  document.documentElement.setPointerCapture(event.pointerId);
  document.documentElement.setAttribute("data-panning", ""); send("pan", { phase: "start" });
});
addEventListener("pointermove", event => {
  if (!pan || event.pointerId !== pan.pointer) return;
  event.preventDefault();
  const x = event.screenX - pan.x, y = event.screenY - pan.y;
  pan.x = event.screenX; pan.y = event.screenY; send("pan", { phase: "move", x, y });
});
addEventListener("pointerup", finishPan);
addEventListener("pointercancel", finishPan);
addEventListener("lostpointercapture", finishPan);
addEventListener("blur", finishPan);
addEventListener("auxclick", event => { if (event.button === 1) event.preventDefault(); });
addEventListener("click", event => { if (event.target instanceof Element && event.target.closest("a")) event.preventDefault(); }, true);
addEventListener("wheel", event => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) send("zoom", { delta: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1) });
}, { passive: false });
addEventListener("keydown", event => {
  const target = event.target;
  if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
      !(target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,[role="textbox"],[role="combobox"]')))) {
    event.preventDefault(); event.stopPropagation(); send("center");
  }
});
addEventListener("resize", schedule);
document.fonts.ready.then(schedule);
document.fonts.addEventListener("loadingdone", schedule);
observe(); schedule();
</script></body></html>`;

/** A fixed document behind one bounded camera. Neither document nor panel scrolls. */
export function PreviewFrame({
  html,
  width,
  height = 720,
  zoom = 1,
  componentId,
  centerRequest = 0,
  onZoomChange,
  onScaleChange,
}: {
  html: string;
  width: number;
  height?: number;
  zoom?: PreviewZoom;
  componentId?: string | undefined;
  centerRequest?: number;
  onZoomChange?: (zoom: number) => void;
  onScaleChange?: (scale: number) => void;
}) {
  const box = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const revision = useRef(0);
  const drag = useRef<{ pointer: number; x: number; y: number }>(undefined);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [measured, setMeasured] = useState<{ key: string; bounds: Bounds }>();
  const [position, setPosition] = useState<{ key: string; pan: Point }>();
  const [panning, setPanning] = useState(false);
  const sizeKey = `${componentId}:${width}:${height}`;
  const key = `${sizeKey}:${centerRequest}`;
  const content =
    measured?.key === sizeKey ? measured.bounds : { x: 0, y: 0, width, height };
  const scale = previewScale(zoom, boxSize, { width, height });
  const view = previewView(
    boxSize,
    { width, height },
    content,
    position?.key === key ? position.pan : { x: 0, y: 0 },
    scale,
  );
  const live = useRef({
    box: boxSize,
    size: { width, height },
    content,
    pan: view.pan,
    scale,
    key,
    sizeKey,
    onZoomChange,
  });
  live.current = {
    box: boxSize,
    size: { width, height },
    content,
    pan: view.pan,
    scale,
    key,
    sizeKey,
    onZoomChange,
  };

  const move = useCallback((x: number, y: number, relative = true) => {
    const now = live.current;
    const next = previewView(
      now.box,
      now.size,
      now.content,
      {
        x: x + (relative ? now.pan.x : 0),
        y: y + (relative ? now.pan.y : 0),
      },
      now.scale,
    ).pan;
    now.pan = next;
    setPosition({ key: now.key, pan: next });
  }, []);

  const sendHtml = useCallback((value: string) => {
    revision.current += 1;
    frame.current?.contentWindow?.postMessage(
      { type: "compono:preview-html", html: value, revision: revision.current },
      "*",
    );
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
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

  useEffect(() => sendHtml(html), [html, sendHtml]);
  useEffect(() => {
    onScaleChange?.(scale);
  }, [scale, onScaleChange]);
  const contentX = view.content.x;
  const contentY = view.content.y;
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: "compono:preview-view", x: contentX, y: contentY },
      "*",
    );
  }, [contentX, contentY]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        !frame.current?.contentWindow ||
        event.source !== frame.current.contentWindow
      )
        return;
      const data = event.data,
        now = live.current;
      if (
        data?.type === "compono:preview-bounds" &&
        data.revision === revision.current &&
        data.width === now.size.width &&
        data.height === now.size.height
      ) {
        const bounds = data.bounds;
        if (
          !bounds ||
          ![bounds.x, bounds.y, bounds.width, bounds.height].every(
            Number.isFinite,
          ) ||
          bounds.width < 0 ||
          bounds.height < 0
        )
          return;
        setMeasured((before) =>
          before?.key === now.sizeKey &&
          JSON.stringify(before.bounds) === JSON.stringify(bounds)
            ? before
            : { key: now.sizeKey, bounds },
        );
      } else if (data?.type === "compono:preview-pan") {
        if (data.phase === "start") setPanning(true);
        else if (data.phase === "end") setPanning(false);
        else if (
          data.phase === "move" &&
          Number.isFinite(data.x) &&
          Number.isFinite(data.y)
        )
          move(data.x, data.y);
      } else if (data?.type === "compono:preview-center") move(0, 0, false);
      else if (
        data?.type === "compono:preview-zoom" &&
        Number.isFinite(data.delta)
      )
        now.onZoomChange?.(previewZoom(now.scale, data.delta));
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [move]);

  function finishPan() {
    const current = drag.current;
    drag.current = undefined;
    setPanning(false);
    if (current && box.current?.hasPointerCapture?.(current.pointer))
      box.current.releasePointerCapture(current.pointer);
  }

  return (
    <section
      ref={box}
      aria-label="Preview viewport"
      data-preview-viewport
      data-pan-x={view.pan.x}
      data-pan-y={view.pan.y}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: F recenters the preview when it has keyboard focus.
      tabIndex={0}
      className={`absolute inset-0 overflow-clip outline-none ${panning ? "cursor-grabbing select-none" : ""}`}
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
        move(event.clientX - current.x, event.clientY - current.y);
        current.x = event.clientX;
        current.y = event.clientY;
      }}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
      onLostPointerCapture={finishPan}
    >
      <div
        className="absolute origin-top-left"
        style={{
          left: view.frame.x,
          top: view.frame.y,
          width,
          height,
          transform: `scale(${scale})`,
        }}
      >
        <iframe
          ref={frame}
          title="Preview"
          sandbox="allow-scripts"
          srcDoc={FRAME}
          onLoad={() => {
            sendHtml(html);
            frame.current?.contentWindow?.postMessage(
              { type: "compono:preview-view", ...view.content },
              "*",
            );
          }}
          className="absolute inset-0 border-0"
          style={{ width, height }}
        />
      </div>
      <div
        aria-hidden
        data-preview-bounds
        className="pointer-events-none absolute border border-foreground/20 border-dashed"
        style={{
          left: view.frame.x,
          top: view.frame.y,
          width: width * scale,
          height: height * scale,
        }}
      />
    </section>
  );
}
