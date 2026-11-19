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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { NodeTypeInfo } from "@/api/types";
import type { Content, Draft } from "@/components/editor/draft";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { accepts, WIRE_COLOR } from "./accepts";
import { AddNodeMenu, type Choice } from "./add-node-menu";
import { useBoxSelection } from "./box-selection";
import {
  CanvasContext,
  type CanvasState,
  inputType,
  type Menu,
  outputType,
  useCanvas,
} from "./context";
import { useEvaluation, useNodeTypes } from "./data";
import { dissolveNodes } from "./dissolve";
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
// A stable prop lets queued fit commands keep their own nodes and animation options.
const INITIAL_VIEW = { maxZoom: 1, padding: 0.3 };

/** Where the Add node menu opens, and the output a wire was dragged from, if it was. */
type Adding = {
  x: number;
  y: number;
  at: XY;
  from?: { node: string; socket: string; type: SocketType; start: XY };
  embedded?: boolean;
};

type Placement = {
  graph: Graph;
  nodes: ReadonlySet<string>;
  anchor: XY;
  position: XY;
  centered?: string;
  before: ReadonlySet<string>;
};

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
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.closest(
        '[role="combobox"], [role="menu"], [role="listbox"], [role="dialog"]',
      ) !== null)
  );
}

function toFlow(
  node: Graph["nodes"][number],
  before?: CanvasNode,
  centered = false,
): CanvasNode {
  return {
    ...before,
    id: node.id,
    type: "graph",
    position: node.position,
    data: {},
    origin: centered ? [0.5, 0.5] : [0, 0],
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
  const pointer = useRef<XY>(undefined);
  const [placement, setPlacement] = useState<Placement>();
  const savedGraph = useMemo(() => readGraph(content.graph), [content.graph]);
  const graph = useMemo(
    () =>
      placement
        ? moveNodes(
            placement.graph,
            new Map(
              placement.graph.nodes
                .filter((node) => placement.nodes.has(node.id))
                .map((node) => [
                  node.id,
                  {
                    x:
                      node.position.x +
                      placement.position.x -
                      placement.anchor.x,
                    y:
                      node.position.y +
                      placement.position.y -
                      placement.anchor.y,
                  },
                ]),
            ),
          )
        : savedGraph,
    [placement, savedGraph],
  );
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
  const boxSelection = useBoxSelection(
    flow,
    wrapper,
    setNodes,
    setSelectedWires,
  );
  const ignorePlacementClick = useRef(false);

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
        const centered = node.id === placement?.centered;
        const origin = centered ? 0.5 : 0;
        const moved =
          previous === undefined ||
          previous.position.x !== node.position.x ||
          previous.position.y !== node.position.y ||
          previous.origin?.[0] !== origin ||
          previous.origin?.[1] !== origin;
        const next = moved ? toFlow(node, previous, centered) : previous;
        return select ? { ...next, selected: select.has(node.id) } : next;
      });
    });
  }, [graph.nodes, placement?.centered]);

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
      const current = latest();
      const allowed = ids.filter((id) => {
        const node = current.nodes.find((node) => node.id === id);
        return node && !nodeTypes.get(node.type)?.single;
      });
      const done = duplicateNodes(current, allowed);
      if (done.copies.length === 0) return;
      const bounds = wrapper.current?.getBoundingClientRect();
      const anchor = flow.screenToFlowPosition(
        pointer.current ?? {
          x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
          y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2,
        },
      );
      const copies = new Set(done.copies);
      selectNext.current = copies;
      setSelectedWires(new Set());
      setPlacement({
        graph: done.graph,
        nodes: copies,
        anchor,
        position: anchor,
        before: new Set(
          nodes.filter((node) => node.selected).map((node) => node.id),
        ),
      });
      setMenu(undefined);
      setAdding(undefined);
    },
    [latest, nodeTypes, flow, nodes],
  );

  const removeSelection = useCallback(
    (ids: readonly string[], dissolve = false) => {
      const selected = new Set(ids);
      if (selected.size === 0 && selectedWires.size === 0) return;
      edit((current) => {
        // Box selection also selects incident wires; dissolve must keep the boundary wires it reconnects.
        const cut = new Set(
          [...selectedWires].filter(
            (id) =>
              !dissolve ||
              !current.wires.some(
                (wire) =>
                  wire.id === id &&
                  (selected.has(wire.from.node) || selected.has(wire.to.node)),
              ),
          ),
        );
        return disconnect(
          dissolve
            ? dissolveNodes(
                current,
                selected,
                { evaluated, nodeTypes },
                new Set(Object.keys(evaluation?.wires ?? {})),
              )
            : removeNodes(current, selected),
          cut,
        );
      });
      setSelectedWires(new Set());
    },
    [edit, selectedWires, evaluated, nodeTypes, evaluation?.wires],
  );

  const fitToView = useCallback(() => {
    const all = flow.getNodes();
    const selected = all.filter((node) => node.selected);
    if (all.length === 0) {
      void flow.setCenter(0, 0, { zoom: 1, duration: 250 });
    } else {
      void flow.fitView({
        nodes: selected.length ? selected : all,
        maxZoom: 1,
        padding: 0.3,
        duration: 250,
      });
    }
  }, [flow]);

  useEffect(() => {
    const remember = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      if (placement) {
        const position = flow.screenToFlowPosition(pointer.current);
        setPlacement((current) =>
          current ? { ...current, position } : current,
        );
      }
    };
    const place = (event: PointerEvent) => {
      if (!placement) return;
      if (
        !(event.target instanceof Node) ||
        !wrapper.current?.contains(event.target)
      ) {
        selectNext.current = placement.before;
        setPlacement(undefined);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      ignorePlacementClick.current = true;
      if (event.button === 0) {
        const position = flow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        const positions = new Map(
          placement.graph.nodes
            .filter((node) => placement.nodes.has(node.id))
            .map((node) => [
              node.id,
              {
                x: node.position.x + position.x - placement.anchor.x,
                y: node.position.y + position.y - placement.anchor.y,
              },
            ]),
        );
        if (placement.centered) {
          const node = flow.getNode(placement.centered);
          const element = wrapper.current.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${CSS.escape(placement.centered)}"]`,
          );
          positions.set(placement.centered, {
            x:
              position.x -
              (node?.measured?.width ?? element?.offsetWidth ?? 0) / 2,
            y:
              position.y -
              (node?.measured?.height ?? element?.offsetHeight ?? 0) / 2,
          });
        }
        edit(() => moveNodes(placement.graph, positions));
        selectNext.current = placement.nodes;
      } else {
        selectNext.current = placement.before;
      }
      setPlacement(undefined);
    };
    document.addEventListener("pointermove", remember, true);
    document.addEventListener("pointerdown", place, true);
    return () => {
      document.removeEventListener("pointermove", remember, true);
      document.removeEventListener("pointerdown", place, true);
    };
  }, [placement, flow, edit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (hidden || editing(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      if (key === "escape" && placement) {
        event.preventDefault();
        selectNext.current = placement.before;
        setPlacement(undefined);
      } else if (placement) {
        return;
      } else if (key === "d" && !command && event.shiftKey && !event.altKey) {
        event.preventDefault();
        duplicate(nodes.filter((node) => node.selected).map((node) => node.id));
      } else if (
        (key === "delete" || key === "backspace" || (key === "x" && command)) &&
        !event.altKey &&
        !event.shiftKey &&
        (key === "x" || !command)
      ) {
        event.preventDefault();
        removeSelection(
          nodes.filter((node) => node.selected).map((node) => node.id),
          key !== "delete",
        );
      } else if (event.altKey) {
        return;
      } else if (key === "a" && event.shiftKey && !command) {
        event.preventDefault();
        const bounds = wrapper.current?.getBoundingClientRect();
        if (!bounds) return;
        const point = pointer.current;
        const inside =
          point &&
          point.x >= bounds.left &&
          point.x <= bounds.right &&
          point.y >= bounds.top &&
          point.y <= bounds.bottom;
        const origin = inside
          ? point
          : {
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            };
        setMenu(undefined);
        setAdding({
          x: origin.x - bounds.left,
          y: origin.y - bounds.top,
          at: flow.screenToFlowPosition(origin),
        });
      } else if (key === "f" && !command && !event.shiftKey && !placement) {
        event.preventDefault();
        fitToView();
      } else if (placement || !command) {
        return;
      } else if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "a") {
        event.preventDefault();
        selectAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    undo,
    redo,
    selectAll,
    duplicate,
    removeSelection,
    nodes,
    hidden,
    fitToView,
    placement,
    flow,
  ]);

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
    () => ({
      graph,
      nodeTypes,
      evaluated,
      refused,
      edit,
      openMenu: setMenu,
    }),
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
    const position = pointer.current
      ? flow.screenToFlowPosition(pointer.current)
      : adding.at;
    const node = newNode(nodeType.type, position);
    const from = adding.from;
    const added = addNode(latest(), node);
    const next =
      from && input
        ? connect(
            added,
            { node: from.node, socket: from.socket },
            { node: node.id, socket: input },
          )
        : added;
    setPlacement({
      graph: next,
      nodes: new Set([node.id]),
      anchor: position,
      position,
      centered: node.id,
      before: new Set(selected),
    });
    selectNext.current = new Set([node.id]);
    setAdding(undefined);
    setMenu(undefined);
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
            <DropdownMenuSub
              open={adding?.embedded === true}
              onOpenChange={(isOpen) =>
                setAdding(
                  isOpen
                    ? { ...at(open.x, open.y), embedded: true }
                    : undefined,
                )
              }
            >
              <DropdownMenuSubTrigger
                className={MENU_ITEM}
                aria-keyshortcuts="Shift+A"
              >
                <span className="flex-1">Add node</span>
                <DropdownMenuShortcut keys={["Shift", "A"]} />
              </DropdownMenuSubTrigger>
              {/* Allow for the row's 4px inset and the parent's 1px outer ring before the 4px gap. */}
              <DropdownMenuSubContent
                sideOffset={9}
                alignOffset={-5}
                onFocusOutside={(event) => {
                  // Crossing the gap can briefly focus the parent menu before search receives focus.
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.dataset.slot === "dropdown-menu-content"
                  ) {
                    event.preventDefault();
                  }
                }}
                className="w-auto overflow-visible bg-transparent p-0 shadow-none ring-0"
              >
                <AddNodeMenu
                  embedded
                  x={0}
                  y={0}
                  nodeTypes={[...nodeTypes.values()]}
                  unavailable={unavailable}
                  onChoose={onChoose}
                  onClose={() => setAdding(undefined)}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator className={MENU_SEPARATOR} />
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={selectAll}
              aria-keyshortcuts="Control+A Meta+A"
            >
              Select all
              <DropdownMenuShortcut keys={["Ctrl", "A"]} />
            </DropdownMenuItem>
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={fitToView}
              aria-keyshortcuts="F"
            >
              Fit to view
              <DropdownMenuShortcut keys={["F"]} />
            </DropdownMenuItem>
          </>
        );
      case "node": {
        // A right click on a selected node acts on the whole selection
        const ids = selected.includes(open.node) ? selected : [open.node];
        const canDuplicate = graph.nodes.some(
          (node) => ids.includes(node.id) && !nodeTypes.get(node.type)?.single,
        );
        return (
          <>
            <DropdownMenuItem
              className={MENU_ITEM}
              onSelect={() => duplicate(ids)}
              disabled={!canDuplicate}
              aria-keyshortcuts="Shift+D"
            >
              Duplicate
              <DropdownMenuShortcut keys={["Shift", "D"]} />
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
              onSelect={() => removeSelection(ids)}
              aria-keyshortcuts="Delete"
            >
              Delete
              <DropdownMenuShortcut keys={["Del"]} />
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className={MENU_ITEM}
              onSelect={() => removeSelection(ids, true)}
              aria-keyshortcuts="Control+X Meta+X Backspace"
            >
              Dissolve
              <DropdownMenuShortcut keys={["Ctrl", "X"]} />
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
      <div
        ref={wrapper}
        className="relative h-full w-full"
        {...boxSelection.handlers}
        onPointerDownCapture={(event) => {
          ignorePlacementClick.current = false;
          boxSelection.handlers.onPointerDownCapture(event);
        }}
        onContextMenuCapture={(event) => {
          if (ignorePlacementClick.current) {
            event.preventDefault();
            event.stopPropagation();
            ignorePlacementClick.current = false;
          }
        }}
        onClickCapture={(event) => {
          if (ignorePlacementClick.current) {
            event.stopPropagation();
            ignorePlacementClick.current = false;
          } else boxSelection.handlers.onClickCapture(event);
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-4"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 45%, rgb(0 0 0 / 0.16) 100%)",
          }}
        />
        <ReactFlow<CanvasNode>
          className={placement ? "[&_*]:cursor-grabbing!" : ""}
          proOptions={{ hideAttribution: true }}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_VIEWS}
          onNodesChange={onNodesChange}
          nodesDraggable={!placement}
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
          fitViewOptions={INITIAL_VIEW}
          minZoom={0.2}
          maxZoom={2}
          selectionOnDrag
          selectionKeyCode={null}
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1]}
          panOnScroll
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          // The canvas handles Delete and Backspace separately so Backspace can dissolve.
          deleteKeyCode={null}
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
        {boxSelection.box ? (
          <div
            aria-hidden
            className="react-flow absolute inset-0 z-5 pointer-events-none"
          >
            <div
              className="react-flow__selection absolute"
              style={{
                left: boxSelection.box.x,
                top: boxSelection.box.y,
                width: boxSelection.box.width,
                height: boxSelection.box.height,
              }}
            />
          </div>
        ) : null}
        {placement ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 cursor-grabbing"
          />
        ) : null}
        {menu ? (
          <PointerMenu
            x={menu.x}
            y={menu.y}
            className={menu.kind === "node" ? "w-64" : ""}
            onClose={() => {
              setMenu(undefined);
              setAdding((current) => (current?.embedded ? undefined : current));
            }}
          >
            {menuItems(menu)}
          </PointerMenu>
        ) : null}
        {adding && !adding.embedded ? (
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
