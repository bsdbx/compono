import type { Prop, SocketTypeOutput, Wire } from "@/api/types";
import { nodeName, nodeWidth } from "./node-size";

export type SocketType = SocketTypeOutput;

export type XY = { x: number; y: number };

/** A node as the canvas edits it, with every field there. */
export type GraphNode = {
  id: string;
  type: string;
  /** An optional display label; the node's type and socket IDs stay unchanged. */
  name?: string;
  /** A manually chosen width. Without one, the node fits its label from the shared default. */
  width?: number;
  /** A compact label and sockets; the expanded width and all node values stay intact. */
  collapsed?: boolean;
  position: XY;
  values: Record<string, unknown>;
  properties: Record<string, unknown>;
  exposed: string[];
  groups: Record<string, string[]>;
};

/** A component's graph, as stored: format 1. */
export type Graph = {
  format: 1;
  props: Prop[];
  nodes: GraphNode[];
  wires: Wire[];
};

const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The graph in a component's stored JSON. `{}` is a graph of nothing. */
export function readGraph(stored: Record<string, unknown>): Graph {
  return {
    format: 1,
    props: list(stored.props) as Prop[],
    nodes: list(stored.nodes).map((item) => {
      const node = object(item);
      const position = object(node.position);
      return {
        id: String(node.id),
        type: String(node.type),
        ...(typeof node.name === "string" && node.name.trim() !== ""
          ? { name: nodeName(node.name) }
          : {}),
        ...(typeof node.width === "number" && Number.isFinite(node.width)
          ? { width: nodeWidth(node.width) }
          : {}),
        ...(node.collapsed === true ? { collapsed: true } : {}),
        position: { x: Number(position.x ?? 0), y: Number(position.y ?? 0) },
        values: object(node.values),
        properties: object(node.properties),
        exposed: list(node.exposed).map(String),
        groups: Object.fromEntries(
          Object.entries(object(node.groups)).map(([group, rows]) => [
            group,
            list(rows).map(String),
          ]),
        ),
      };
    }),
    wires: list(stored.wires) as Wire[],
  };
}

/** The socket a group's Add row wires into, which adds a row. */
export const addRow = (group: string) => `${group}/+`;

const replace = (
  graph: Graph,
  id: string,
  change: (node: GraphNode) => GraphNode,
): Graph => ({
  ...graph,
  nodes: graph.nodes.map((node) => (node.id === id ? change(node) : node)),
});

export function addNode(graph: Graph, node: GraphNode): Graph {
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** Sets the display label, or restores the type's name when the label is empty. */
export function renameNode(graph: Graph, id: string, value: string): Graph {
  const name = nodeName(value);
  const current = graph.nodes.find((node) => node.id === id);
  if (!current || (current.name ?? "") === name) return graph;
  const { name: _, ...rest } = current;
  const renamed = name === "" ? rest : { ...rest, name };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === id ? renamed : node)),
  };
}

/** Collapse a mixed selection together, or expand it when every selected node is collapsed. */
export function toggleCollapsed(graph: Graph, ids: ReadonlySet<string>): Graph {
  const selected = graph.nodes.filter((node) => ids.has(node.id));
  if (selected.length === 0) return graph;
  const collapse = selected.some((node) => !node.collapsed);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!ids.has(node.id) || Boolean(node.collapsed) === collapse)
        return node;
      const { collapsed: _, ...expanded } = node;
      return collapse ? { ...node, collapsed: true } : expanded;
    }),
  };
}

/** Commits a horizontal resize; resizing from the left also moves the node. */
export function setNodeWidth(
  graph: Graph,
  id: string,
  requested: number,
  position?: XY,
): Graph {
  const current = graph.nodes.find((node) => node.id === id);
  const width = nodeWidth(requested);
  if (!current) return graph;
  const at = position ?? current.position;
  if (
    current.width === width &&
    current.position.x === at.x &&
    current.position.y === at.y
  )
    return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === id ? { ...node, width, position: at } : node,
    ),
  };
}

