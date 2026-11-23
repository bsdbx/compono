import {
  Handle,
  Position,
  useConnection,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { GripVertical, Plus, X } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GroupSocket } from "@/api/types";
import { cn } from "@/lib/utils";
import { socketTypeName, WIRE_COLOR } from "./accepts";
import { useCanvas } from "./context";
import {
  addRow,
  type GraphNode,
  insertGroupRow,
  moveRow,
  placeRow,
  removeRow,
  renameSocket,
} from "./graph";
import { NodeNameInput } from "./node-name-input";
import { SocketHandle } from "./socket-handle";
import { useRowDrag } from "./use-row-drag";
import { flowHandle } from "./wiring";

const ROW_HEIGHT = 26;
const NO_ROWS: string[] = [];

/** One shared capsule, with stable, ordered attachment points and direct row controls. */
export function GroupSockets({
  node,
  group,
}: {
  node: GraphNode;
  group: GroupSocket;
}) {
  const canvas = useCanvas();
  const { getZoom } = useReactFlow();
  const savedRows = node.groups[group.id] ?? NO_ROWS;
  const [renaming, setRenaming] = useState<string>();
  const drag = useRowDrag(
    savedRows,
    (row, before) =>
      canvas.edit((graph) => placeRow(graph, node.id, group.id, row, before)),
    getZoom,
  );
  const rows = drag.rows;
  const typeLabel = socketTypeName(group.type);
  const labelFor = (row: string) =>
    node.socketNames?.[`${group.id}/${row}`] ?? typeLabel;
  const rowOrder = rows.join("\n");
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    if (rowOrder) updateNodeInternals(node.id);
  }, [node.id, rowOrder, updateNodeInternals]);
  const connecting = useConnection((connection) => connection.inProgress);
  const color = WIRE_COLOR[group.type.kind ?? "any"];

  function startDrag(event: React.PointerEvent<HTMLElement>, row: string) {
    if (renaming && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    drag.start(event, row);
  }

  return (
    <div
      ref={drag.region}
      className={cn(
        "nodrag nopan relative py-0.5",
        drag.preview && "select-none [&_*]:cursor-grabbing!",
      )}
      data-socket-group={group.id}
      {...drag.handlers}
    >
      <div className="relative flex h-6.5 items-center justify-between pr-2 pl-3 text-muted-foreground">
        {rows.length === 0 ? (
          <SocketHandle
            type="target"
            id={addRow(group.id)}
            socket={group.type}
            side="left"
            offset={-1}
            pill
            label={`Connect ${group.label}`}
          />
        ) : null}
        <span>
          {group.label}
          {rows.length > 0 ? (
            <span className="ml-1.5 text-subtle-foreground text-2xs">
              {rows.length}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          aria-label={`Add ${group.label} input`}
          title="Add input"
          className="nodrag nopan flex size-5 items-center justify-center rounded text-subtle-foreground hover:bg-accent hover:text-foreground"
          onClick={() =>
            canvas.edit((graph) => insertGroupRow(graph, node.id, group.id))
          }
        >
          <Plus className="size-3" />
        </button>
      </div>
      {rows.length > 0 ? (
        <div className="relative">
          <div
            className="pointer-events-none absolute top-0 bottom-0 left-0 z-11 -translate-x-1/2 py-1"
            aria-hidden
          >
            <div
              className="h-full w-2 rounded-full border-[1.5px] bg-card"
              style={{ borderColor: color }}
            />
          </div>
          <div className="absolute inset-y-0 left-0 z-8">
            <SocketHandle
              type="target"
              id={addRow(group.id)}
              socket={group.type}
              side="left"
              offset={-1}
              top={(rows.length * ROW_HEIGHT) / 2}
              height={rows.length * ROW_HEIGHT}
              invisible
              label={`Append ${group.label}`}
            />
          </div>
          <ol ref={drag.list} aria-label={`${group.label} inputs`}>
            {rows.map((row, index) => {
              const socket = `${group.id}/${row}`;
              const label = labelFor(row);
              return (
                <li
                  key={row}
                  data-group={group.id}
                  data-row={row}
                  data-row-placeholder={
                    drag.preview?.valid && drag.preview.row === row
                      ? "true"
                      : undefined
                  }
                  className={cn(
                    "nodrag nopan relative flex h-6.5 cursor-default items-center gap-1 pr-2 pl-2 text-xs",
                    !connecting && "group/socket-row hover:bg-accent/40",
                    connecting && "[&_button]:pointer-events-none",
                    drag.preview?.valid &&
                      drag.preview.row === row &&
                      "bg-accent/60 ring-1 ring-selection/30 ring-inset [&>button]:opacity-30 [&>[data-group-row-label]]:opacity-30",
                  )}
                >
                  <SocketHandle
                    type="target"
                    id={socket}
                    socket={group.type}
                    side="left"
                    offset={-1}
                    invisible
                    label={`${group.label} ${index + 1}: ${label}`}
                  />
                  <button
                    type="button"
                    aria-label={`Reorder ${group.label} ${index + 1}`}
                    title="Drag to reorder · Alt+Up/Down"
                    className="relative z-1 flex size-4.5 shrink-0 touch-none cursor-grab items-center justify-center rounded text-subtle-foreground hover:text-foreground active:cursor-grabbing"
                    onPointerDown={(event) => startDrag(event, row)}
                    onKeyDown={(event) => {
                      if (
                        !event.altKey ||
                        !["ArrowUp", "ArrowDown"].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      canvas.edit((graph) =>
                        moveRow(
                          graph,
                          node.id,
                          group.id,
                          row,
                          event.key === "ArrowUp" ? -1 : 1,
                        ),
                      );
                    }}
                  >
                    <GripVertical className="size-3" />
                  </button>
                  {renaming === row ? (
                    <NodeNameInput
                      name={label}
                      label="Child name"
                      className="text-xs"
                      onSave={(value) =>
                        canvas.edit((graph) =>
                          renameSocket(
                            graph,
                            node.id,
                            group.id,
                            row,
                            value === typeLabel ? "" : value,
                          ),
                        )
                      }
                      onDone={() => setRenaming(undefined)}
                    />
                  ) : (
                    <button
                      type="button"
                      data-group-row-label
                      aria-label={`${group.label} ${index + 1} name`}
                      className="absolute inset-0 cursor-default truncate pr-8 pl-7.5 text-left"
                      title={label}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setRenaming(row);
                      }}
                      onKeyDown={(event) => {
                        if (!["F2", "Enter"].includes(event.key)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setRenaming(row);
                      }}
                    >
                      {label}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${group.label} ${index + 1}`}
                    title="Remove input"
                    className="relative z-1 ml-auto flex size-4.5 shrink-0 items-center justify-center rounded text-subtle-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/socket-row:opacity-100 [@media(pointer:coarse)]:opacity-100"
                    onClick={() =>
                      canvas.edit((graph) =>
                        removeRow(graph, node.id, group.id, row),
                      )
                    }
                  >
                    <X className="size-3" />
                  </button>
                </li>
              );
            })}
          </ol>
          {[...rows, undefined].map((row, index) => (
            <div
              key={row ?? "append"}
              className="pointer-events-none absolute right-2 left-2 z-20"
              style={{ top: index * ROW_HEIGHT }}
            >
              <Handle
                type="target"
                id={flowHandle("target", addRow(group.id, row ?? "$end"))}
                position={Position.Left}
                isConnectableStart={false}
                className={cn(
                  "left-0! top-0! z-20! h-2! w-full! min-w-0! rounded-none! border-0! bg-transparent!",
                  connecting ? "pointer-events-auto!" : "pointer-events-none!",
                )}
                style={{ transform: "translateY(-50%)" }}
              />
            </div>
          ))}
        </div>
      ) : null}
      {drag.preview
        ? createPortal(
            <div
              aria-hidden
              data-row-drag-preview
              className="pointer-events-none fixed z-100 flex origin-top-left items-center gap-1 rounded border border-input bg-card px-2 text-foreground text-xs shadow-xl"
              style={{
                left: drag.preview.x,
                top: drag.preview.y,
                width: drag.preview.width,
                height: drag.preview.height,
                transform: `scale(${drag.preview.zoom})`,
              }}
            >
              <GripVertical className="size-3 shrink-0 text-subtle-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {labelFor(drag.preview.row)}
              </span>
              <X className="size-3 shrink-0 text-subtle-foreground" />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
