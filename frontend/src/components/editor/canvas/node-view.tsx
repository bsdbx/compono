import {
  type Node,
  type NodeProps,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { memo, type ReactNode, useLayoutEffect } from "react";
import type { GroupSocket, InputSocket, NodeProperty } from "@/api/types";
import { cn } from "@/lib/utils";
import { choiceOptions, inputsOf, socketsOf, useCanvas } from "./context";
import { ChoiceField, NumberField, TextField, Toggle } from "./fields";
import {
  addRow,
  type GraphNode,
  groupPropertyId,
  inPropertyOrder,
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
const TYPED: ReadonlySet<string> = new Set([
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
  const canvas = useCanvas();
  // An exposed property keeps its value as a property
  const exposed = node.exposed.includes(input.id);
  const inline = exposed
    ? canvas.nodeTypes
        .get(node.type)
        ?.properties.find(
          (property) => property.on_node && property.id === input.id,
        )
    : undefined;
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
      ) : inline ? (
        <OnNodeValue node={node} property={inline} />
      ) : (
        <Field
          label={input.label}
          type={input.type}
          value={value}
          onChange={(next) =>
            canvas.edit(
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

/** The value a node like Number gives, edited on the node as an output value or exposed input. */
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

type SocketRow =
  | { id: string; input: InputSocket }
  | { id: string; before: string | null; group: GroupSocket };

function NodeViewContent({ id, selected }: NodeProps<CanvasNode>) {
  const canvas = useCanvas();
  const node = canvas.graph.nodes.find((each) => each.id === id);
  const sockets = node && socketsOf(canvas, id, node.type);
  const inputs =
    node &&
    sockets &&
    inPropertyOrder<SocketRow>(
      [
        ...inputsOf(canvas, node, true).map((input) => ({
          id: input.id,
          input,
        })),
        ...sockets.groups.map((group) => ({
          id: groupPropertyId(group.id),
          before: group.before,
          group,
        })),
      ],
      node.propertyOrder,
    ).filter((row) => "group" in row || !node.unexposed?.includes(row.id));
  const inputOrder = inputs
    ?.flatMap((row) =>
      "group" in row && node?.collapsed
        ? [
            row.id,
            ...(node.groups[row.group.id] ?? []).map(
              (id) => `${row.group.id}/${id}`,
            ),
          ]
        : row.id,
    )
    .join("\n");
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    // Socket positions can change while the node's outer dimensions stay the same.
    if (inputOrder !== undefined) updateNodeInternals(id);
  }, [id, inputOrder, updateNodeInternals]);

  if (!node || !inputs || !sockets) {
    return null;
  }
  const nodeType = canvas.nodeTypes.get(node.type);
  const evaluated = canvas.evaluated.get(id);
  const onNode =
    nodeType?.properties.filter(
      (property) =>
        property.on_node &&
        !node.exposed.includes(property.id) &&
        !node.unexposed?.includes(property.id),
    ) ?? [];
  // A refused wire leaves the input's field, which the node still uses
  const wired = new Set(
    canvas.graph.wires
      .filter((wire) => wire.to.node === id && !canvas.refused.has(wire.id))
      .map((wire) => wire.to.socket),
  );
  const error = evaluated?.error;
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
  for (const row of inputs) {
    if ("group" in row) {
      groupRows(row.group);
      continue;
    }
    const { input } = row;
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