/** A new node of the type at the place, with nothing set. */
export function newNode(
  type: string,
  position: XY,
  id: string = crypto.randomUUID(),
): GraphNode {
  return {
    id,
    type,
    position,
    values: {},
    properties: {},
    exposed: [],
    groups: {},
  };
}

/** Takes the nodes out, with their wires. */
export function removeNodes(graph: Graph, ids: ReadonlySet<string>): Graph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !ids.has(node.id)),
    wires: graph.wires.filter(
      (wire) => !ids.has(wire.from.node) && !ids.has(wire.to.node),
    ),
  };
}

export function moveNodes(
  graph: Graph,
  positions: ReadonlyMap<string, XY>,
): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    }),
  };
}

/**
 * Wires an output into an input, in place of the wire that was there.
 * Wiring into a group's Add row adds a row for it.
 */
export function connect(
  graph: Graph,
  from: Wire["from"],
  to: Wire["to"],
  id: string = crypto.randomUUID(),
): Graph {
  let next = graph;
  let socket = to.socket;
  if (socket.endsWith("/+")) {
    const group = socket.slice(0, -2);
    const row = crypto.randomUUID();
    socket = `${group}/${row}`;
    next = replace(next, to.node, (node) => ({
      ...node,
      groups: { ...node.groups, [group]: [...(node.groups[group] ?? []), row] },
    }));
  }
  return {
    ...next,
    wires: [
      ...next.wires.filter(
        (wire) => !(wire.to.node === to.node && wire.to.socket === socket),
      ),
      { id, from, to: { node: to.node, socket } },
    ],
  };
}

export function disconnect(graph: Graph, ids: ReadonlySet<string>): Graph {
  return { ...graph, wires: graph.wires.filter((wire) => !ids.has(wire.id)) };
}

/** Takes away every wire into and out of the node. */
export function disconnectNode(graph: Graph, id: string): Graph {
  return disconnectNodes(graph, new Set([id]));
}

/** Takes away every wire touching the selection, keeping its nodes and socket rows. */
export function disconnectNodes(graph: Graph, ids: ReadonlySet<string>): Graph {
  const wires = graph.wires.filter(
    (wire) => !ids.has(wire.from.node) && !ids.has(wire.to.node),
  );
  return wires.length === graph.wires.length ? graph : { ...graph, wires };
}

/** Copies a selection and its internal wires; linked copies also retain external inputs. */
export function duplicateNodes(
  graph: Graph,
  ids: readonly string[],
  {
    linked = false,
    newId = () => crypto.randomUUID(),
  }: { linked?: boolean; newId?: () => string } = {},
): { graph: Graph; copies: string[] } {
  const mapping = new Map<string, string>();
  const selected = new Set(ids);
  const copies: GraphNode[] = graph.nodes
    .filter((node) => selected.has(node.id))
    .map((node) => {
      const id = newId();
      mapping.set(node.id, id);
      return { ...structuredClone(node), id };
    });
  if (copies.length === 0) return { graph, copies: [] };
  const wires = graph.wires.flatMap((wire) => {
    const to = mapping.get(wire.to.node);
    const from = mapping.get(wire.from.node);
    if (to === undefined || (!linked && from === undefined)) return [];
    return [
      {
        id: newId(),
        from: { ...wire.from, node: from ?? wire.from.node },
        to: { ...wire.to, node: to },
      },
    ];
  });
  return {
    graph: {
      ...graph,
      nodes: [...graph.nodes, ...copies],
      wires: [...graph.wires, ...wires],
    },
    copies: copies.map((copy) => copy.id),
  };
}

/** Types a value in on the node, or clears it back to its default with undefined. */
export function setValue(
  graph: Graph,
  id: string,
  socket: string,
  value: unknown,
): Graph {
  return replace(graph, id, (node) => {
    const { [socket]: _, ...rest } = node.values;
    return {
      ...node,
      values: value === undefined ? rest : { ...rest, [socket]: value },
    };
  });
}

export function setProperty(
  graph: Graph,
  id: string,
  property: string,
  value: unknown,
): Graph {
  return replace(graph, id, (node) => ({
    ...node,
    properties: { ...node.properties, [property]: value },
  }));
}

