import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useEvaluation, useNodeTypes } from "@/components/editor/canvas/data";
import { readGraph } from "@/components/editor/canvas/graph";
import type { Draft } from "@/components/editor/draft";
import { Button } from "@/components/ui/button";
import { SizePicker } from "./preview-sizes";

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );

/** A rendered value as HTML: an element and its children, with every text and attribute escaped. */
export function toHtml(value: unknown): string {
  if (typeof value === "string") {
    return escapeHtml(value);
  }

  if (typeof value === "number") {
    return escapeHtml(String(value));
  }

  if (Array.isArray(value)) {
    return value.map(toHtml).join("");
  }

  if (typeof value !== "object" || value === null || !("tag" in value)) {
    return "";
  }

  const element = value as {
    tag: unknown;
    className?: unknown;
    attributes?: Record<string, unknown>;
    children?: unknown[];
  };
  const inner = (element.children ?? []).map(toHtml).join("");
  const tag = String(element.tag);
  // A fragment is only its children
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
    return inner;
  }

  const className =
    typeof element.className === "string" && element.className !== ""
      ? ` class="${escapeHtml(element.className)}"`
      : "";
  const attributes = Object.entries(element.attributes ?? {})
    .filter(
      ([name, attribute]) =>
        /^[a-z][a-z0-9-]*$/i.test(name) &&
        !/^on/i.test(name) &&
        attribute !== false &&
        attribute !== null &&
        attribute !== undefined,
    )
    .map(([name, attribute]) =>
      attribute === true
        ? ` ${name}`
        : ` ${name}="${escapeHtml(String(attribute))}"`,
    )
    .join("");
  return VOID.has(tag)
    ? `<${tag}${className}${attributes}>`
    : `<${tag}${className}${attributes}>${inner}</${tag}>`;
}

/**
 * The frame's page: Tailwind for the component's classes, and a script that shows the HTML its parent sends.
 * It's see-through on the dark Preview, and its links don't go anywhere, so the frame stays on the component.
 */
const FRAME = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
<style>html { color-scheme: dark; background: transparent; } body { margin: 0; }</style>
<script>
addEventListener("message", (event) => {
  if (event.source === parent && typeof event.data === "string") {
    document.body.innerHTML = event.data;
  }
});
addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a")) {
    event.preventDefault();
  }
}, true);
</script>
</head>
<body></body>
</html>`;

const BOX_HEIGHT = 172;

/** The component, rendered at the width in a sandboxed frame, scaled down to fit. */
function Frame({ html, width }: { html: string; width: number }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [boxSize, setBoxSize] = useState({ width: 0, height: BOX_HEIGHT });

  useEffect(() => {
    const element = box.current;
    if (element === null) {
      return;
    }

    const measure = () =>
      setBoxSize({
        width: element.clientWidth,
        height: element.clientHeight || BOX_HEIGHT,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  // Each render goes to the frame, which keeps its page, so there's no flash
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(html, "*");
  }, [html]);

  const scale = boxSize.width > 0 ? Math.min(1, boxSize.width / width) : 1;
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <iframe
        ref={frame}
        title="Preview"
        // Scripts for Tailwind, in a frame of its own origin
        sandbox="allow-scripts"
        srcDoc={FRAME}
        onLoad={() => frame.current?.contentWindow?.postMessage(html, "*")}
        className="absolute top-0 left-0 origin-top-left border-0"
        style={{
          width,
          height: boxSize.height / scale,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-0.5 flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border bg-card px-4 text-center">
      {children}
    </div>
  );
}

/** The Preview before a component is open. */
export function PreviewPlaceholder() {
  return (
    <section
      aria-label="Preview"
      className="flex h-full min-h-0 flex-col px-3 pb-3"
    >
      <h2 className="flex h-10 shrink-0 items-center px-0.5 font-semibold text-sm">
        Preview
      </h2>
      <Box>
        <p className="font-medium text-2xs">Nothing to render yet</p>
      </Box>
    </section>
  );
}

/** The open component as it renders at a screen size, or the nodes that keep it from rendering. */
export function Preview({
  draft,
  onShowNode,
  componentId,
}: {
  draft: Draft;
  onShowNode: (node: string) => void;
  componentId?: string | undefined;
}) {
  const { content } = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  const graph = useMemo(
    () => (content ? readGraph(content.graph) : undefined),
    [content],
  );
  const evaluated = useEvaluation(graph);
  const nodeTypes = useNodeTypes();
  const remembered = useMemo(() => {
    try {
      return componentId
        ? (localStorage.getItem(`compono:preview:${componentId}`) ?? undefined)
        : undefined;
    } catch {
      return undefined;
    }
  }, [componentId]);
  const [picked, setPicked] = useState<{
    component: string | undefined;
    name: string;
  }>();
  const pickedName =
    picked?.component === componentId
      ? (picked?.name ?? remembered)
      : remembered;
  function pick(name: string) {
    setPicked({ component: componentId, name });
    try {
      if (componentId)
        localStorage.setItem(`compono:preview:${componentId}`, name);
    } catch {
      /* The selection still works when browser storage is unavailable. */
    }
  }

  const sizes = content?.screen_sizes ?? [];
  const current =
    sizes.find((size) => size.name === pickedName) ?? sizes[0] ?? undefined;
  const html = useMemo(() => toHtml(evaluated?.rendered), [evaluated]);
  const errors = Object.entries(evaluated?.nodes ?? {}).flatMap(
    ([id, node]) => {
      if (node.error === null) {
        return [];
      }

      const type = graph?.nodes.find((each) => each.id === id)?.type ?? "";
      return [
        { id, name: nodeTypes?.get(type)?.name ?? type, error: node.error },
      ];
    },
  );
  const first = errors[0];

  return (
    <section
      aria-label="Preview"
      className="flex h-full min-h-0 flex-col px-3 pb-3"
    >
      <div className="flex h-10 shrink-0 items-center justify-between px-0.5">
        <h2 className="font-semibold text-sm">Preview</h2>
        {current ? (
          <SizePicker
            key={componentId}
            sizes={sizes}
            current={current}
            onPick={(size) => pick(size.name)}
            onChange={(screen_sizes) => {
              const now = draft.getSnapshot().content;
              if (now) {
                draft.change({ graph: now.graph, screen_sizes });
              }
            }}
          />
        ) : null}
      </div>
      <Box>
        {evaluated === undefined ? null : html !== "" && current ? (
          <Frame html={html} width={current.width} />
        ) : first ? (
          <>
            <p className="font-medium text-error text-xs">Can’t render</p>
            <p className="text-2xs text-muted-foreground">
              {first.name}: {first.error}
              {errors.length > 1 ? ` And ${errors.length - 1} more.` : ""}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-1.5"
              onClick={() => onShowNode(first.id)}
            >
              Show node
            </Button>
          </>
        ) : (
          <p className="font-medium text-2xs">Nothing to render yet</p>
        )}
      </Box>
    </section>
  );
}
