import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCanvas } from "./context";
import { type GraphNode, renameNode, setNodeWidth } from "./graph";
import { NodeNameInput } from "./node-name-input";
import {
  collapsedWidth,
  labelWidth,
  NODE_DEFAULT_WIDTH,
  nodeName,
} from "./node-size";
import { NodeWidthControl } from "./node-width-control";

/** Shared node dimensions, a label that fits its text, and horizontal side borders. */
export function NodeFrame({
  node,
  typeName,
  selected,
  error,
  skipped,
  collapsedHeight = 32,
  children,
}: {
  node: GraphNode;
  typeName: string;
  selected: boolean;
  error: boolean;
  skipped: boolean;
  collapsedHeight?: number;
  children: ReactNode;
}) {
  const canvas = useCanvas();
  const element = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [draftName, setDraftName] = useState<string>();
  const [measuredLabelWidth, setMeasuredLabelWidth] = useState(0);
  const name = nodeName(node.name ?? typeName);
  const renaming = canvas.renaming === node.id;
  const label = nodeName(renaming ? (draftName ?? name) : name);
  const changedName = renaming && draftName !== undefined && label !== name;
  const width = node.collapsed
    ? collapsedWidth(measuredLabelWidth, collapsedHeight)
    : changedName
      ? labelWidth(measuredLabelWidth, node.width ?? NODE_DEFAULT_WIDTH)
      : (node.width ?? labelWidth(measuredLabelWidth));

  useLayoutEffect(() => {
    const span = measure.current;
    if (!span) return;
    const update = () => setMeasuredLabelWidth(span.scrollWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(span);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={element}
      data-node-type={node.type}
      data-node-collapsed={node.collapsed ? "true" : undefined}
      className={cn(
        "relative border bg-card text-foreground text-xs shadow-black/40 shadow-xl",
        node.collapsed ? "rounded-full" : "rounded-xl",
        error
          ? "border-error/45"
          : selected
            ? "border-selection/40"
            : "border-input",
        skipped ? "opacity-70" : "",
      )}
      style={{ width, ...(node.collapsed ? { height: collapsedHeight } : {}) }}
    >
      <span
        ref={measure}
        aria-hidden
        className="pointer-events-none invisible absolute w-max whitespace-pre font-medium text-sm"
      >
        {label || typeName}
      </span>
      {!node.collapsed &&
        (["left", "right"] as const).map((side) => (
          <NodeWidthControl
            key={side}
            node={node}
            side={side}
            element={element}
            width={width}
          />
        ))}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: F2 and the context menu provide keyboard access to renaming. */}
      <div
        data-node-header
        className={cn(
          "flex min-w-0 items-center font-medium text-sm",
          node.collapsed
            ? "h-full justify-center"
            : "h-8 border-border border-b px-3.5",
        )}
        style={
          node.collapsed
            ? { paddingInline: collapsedHeight / 2 + 10 }
            : undefined
        }
        onDoubleClick={(event) => {
          event.stopPropagation();
          canvas.startRename(node.id);
        }}
      >
        {renaming ? (
          <NodeNameInput
            name={name}
            onValueChange={setDraftName}
            onSave={(value) =>
              canvas.edit((graph) => {
                const requiredWidth = labelWidth(
                  measure.current?.scrollWidth ?? 0,
                  node.width ?? NODE_DEFAULT_WIDTH,
                );
                const next = renameNode(
                  graph,
                  node.id,
                  value.trim() === typeName ? "" : value,
                );
                // A longer rename expands an explicitly resized node; narrowing it afterwards is still allowed.
                return next !== graph &&
                  node.width !== undefined &&
                  requiredWidth > node.width
                  ? setNodeWidth(next, node.id, requiredWidth)
                  : next;
              })
            }
            onDone={() => {
              setDraftName(undefined);
              canvas.finishRename();
            }}
          />
        ) : (
          <span className="truncate" title={name}>
            {name}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