/** Moves a group's row up (-1) or down (1). */
export function moveRow(
  graph: Graph,
  id: string,
  group: string,
  row: string,
  by: -1 | 1,
): Graph {
  return replace(graph, id, (node) => {
    const rows = [...(node.groups[group] ?? [])];
    const at = rows.indexOf(row);
    const to = at + by;
    if (at === -1 || to < 0 || to >= rows.length) {
      return node;
    }
    [rows[at], rows[to]] = [rows[to] as string, rows[at] as string];
    return { ...node, groups: { ...node.groups, [group]: rows } };
  });
}

/** Takes a group's row away, with its wire. */
export function removeRow(
  graph: Graph,
  id: string,
  group: string,
  row: string,
): Graph {
  const socket = `${group}/${row}`;
  const next = replace(graph, id, (node) => ({
    ...node,
    groups: {
      ...node.groups,
      [group]: (node.groups[group] ?? []).filter((each) => each !== row),
    },
  }));
  return {
    ...next,
    wires: next.wires.filter(
      (wire) => !(wire.to.node === id && wire.to.socket === socket),
    ),
  };
}

/** Makes a node's property an input it can take a wire into, keeping its value. */
export function expose(graph: Graph, id: string, property: string): Graph {
  return replace(graph, id, (node) =>
    node.exposed.includes(property)
      ? node
      : { ...node, exposed: [...node.exposed, property] },
  );
}

/** Makes an exposed property a plain property again, taking its wire away. */
export function unexpose(graph: Graph, id: string, property: string): Graph {
  const next = replace(graph, id, (node) => ({
    ...node,
    exposed: node.exposed.filter((each) => each !== property),
  }));
  return {
    ...next,
    wires: next.wires.filter(
      (wire) => !(wire.to.node === id && wire.to.socket === property),
    ),
  };
}

/** A prop name, as Component Input takes it: a lowercase letter, then letters and digits, like ctaHref. */
export const PROP_NAME = /^[a-z][A-Za-z0-9]*$/;

/** The first of name, name2, name3… that no prop has. */
export function freeName(graph: Graph, name: string): string {
  const taken = new Set(graph.props.map((prop) => prop.name));
  if (!taken.has(name)) {
    return name;
  }

  const base = name.replace(/\d+$/, "");
  let number = 2;
  while (taken.has(`${base}${number}`)) {
    number += 1;
  }
  return `${base}${number}`;
}

/** Adds a Text prop with a free name, after the others. */
export function addProp(graph: Graph, id: string = crypto.randomUUID()): Graph {
  return {
    ...graph,
    props: [
      ...graph.props,
      { id, name: freeName(graph, "prop"), type: { kind: "text" } },
    ],
  };
}

export function changeProp(
  graph: Graph,
  id: string,
  change: Partial<Omit<Prop, "id">>,
): Graph {
  return {
    ...graph,
    props: graph.props.map((prop) =>
      prop.id === id ? { ...prop, ...change } : prop,
    ),
  };
}

/** Takes a prop away, with the wires out of Component Input that brought it. */
export function removeProp(graph: Graph, id: string): Graph {
  const inputs = new Set(
    graph.nodes
      .filter((node) => node.type === "component-input")
      .map((node) => node.id),
  );
  return {
    ...graph,
    props: graph.props.filter((prop) => prop.id !== id),
    wires: graph.wires.filter(
      (wire) => !(inputs.has(wire.from.node) && wire.from.socket === id),
    ),
  };
}

/** A copy of the prop with a free name, right after it. */
export function duplicateProp(
  graph: Graph,
  id: string,
  newId: string = crypto.randomUUID(),
): Graph {
  const at = graph.props.findIndex((prop) => prop.id === id);
  const prop = graph.props[at];
  if (prop === undefined) {
    return graph;
  }

  const copy = {
    ...structuredClone(prop),
    id: newId,
    name: freeName(graph, prop.name),
  };
  return {
    ...graph,
    props: [
      ...graph.props.slice(0, at + 1),
      copy,
      ...graph.props.slice(at + 1),
    ],
  };
}
