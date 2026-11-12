"use client";

import {
  Check,
  ChevronDown,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ScreenSize } from "@/api/types.gen";
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
import { cn } from "@/lib/utils";

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
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    const element = box.current;
    if (element === null) {
      return;
    }

    const observer = new ResizeObserver(() => setBoxWidth(element.clientWidth));
    observer.observe(element);
    setBoxWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Each render goes to the frame, which keeps its page, so there's no flash
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(html, "*");
  }, [html]);

  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1;
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
          height: BOX_HEIGHT / scale,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

function SizeIcon({ width }: { width: number }) {
  const Icon = width >= 1024 ? Monitor : width >= 600 ? Tablet : Smartphone;
  return <Icon className="size-3.5 text-muted-foreground" />;
}

/** A new size: its name, and a width a screen can have. */
function AddSize({
  taken,
  onAdd,
}: {
  taken: readonly string[];
  onAdd: (size: ScreenSize) => void;
}) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const pixels = Number(width);
  const valid =
    name.trim() !== "" &&
    name.trim().length <= 30 &&
    !taken.includes(name.trim()) &&
    Number.isInteger(pixels) &&
    pixels >= 200 &&
    pixels <= 3840;
  const field =
    "flex h-7.5 w-full items-center rounded-md border border-input bg-card px-2 text-sm";
  return (
    <form
      className="flex flex-col gap-1.5 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          onAdd({ name: name.trim(), width: pixels });
        }
      }}
      // The menu's typing to find an item would take the focus from the fields
      onKeyDown={(event) => event.stopPropagation()}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: the form opens to type the name
        autoFocus
        aria-label="Size name"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={cn(field, "outline-none focus:border-selection/50")}
      />
      <label className={cn(field, "gap-1 focus-within:border-selection/50")}>
        <input
          aria-label="Width"
          inputMode="numeric"
          placeholder="Width"
          value={width}
          onChange={(event) => setWidth(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        <span className="text-subtle-foreground">px</span>
      </label>
      <Button type="submit" size="sm" disabled={!valid} className="w-full">
        Add
      </Button>
    </form>
  );
}

/** The screen sizes to render at: pick one, add one, or take one away. */
function SizePicker({
  sizes,
  current,
  onPick,
  onChange,
}: {
  sizes: readonly ScreenSize[];
  current: ScreenSize;
  onPick: (size: ScreenSize) => void;
  onChange: (sizes: ScreenSize[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setAdding(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Screen size: ${current.name} ${current.width}`}
          className="flex h-7.5 items-center gap-1.5 rounded-md border border-border px-2 text-sm"
        >
          <SizeIcon width={current.width} />
          <span>{current.name}</span>
          <span className="text-subtle-foreground">{current.width}</span>
          <ChevronDown className="ml-1 size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {sizes.map((size) => (
          <DropdownMenuItem
            key={size.name}
            className="group/size h-8 gap-2 text-sm"
            onSelect={() => onPick(size)}
          >
            <SizeIcon width={size.width} />
            <span>{size.name}</span>
            <span className="flex-1 text-subtle-foreground">{size.width}</span>
            {size.name === current.name ? (
              <Check className="size-3.5" />
            ) : sizes.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove ${size.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(sizes.filter((each) => each !== size));
                }}
                className="rounded-sm p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover/size:opacity-100 group-focus/size:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </DropdownMenuItem>
        ))}
        {sizes.length < 10 ? (
          <>
            <DropdownMenuSeparator />
            {adding ? (
              <AddSize
                taken={sizes.map((size) => size.name)}
                onAdd={(size) => {
                  onChange([...sizes, size]);
                  onPick(size);
                  setOpen(false);
                  setAdding(false);
                }}
              />
            ) : (
              <DropdownMenuItem
                className="h-8 gap-2 text-sm"
                onSelect={(event) => {
                  // The menu stays open for the new size
                  event.preventDefault();
                  setAdding(true);
                }}
              >
                <Plus className="size-3.5 text-muted-foreground" />
                Add size
              </DropdownMenuItem>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-0.5 flex h-43 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border bg-card px-4 text-center">
      {children}
    </div>
  );
}

/** The Preview before a component is open. */
export function PreviewPlaceholder() {
  return (
    <section aria-label="Preview" className="px-3 pb-3">
      <h2 className="flex h-10 items-center px-0.5 font-semibold text-sm">
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
}: {
  draft: Draft;
  onShowNode: (node: string) => void;
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
  const [picked, setPicked] = useState<string>();

  const sizes = content?.screen_sizes ?? [];
  const current =
    sizes.find((size) => size.name === picked) ?? sizes[0] ?? undefined;
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
    <section aria-label="Preview" className="px-3 pb-3">
      <div className="flex h-10 items-center justify-between px-0.5">
        <h2 className="font-semibold text-sm">Preview</h2>
        {current ? (
          <SizePicker
            sizes={sizes}
            current={current}
            onPick={(size) => setPicked(size.name)}
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
          <>
            <p className="font-medium text-2xs">Nothing to render yet</p>
            <p className="text-2xs text-muted-foreground">
              Wire an element into Component Output’s Render.
            </p>
          </>
        )}
      </Box>
    </section>
  );
}
