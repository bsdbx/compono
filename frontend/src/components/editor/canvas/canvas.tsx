"use client";

import "@xyflow/react/dist/style.css";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  getBezierPath,
  type NodeChange,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useConnection,
  useReactFlow,
  ViewportPortal,
} from "@xyflow/react";
import { ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { NodeTypeInfo } from "@/api/types.gen";
import type { Content, Draft } from "@/components/editor/draft";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { accepts, WIRE_COLOR } from "./accepts";
import { AddNodeMenu, type Choice } from "./add-node-menu";
import {
  CanvasContext,
  type CanvasState,
  inputsOf,
  type Menu,
  socketsOf,
  useCanvas,
} from "./context";
import { useEvaluation, useNodeTypes } from "./data";
import {
  addNode,
  connect,
  disconnect,
  disconnectNode,
  duplicateNodes,
  type Graph,
  moveNodes,
  moveRow,
  newNode,
  readGraph,
  removeNodes,
  removeRow,
  type SocketType,
  type XY,
} from "./graph";
import { History } from "./history";
import { type CanvasNode, NodeView } from "./node-view";
import { PropertiesPanel, PropertiesPlaceholder } from "./panel";
import { MENU_ITEM, MENU_SEPARATOR, PointerMenu } from "./pointer-menu";

const NODE_VIEWS = { graph: NodeView };

/** Where the Add node menu opens, and the output a wire was dragged from, if it was. */
type Adding = {
  x: number;
  y: number;
  at: XY;
  from?: { node: string; socket: string; type: SocketType; start: XY };
};

type Known = Pick<CanvasState, "evaluated" | "nodeTypes">;

function inputType(
  graph: Graph,
  known: Known,
  node: string,
  socket: string,
): SocketType | undefined {
  const into = graph.nodes.find((each) => each.id === node);
  if (into === undefined) {
    return undefined;
  }

  const sockets = socketsOf(known, into.id, into.type);
  const group = socket.split("/")[0] ?? "";
  return (
    inputsOf(known, into).find((each) => each.id === socket)?.type ??
    (socket.includes("/") &&
    (into.groups[group] ?? []).includes(socket.slice(group.length + 1))
      ? sockets.groups.find((each) => each.id === group)?.type
      : undefined)
  );
}

function outputType(
  graph: Graph,
  known: Known,
  node: string,
  socket: string,
): SocketType | undefined {
  const from = graph.nodes.find((each) => each.id === node);
  return from
    ? socketsOf(known, from.id, from.type).outputs.find(
        (each) => each.id === socket,
      )?.type
    : undefined;
}

/** The wire being dragged, in the color of the socket it comes from. */
function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  fromHandle,
}: ConnectionLineComponentProps<CanvasNode>) {
  const canvas = useCanvas();
  const type =
    fromHandle.type === "source"
      ? outputType(canvas.graph, canvas, fromHandle.nodeId, fromHandle.id ?? "")
      : inputType(canvas.graph, canvas, fromHandle.nodeId, fromHandle.id ?? "");
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  return (
    <path
      d={path}
      fill="none"
      stroke={WIRE_COLOR[type?.kind ?? "any"]}
      strokeWidth={1.5}
    />
  );
}

function editing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function toFlow(node: Graph["nodes"][number], before?: CanvasNode): CanvasNode {
  return {
    ...before,
    id: node.id,
    type: "graph",
    position: node.position,
    data: {},
  };
}

