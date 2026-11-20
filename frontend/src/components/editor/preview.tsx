import { ChevronDown } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useEvaluation, useNodeTypes } from "@/components/editor/canvas/data";
import { readGraph } from "@/components/editor/canvas/graph";
import type { Draft } from "@/components/editor/draft";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PreviewFrame, type PreviewZoom } from "./preview-frame";
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

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-0.5 flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border bg-card px-4 text-center">
      {children}
    </div>
  );
}

function ZoomPicker({
  zoom,
  onChange,
}: {
  zoom: PreviewZoom;
  onChange: (zoom: PreviewZoom) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Preview zoom: ${zoom === "fit" ? "Fit" : `${zoom * 100}%`}`}
          title="Preview zoom · Middle-drag to pan"
          className="flex h-7.5 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-sm"
        >
          <span>{zoom === "fit" ? "Fit" : `${zoom * 100}%`}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem
          className={zoom === "fit" ? "bg-accent text-sm" : "text-sm"}
          aria-current={zoom === "fit" ? "true" : undefined}
          onSelect={() => onChange("fit")}
        >
          Fit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {[0.25, 0.5, 1, 1.5, 2].map((scale) => (
          <DropdownMenuItem
            key={scale}
            className={zoom === scale ? "bg-accent text-sm" : "text-sm"}
            aria-current={zoom === scale ? "true" : undefined}
            onSelect={() => onChange(scale)}
          >
            {scale * 100}%
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [zoom, setZoom] = useState<PreviewZoom>(1);
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
      <div className="flex h-10 shrink-0 items-center justify-between gap-1 px-0.5">
        <h2 className="shrink-0 font-semibold text-sm">Preview</h2>
        {current ? (
          <div className="flex min-w-0 items-center gap-1">
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
            <ZoomPicker zoom={zoom} onChange={setZoom} />
          </div>
        ) : null}
      </div>
      <Box>
        {evaluated === undefined ? null : html !== "" && current ? (
          <PreviewFrame html={html} width={current.width} zoom={zoom} />
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
