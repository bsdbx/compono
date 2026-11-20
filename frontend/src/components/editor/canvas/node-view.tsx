import type { Node, NodeProps } from "@xyflow/react";
import { memo, type ReactNode } from "react";
import type { GroupSocket, InputSocket, NodeProperty } from "@/api/types";
import { cn } from "@/lib/utils";
import { choiceOptions, inputsOf, socketsOf, useCanvas } from "./context";
import { ChoiceField, NumberField, TextField, Toggle } from "./fields";
import {
  addRow,
  type GraphNode,
  type SocketType,
  setProperty,
  setValue,
} from "./graph";
import { GroupSockets } from "./group-sockets";
import { NodeFrame } from "./node-frame";
import { collapsedHeight, collapsedSocket } from "./node-size";
import { SocketHandle } from "./socket-handle";

export type CanvasNode = Node<Record<string, never>, "graph">;

/** The kinds of input that are typed in a field on the node, when nothing is wired in. */
export const TYPED: ReadonlySet<string> = new Set([
  "boolean",
  "number",
  "text",
  "choice",
]);

function AddSocket({
  group,
  socket,
  offset = -1,
  top,
  label,
}: {
  group: string;
  socket: SocketType;
  offset?: number;
  top?: number;
  label?: string;
}) {
  return (
    <SocketHandle
      type="target"
      id={addRow(group)}
      socket={socket}
      side="left"
      offset={offset}
      {...(top === undefined ? {} : { top })}
      pill
      label={label ?? `Add ${group}`}
    />
  );
}

type CompactSocket = {
  id: string;
  label: string;
  type: SocketType;
  add?: string;
};

/** Every socket stays available around the rounded ends, including group rows and Add. */
function CollapsedSockets({
  inputs,
  outputs,
  height,
}: {
  inputs: readonly CompactSocket[];
  outputs: readonly CompactSocket[];
  height: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {(
        [
          ["left", inputs],
          ["right", outputs],
        ] as const
      ).flatMap(([side, sockets]) =>
        sockets.map((socket, index) => {
          const { top, inset } = collapsedSocket(index, sockets.length, height);
          return socket.add ? (
            <AddSocket
              key={`${side}:${socket.id}`}
              group={socket.add}
              socket={socket.type}
              label={socket.label}
              offset={inset}
              top={top}
            />
          ) : (
            <SocketHandle
              key={`${side}:${socket.id}`}
              id={socket.id}
              label={socket.label}
              socket={socket.type}
              type={side === "left" ? "target" : "source"}
              side={side}
              offset={inset}
              top={top}
            />
          );
        }),
      )}
    </div>
  );
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
        <span className="truncate text-foreground/90">{input.label}</span>
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
  const error = evaluated?.error;
  // Groups sit before the input they name, the rest after the inputs
  const rows: ReactNode[] = [];
  const compactInputs: CompactSocket[] = [];
  const groupRows = (group: GroupSocket) => {
    rows.push(
      <GroupSockets key={`group:${group.id}`} node={node} group={group} />,
    );
    compactInputs.push(
      ...(node.groups[group.id] ?? []).map((row, index) => ({
        id: `${group.id}/${row}`,
        label: `${group.label} ${index + 1}`,
        type: group.type,
      })),
      {
        id: addRow(group.id),
        label: `Add ${group.label}`,
        type: group.type,
        add: group.id,
      },
    );
  };
  for (const input of inputs) {
    for (const group of sockets.groups.filter(
      (each) => each.before === input.id,
    )) {
      groupRows(group);
    }
    rows.push(
      <InputRow
        key={`input:${input.id}`}
        node={node}
        input={input}
        wired={wired.has(input.id)}
      />,
    );
    compactInputs.push(input);
  }
  for (const group of sockets.groups.filter(
    (each) => !inputs.some((input) => input.id === each.before),
  )) {
    groupRows(group);
  }
  const compactHeight = collapsedHeight(
    compactInputs.length,
    sockets.outputs.length,
  );

  return (
    <NodeFrame
      node={node}
      typeName={nodeType?.name ?? node.type}
      selected={selected}
      error={Boolean(error)}
      skipped={evaluated?.skipped ?? false}
      collapsedHeight={compactHeight}
    >
      {node.collapsed ? (
        <CollapsedSockets
          inputs={compactInputs}
          outputs={sockets.outputs}
          height={compactHeight}
        />
      ) : (
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
      )}
    </NodeFrame>
  );
}

/** One node on the canvas, drawn from its sockets. Node types have no UI code of their own. */
export const NodeView = memo(NodeViewContent);