function Flow({
  draft,
  content,
  nodeTypes,
  panel,
  show,
  hidden,
}: {
  draft: Draft;
  content: Content;
  nodeTypes: ReadonlyMap<string, NodeTypeInfo>;
  panel: HTMLElement | null;
  show: { node: string; at: number } | undefined;
  hidden: boolean;
}) {
  const flow = useReactFlow<CanvasNode>();
  const wrapper = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => readGraph(content.graph), [content.graph]);
  const evaluation = useEvaluation(graph);
  const evaluated = useMemo(
    () => new Map(Object.entries(evaluation?.nodes ?? {})),
    [evaluation],
  );
  const [history] = useState(() => new History<Graph>());
  const [nodes, setNodes] = useState<CanvasNode[]>(() =>
    graph.nodes.map((node) => toFlow(node)),
  );
  const [selectedWires, setSelectedWires] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [menu, setMenu] = useState<Menu>();
  const [adding, setAdding] = useState<Adding>();

  // Nodes an edit adds, to select once they're on the canvas
  const selectNext = useRef<ReadonlySet<string>>(undefined);

  // React Flow's nodes follow the graph, keeping their selection and measured size
  useEffect(() => {
    const select = selectNext.current;
    selectNext.current = undefined;
    setNodes((current) => {
      const before = new Map(current.map((node) => [node.id, node]));
      return graph.nodes.map((node) => {
        const previous = before.get(node.id);
        const moved =
          previous === undefined ||
          previous.position.x !== node.position.x ||
          previous.position.y !== node.position.y;
        const next = moved ? toFlow(node, previous) : previous;
        return select ? { ...next, selected: select.has(node.id) } : next;
      });
    });
  }, [graph.nodes]);

  // The Preview's Show node selects a node and brings it into view
  useEffect(() => {
    if (show === undefined) {
      return;
    }

    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === show.node })),
    );
    void flow.fitView({
      nodes: [{ id: show.node }],
      maxZoom: 1,
      padding: 0.5,
      duration: 200,
    });
  }, [show, flow]);

  /** The graph as it is now, even before React has drawn the last change. */
  const latest = useCallback((): Graph => {
    const now = draft.getSnapshot().content;
    return now ? readGraph(now.graph) : graph;
  }, [draft, graph]);

  const save = useCallback(
    (next: Graph) =>
      draft.change({
        graph: next as unknown as Content["graph"],
        screen_sizes: content.screen_sizes,
      }),
    [draft, content.screen_sizes],
  );

  const edit = useCallback(
    (change: (graph: Graph) => Graph, key?: string) => {
      const current = latest();
      const next = change(current);
      if (next !== current) {
        history.record(current, key);
        save(next);
      }
    },
    [latest, history, save],
  );

  const undo = useCallback(() => {
    const previous = history.undo(latest());
    if (previous) {
      save(previous);
    }
  }, [history, latest, save]);

  const redo = useCallback(() => {
    const next = history.redo(latest());
    if (next) {
      save(next);
    }
  }, [history, latest, save]);

  const selectAll = useCallback(
    () =>
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: true })),
      ),
    [],
  );

  const duplicate = useCallback(
    (ids: string[]) => {
      edit((current) => {
        const done = duplicateNodes(current, ids);
        if (done.copies.length > 0) {
          selectNext.current = new Set(done.copies);
        }
        return done.graph;
      });
    },
    [edit],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        hidden ||
        editing(event.target) ||
        !(event.metaKey || event.ctrlKey)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "a") {
        event.preventDefault();
        selectAll();
      } else if (key === "d") {
        event.preventDefault();
        duplicate(nodes.filter((node) => node.selected).map((node) => node.id));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, selectAll, duplicate, nodes, hidden]);

  // A wire is refused when the API refuses it, or when its types plainly don't fit
  const refused = useMemo(() => {
    const known = { evaluated, nodeTypes };
    return new Set(
      graph.wires
        .filter((wire) => {
          const out = outputType(
            graph,
            known,
            wire.from.node,
            wire.from.socket,
          );
          const into = inputType(graph, known, wire.to.node, wire.to.socket);
          return (
            evaluation?.wires[wire.id] !== undefined ||
            (out !== undefined && into !== undefined && !accepts(into, out))
          );
        })
        .map((wire) => wire.id),
    );
  }, [graph, evaluated, nodeTypes, evaluation]);

  const canvas: CanvasState = useMemo(
    () => ({ graph, nodeTypes, evaluated, refused, edit, openMenu: setMenu }),
    [graph, nodeTypes, evaluated, refused, edit],
  );

  // The input a wire is being dragged onto: a wire already in it is the one it replaces
  const replacing = useConnection<CanvasNode, string | undefined>(
    (connection) =>
      connection.inProgress && connection.toHandle?.type === "target"
        ? `${connection.toHandle.nodeId}\n${connection.toHandle.id}`
        : undefined,
  );

  // Wires whose sockets are on the canvas
  const edges: Edge[] = graph.wires.flatMap((wire) => {
    const out = outputType(graph, canvas, wire.from.node, wire.from.socket);
    const into = inputType(graph, canvas, wire.to.node, wire.to.socket);
    if (out === undefined || into === undefined) {
      return [];
    }

    const red = refused.has(wire.id);
    const replaced = replacing === `${wire.to.node}\n${wire.to.socket}`;
    const selected = selectedWires.has(wire.id);
    return [
      {
        id: wire.id,
        source: wire.from.node,
        sourceHandle: wire.from.socket,
        target: wire.to.node,
        targetHandle: wire.to.socket,
        selected,
        ...(red
          ? {
              ariaLabel: evaluation?.wires[wire.id] ?? "Refused",
              className: "refused",
            }
          : {}),
        style: {
          stroke: red ? "var(--error)" : WIRE_COLOR[out.kind ?? "any"],
          strokeWidth: selected ? 2.5 : 1.5,
          ...(replaced ? { strokeDasharray: "5 4", opacity: 0.6 } : {}),
        },
      },
    ];
  });

  function onNodesChange(changes: NodeChange<CanvasNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current));
  }

  function onEdgesChange(changes: EdgeChange[]) {
    setSelectedWires((current) => {
      const next = new Set(current);
      for (const change of changes) {
        if (change.type === "select") {
          if (change.selected) {
            next.add(change.id);
          } else {
            next.delete(change.id);
          }
        } else if (change.type === "remove") {
          next.delete(change.id);
        }
      }
      return next;
    });
  }

  function onConnect(connection: Connection) {
    if (connection.sourceHandle && connection.targetHandle) {
      edit((current) =>
        connect(
          current,
          {
            node: connection.source,
            socket: connection.sourceHandle as string,
          },
          {
            node: connection.target,
            socket: connection.targetHandle as string,
          },
        ),
      );
    }
  }

  function at(clientX: number, clientY: number) {
    const box = wrapper.current?.getBoundingClientRect();
    return {
      x: clientX - (box?.left ?? 0),
      y: clientY - (box?.top ?? 0),
      at: flow.screenToFlowPosition({ x: clientX, y: clientY }),
    };
  }

  // A wire dropped on the canvas offers the nodes that take it
  function onConnectEnd(
    event: MouseEvent | TouchEvent,
    state: FinalConnectionState,
  ) {
    const handle = state.fromHandle;
    if (
      state.from === null ||
      state.isValid ||
      state.toHandle ||
      handle?.type !== "source" ||
      !handle.id
    ) {
      return;
    }
    const type = outputType(graph, canvas, handle.nodeId, handle.id);
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    if (type === undefined || point === undefined) {
      return;
    }
    setAdding({
      ...at(point.clientX, point.clientY),
      from: { node: handle.nodeId, socket: handle.id, type, start: state.from },
    });
  }

  function onChoose({ nodeType, input }: Choice) {
    if (adding === undefined) {
      return;
    }
    const node = newNode(nodeType.type, adding.at);
    const from = adding.from;
    edit((current) => {
      const added = addNode(current, node);
      return from && input
        ? connect(
            added,
            { node: from.node, socket: from.socket },
            { node: node.id, socket: input },
          )
        : added;
    });
    selectNext.current = new Set([node.id]);
    setAdding(undefined);
  }

  // A graph has one of some nodes, like Component Input
  const unavailable = new Set(
    [...nodeTypes.values()]
      .filter(
        (nodeType) =>
          nodeType.single &&
          graph.nodes.some((node) => node.type === nodeType.type),
      )
      .map((nodeType) => nodeType.type),
  );
  const selected = nodes.filter((node) => node.selected).map((node) => node.id);

  function menuItems(open: Menu) {
    switch (open.kind) {
      case "canvas":
        return (
          <>
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={() => setAdding(at(open.x, open.y))}
            >
              <span className="flex-1">Add node</span>
              <ChevronRight className="size-3.5 text-subtle-foreground" />
            </DropdownMenuItem>
            <DropdownMenuSeparator className={MENU_SEPARATOR} />
            <DropdownMenuItem className={MENU_ITEM} onSelect={selectAll}>
              Select all
            </DropdownMenuItem>
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={() =>
                void flow.fitView({ maxZoom: 1, padding: 0.2, duration: 200 })
              }
            >
              Fit to view
            </DropdownMenuItem>
          </>
        );
      case "node": {
        // A right click on a selected node acts on the whole selection
        const ids = selected.includes(open.node) ? selected : [open.node];
        return (
          <>
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={() => duplicate(ids)}
            >
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={() =>
                edit((current) => ids.reduce(disconnectNode, current))
              }
            >
              Disconnect all
            </DropdownMenuItem>
            <DropdownMenuSeparator className={MENU_SEPARATOR} />
            <DropdownMenuItem
              variant="destructive"
              className={MENU_ITEM}
              onSelect={() =>
                edit((current) => removeNodes(current, new Set(ids)))
              }
            >
              Delete
            </DropdownMenuItem>
          </>
        );
      }
      case "row": {
        const rows =
          graph.nodes.find((node) => node.id === open.node)?.groups[
            open.group
          ] ?? [];
        const index = rows.indexOf(open.row);
        return (
          <>
            <DropdownMenuItem
              className={MENU_ITEM}
              disabled={index <= 0}
              onSelect={() =>
                edit((current) =>
                  moveRow(current, open.node, open.group, open.row, -1),
                )
              }
            >
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              className={MENU_ITEM}
              disabled={index === -1 || index >= rows.length - 1}
              onSelect={() =>
                edit((current) =>
                  moveRow(current, open.node, open.group, open.row, 1),
                )
              }
            >
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator className={MENU_SEPARATOR} />
            <DropdownMenuItem
              variant="destructive"
              className={MENU_ITEM}
              onSelect={() =>
                edit((current) =>
                  removeRow(current, open.node, open.group, open.row),
                )
              }
            >
              Remove
            </DropdownMenuItem>
          </>
        );
      }
    }
  }

  return (
    <CanvasContext value={canvas}>
      {/* The properties panel is in the right column, beside the canvas */}
      {panel
        ? createPortal(<PropertiesPanel selected={selected} />, panel)
        : null}
      <div ref={wrapper} className="relative h-full w-full">
        <ReactFlow<CanvasNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_VIEWS}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          connectionLineComponent={ConnectionLine}
          // A wire into a socket that just appeared draws once React Flow has measured the socket
          onError={(code, message) => {
            if (code !== "008") {
              console.warn(message);
            }
          }}
          // The Add node menu stays where it opened, so moving the canvas closes it
          onMoveStart={() => setAdding(undefined)}
          onNodeDragStop={(_, __, moved) =>
            edit((current) =>
              moveNodes(
                current,
                new Map(
                  moved.map((node) => [
                    node.id,
                    {
                      x: Math.round(node.position.x),
                      y: Math.round(node.position.y),
                    },
                  ]),
                ),
              ),
            )
          }
          onDelete={({ nodes: removed, edges: cut }) =>
            edit((current) =>
              disconnect(
                removeNodes(current, new Set(removed.map((node) => node.id))),
                new Set(cut.map((wire) => wire.id)),
              ),
            )
          }
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setMenu({ kind: "canvas", x: event.clientX, y: event.clientY });
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            // A right click selects the node, unless it's already in the selection
            if (!node.selected) {
              setNodes((current) =>
                current.map((each) => ({
                  ...each,
                  selected: each.id === node.id,
                })),
              );
              setSelectedWires(new Set());
            }
            const row = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-row]",
            );
            setMenu(
              row?.dataset.row && row.dataset.group
                ? {
                    kind: "row",
                    x: event.clientX,
                    y: event.clientY,
                    node: node.id,
                    group: row.dataset.group,
                    row: row.dataset.row,
                  }
                : {
                    kind: "node",
                    x: event.clientX,
                    y: event.clientY,
                    node: node.id,
                  },
            );
          }}
          colorMode="dark"
          style={{ background: "transparent" }}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1]}
          panOnScroll
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          // While the code shows, its keys aren't the canvas's
          deleteKeyCode={hidden ? null : ["Delete", "Backspace"]}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="var(--input)"
          />
          {/* The wire dropped on the canvas waits for its node, dashed */}
          {adding?.from ? (
            <ViewportPortal>
              <svg
                aria-hidden
                width={1}
                height={1}
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
              >
                <path
                  d={
                    getBezierPath({
                      sourceX: adding.from.start.x,
                      sourceY: adding.from.start.y,
                      sourcePosition: Position.Right,
                      targetX: adding.at.x,
                      targetY: adding.at.y,
                      targetPosition: Position.Left,
                    })[0]
                  }
                  fill="none"
                  stroke={WIRE_COLOR[adding.from.type.kind ?? "any"]}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              </svg>
            </ViewportPortal>
          ) : null}
        </ReactFlow>
        {menu ? (
          <PointerMenu x={menu.x} y={menu.y} onClose={() => setMenu(undefined)}>
            {menuItems(menu)}
          </PointerMenu>
        ) : null}
        {adding ? (
          <AddNodeMenu
            x={adding.x}
            // A dropped wire meets the menu's edge just below its top
            y={adding.from ? adding.y - 11 : adding.y}
            nodeTypes={[...nodeTypes.values()]}
            unavailable={unavailable}
            from={adding.from?.type}
            onChoose={onChoose}
            onClose={() => setAdding(undefined)}
          />
        ) : null}
      </div>
    </CanvasContext>
  );
}

/** The open component's graph: nodes to add, wire, select, move and delete, with undo and redo. */
export function Canvas({
  draft,
  panel = null,
  show,
  hidden = false,
}: {
  draft: Draft;
  /** Where the properties panel goes */
  panel?: HTMLElement | null;
  /** A node to select and bring into view */
  show?: { node: string; at: number } | undefined;
  /** Out of sight while the code shows, keeping its history and selection */
  hidden?: boolean;
}) {
  const { content } = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  const nodeTypes = useNodeTypes();
  if (content === undefined || nodeTypes === undefined) {
    return panel ? createPortal(<PropertiesPlaceholder />, panel) : null;
  }
  return (
    <ReactFlowProvider>
      <Flow
        draft={draft}
        content={content}
        nodeTypes={nodeTypes}
        panel={panel}
        show={show}
        hidden={hidden}
      />
    </ReactFlowProvider>
  );
}
