"use client";

import {
  Handle,
  type Node,
  type NodeProps,
  Position,
  useStore,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { GroupSocket, InputSocket, NodeProperty } from "@/api/types.gen";
import { cn } from "@/lib/utils";
import {
  type CanvasState,
  choiceOptions,
  inputsOf,
  socketsOf,
  useCanvas,
} from "./context";
import { ChoiceField, NumberField, TextField, Toggle } from "./fields";
import {
  addRow,
  type GraphNode,
  type SocketType,
  setProperty,
  setValue,
} from "./graph";

export type CanvasNode = Node<Record<string, never>, "graph">;

const HANDLE = "size-2.5! min-h-0! min-w-0! rounded-full!";

/** The kinds of input that are typed in a field on the node, when nothing is wired in. */
export const TYPED: ReadonlySet<string> = new Set([
  "boolean",
  "number",
  "text",
  "choice",
]);

function SocketHandle({
  type,
  id,
  socket,
  side,
  offset = 0,
}: {
  type: "source" | "target";
  id: string;
  socket: SocketType | undefined;
  side: "left" | "right";
  offset?: number;
}) {
  const kind = socket?.kind ?? "any";
  return (
    <Handle
      type={type}
      id={id}
      position={side === "left" ? Position.Left : Position.Right}
      // Inline, over React Flow's own handle style
      style={{
        ...(side === "left" ? { left: offset } : { right: offset }),
        // A Slot is a ring: the place an element goes
        ...(kind === "slot"
          ? {
              background: "var(--card)",
              border: "2px solid var(--socket-element)",
            }
          : { background: `var(--socket-${kind})`, border: 0 }),
      }}
      className={HANDLE}
    />
  );
}

/** What a wired value looks like in one word, for a group's row: an element's tag, or a text. */
function summary(canvas: CanvasState, node: string, socket: string): string {
  const value = canvas.evaluated.get(node)?.outputs[socket];
  if (typeof value === "object" && value !== null && "tag" in value) {
    return String(value.tag) || "Fragment";
  }
  if (typeof value === "string" && value !== "") {
    return value;
  }
  const from = canvas.graph.nodes.find((each) => each.id === node);
  return (from && canvas.nodeTypes.get(from.type)?.name) ?? "Empty";
}

/** A field to type an input's value in, for the types that can be typed. */
function Field({
  label,
  type,
  value,
  onChange,
  showLabel = true,
}: {
  label: string;
  type: SocketType;
  value: unknown;
  onChange: (value: unknown) => void;
  showLabel?: boolean;
}): ReactNode {
  switch (type.kind) {
    case "choice":
      return (
        <ChoiceField
          label={label}
          value={typeof value === "string" ? value : ""}
          options={type.options}
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <span className="flex h-5.5 w-full items-center justify-between gap-2">
          <span className="text-muted-foreground">{label}</span>
          <Toggle label={label} value={value === true} onChange={onChange} />
        </span>
      );
    case "number":
      return (
        <NumberField
          label={label}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
        />
      );
    case "text":
      return (
        <TextField
          label={label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          showLabel={showLabel}
        />
      );
    default:
      // Elements and the like come along wires only
      return <span className="text-muted-foreground">{label}</span>;
  }
}

function InputRow({
  node,
  input,
  wired,
}: {
  node: GraphNode;
  input: InputSocket;
  wired: boolean;
}) {
  const { edit } = useCanvas();
  // An exposed property keeps its value as a property
  const exposed = node.exposed.includes(input.id);
  const value = exposed
    ? (node.properties[input.id] ?? input.default)
    : (node.values[input.id] ?? input.default);
  const field = !wired && TYPED.has(input.type.kind ?? "any");
  return (
    <div
      className={cn(
        "relative flex items-center",
        // Fields sit closer to the edge than labels
        field ? "min-h-6.5 px-2.5" : "min-h-5.5 px-3.5",
      )}
    >
      <SocketHandle
        type="target"
        id={input.id}
        socket={input.type}
        side="left"
      />
      {wired ? (
        <span className="text-foreground/90">{input.label}</span>
      ) : (
        <Field
          label={input.label}
          type={input.type}
          value={value}
          onChange={(next) =>
            edit(
              (graph) =>
                exposed
                  ? setProperty(graph, node.id, input.id, next)
                  : setValue(graph, node.id, input.id, next),
              `value:${node.id}:${input.id}`,
            )
          }
        />
      )}
    </div>
  );
}

function GroupRows({ node, group }: { node: GraphNode; group: GroupSocket }) {
  const canvas = useCanvas();
  const rows = node.groups[group.id] ?? [];
  return (
    <div className="mx-2.5 my-0.5 rounded-md border border-node-group-border bg-node-group">
      <div className="flex h-5.5 items-center justify-between px-2 text-muted-foreground">
        <span>{group.label}</span>
        {rows.length > 0 ? (
          <span className="text-subtle-foreground">{rows.length}</span>
        ) : null}
      </div>
      {rows.map((row, index) => {
        const socket = `${group.id}/${row}`;
        const wire = canvas.graph.wires.find(
          (each) => each.to.node === node.id && each.to.socket === socket,
        );
        return (
          <div
            key={row}
            // The canvas opens the row's menu for a right click here
            data-group={group.id}
            data-row={row}
            className="relative flex h-5.5 items-center gap-2 border-node-group-line border-t px-2"
          >
            {/* At the node's edge, past the group's margin and border */}
            <SocketHandle
              type="target"
              id={socket}
              socket={group.type}
              side="left"
              offset={-11}
            />
            <span className="w-3 text-subtle-foreground">{index + 1}</span>
            <span className="truncate">
              {wire
                ? summary(canvas, wire.from.node, wire.from.socket)
                : "Empty"}
            </span>
          </div>
        );
      })}
      <div className="relative flex h-5.5 items-center border-node-group-line border-t px-2 text-subtle-foreground">
        <Handle
          type="target"
          id={addRow(group.id)}
          position={Position.Left}
          style={{ left: -11 }}
          className="flex! size-3.5! min-h-0! min-w-0! items-center justify-center rounded-full! border! border-muted-foreground! bg-card!"
        >
          <Plus className="pointer-events-none size-2.5 text-foreground" />
        </Handle>
        Add
      </div>
    </div>
  );
}

/** The value a node like Number gives, set on the node beside its output. */
function OnNodeValue({
  node,
  property,
}: {
  node: GraphNode;
  property: NodeProperty;
}) {
  const canvas = useCanvas();
  const value = node.properties[property.id] ?? property.default;
  const change = (next: unknown) =>
    canvas.edit(
      (graph) => setProperty(graph, node.id, property.id, next),
      `property:${node.id}:${property.id}`,
    );
  // A Choice node offers the options of the inputs it's wired into
  if (node.type === "choice") {
    const options = choiceOptions(canvas, node.id);
    if (options.length > 0) {
      return (
        <ChoiceField
          label={property.label}
          value={typeof value === "string" ? value : ""}
          options={options}
          onChange={change}
        />
      );
    }
  }
  return (
    <Field
      label={property.label}
      type={property.type}
      value={value}
      onChange={change}
      // A Text node's value is its whole field
      showLabel={property.type.kind !== "text"}
    />
  );
}

function NodeViewContent({ id, selected }: NodeProps<CanvasNode>) {
  const canvas = useCanvas();
  // Nodes in a box selection take its tint
  const boxed = useStore((state) => state.nodesSelectionActive) && selected;
  const node = canvas.graph.nodes.find((each) => each.id === id);
  if (node === undefined) {
    return null;
  }
  const nodeType = canvas.nodeTypes.get(node.type);
  const evaluated = canvas.evaluated.get(id);
  const sockets = socketsOf(canvas, id, node.type);
  const inputs = inputsOf(canvas, node);
  const onNode =
    nodeType?.properties.filter((property) => property.on_node) ?? [];
  // A refused wire leaves the input's field, which the node still uses
  const wired = new Set(
    canvas.graph.wires
      .filter((wire) => wire.to.node === id && !canvas.refused.has(wire.id))
      .map((wire) => wire.to.socket),
  );
  // Nodes with fields have one width; the rest fit their labels
  const fields =
    onNode.length > 0 ||
    sockets.groups.length > 0 ||
    inputs.some((input) => TYPED.has(input.type.kind ?? "any"));
  const error = evaluated?.error;
  // Groups sit before the input they name, the rest after the inputs
  const rows: ReactNode[] = [];
  for (const input of inputs) {
    for (const group of sockets.groups.filter(
      (each) => each.before === input.id,
    )) {
      rows.push(
        <GroupRows key={`group:${group.id}`} node={node} group={group} />,
      );
    }
    rows.push(
      <InputRow
        key={`input:${input.id}`}
        node={node}
        input={input}
        wired={wired.has(input.id)}
      />,
    );
  }
  for (const group of sockets.groups.filter(
    (each) => !inputs.some((input) => input.id === each.before),
  )) {
    rows.push(
      <GroupRows key={`group:${group.id}`} node={node} group={group} />,
    );
  }

  return (
    <div
      data-node-type={node.type}
      className={cn(
        "rounded-xl border text-foreground text-xs shadow-black/40 shadow-xl",
        fields ? "w-47" : "w-max min-w-42 max-w-60",
        boxed
          ? "bg-[color-mix(in_srgb,var(--selection)_6%,var(--card))]"
          : "bg-card",
        error
          ? "border-error/45"
          : selected
            ? "border-selection/40"
            : "border-input",
        evaluated?.skipped ? "opacity-70" : "",
      )}
    >
      <div className="flex h-8 items-center border-border border-b px-3.5 font-medium text-sm">
        {nodeType?.name ?? node.type}
      </div>
      <div className="flex flex-col gap-1 pt-2 pb-2.5">
        {sockets.outputs.map((output, index) => (
          <div
            key={output.id}
            className={cn(
              "relative flex items-center justify-end gap-2",
              index === 0 && onNode.length > 0
                ? "min-h-6.5 px-2.5"
                : "min-h-5.5 px-3.5",
            )}
          >
            {index === 0 && onNode.length > 0 ? (
              onNode.map((property) => (
                <OnNodeValue
                  key={property.id}
                  node={node}
                  property={property}
                />
              ))
            ) : (
              <span className="truncate text-muted-foreground">
                {output.label}
              </span>
            )}
            <SocketHandle
              type="source"
              id={output.id}
              socket={output.type}
              side="right"
            />
          </div>
        ))}
        {rows}
        {error ? (
          <p
            role="alert"
            className="mx-2.5 mt-1 rounded-md bg-error/8 px-2.5 py-0.5 text-error"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** One node on the canvas, drawn from its sockets. Node types have no UI code of their own. */
export const NodeView = memo(NodeViewContent);
