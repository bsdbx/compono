import type { ObjectField, Prop, SocketTypeOutput, Wire } from "@/api/types";
import { nodeName, nodeWidth } from "./node-size";

export type SocketType = SocketTypeOutput;
export const OBJECT_FIELD_SOCKET = "field:new";

export type XY = { x: number; y: number };

/** A node as the canvas edits it, with every field there. */
export type GraphNode = {
  id: string;
  type: string;
  /** An optional display label; the node's type and socket IDs stay unchanged. */
  name?: string;
  /** Optional display names keyed by stable socket IDs, independent of values and order. */
  socketNames?: Record<string, string>;
  /** A manually chosen width. Without one, the node fits its label from the shared default. */
  width?: number;
  /** A compact label and sockets; the expanded width and all node values stay intact. */
  collapsed?: boolean;
  position: XY;
  values: Record<string, unknown>;
  properties: Record<string, unknown>;
  exposed: string[];
  /** Inputs, socket groups and inline values moved off the node into Properties. */
  unexposed?: string[];
  /** Display order in the Properties panel, keyed by field IDs. */
  propertyOrder?: string[];
  groups: Record<string, string[]>;
  fields?: ObjectField[];
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
      const unexposed = list(node.unexposed).filter(
        (id): id is string => typeof id === "string",
      );
      const propertyOrder = [
        ...new Set(
          list(node.propertyOrder).filter(
            (id): id is string => typeof id === "string",
          ),
        ),
      ];
      const socketNames = Object.fromEntries(
        Object.entries(object(node.socketNames)).flatMap(([socket, value]) =>
          typeof value === "string" && nodeName(value)
            ? [[socket, nodeName(value)]]
            : [],
        ),
      );
      const fields = list(node.fields) as ObjectField[];
      return {
        id: String(node.id),
        type: String(node.type),
        ...(Object.keys(socketNames).length ? { socketNames } : {}),
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
        ...(unexposed.length ? { unexposed } : {}),
        ...(propertyOrder.length ? { propertyOrder } : {}),
        ...(fields.length ? { fields } : {}),
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

/** Temporary drop targets append an input or insert it before a stable row ID. */
export const addRow = (group: string, before?: string) =>
  `${group}/+${before ? `/${before}` : ""}`;

export function groupDrop(socket: string) {
  const match = /^([^/]+)\/\+(?:\/(.+))?$/.exec(socket);
  return match?.[1] ? { group: match[1], before: match[2] } : undefined;
}

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
  return renameNodes(graph, new Map([[id, value]]));
}

export function renameNodes(
  graph: Graph,
  names: ReadonlyMap<string, string>,
): Graph {
  if (!names.size) return graph;
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    const value = names.get(node.id);
    if (value === undefined) return node;
    const name = nodeName(value);
    if ((node.name ?? "") === name) return node;
    changed = true;
    const { name: _, ...rest } = node;
    return name ? { ...rest, name } : rest;
  });
  return changed ? { ...graph, nodes } : graph;
}

function withoutSocketNames(
  node: GraphNode,
  sockets: readonly string[],
): GraphNode {
  if (
    !node.socketNames ||
    !sockets.some((socket) => socket in (node.socketNames ?? {}))
  )
    return node;
  const names = Object.fromEntries(
    Object.entries(node.socketNames).filter(
      ([socket]) => !sockets.includes(socket),
    ),
  );
  const { socketNames: _, ...rest } = node;
  return Object.keys(names).length ? { ...rest, socketNames: names } : rest;
}

/** A child input's display name follows its socket ID; clearing it restores the type label. */
export function renameSocket(
  graph: Graph,
  nodeId: string,
  group: string,
  row: string,
  value: string,
): Graph {
  const node = graph.nodes.find((each) => each.id === nodeId);
  if (!node?.groups[group]?.includes(row)) return graph;
  const socket = `${group}/${row}`,
    name = nodeName(value);
  if ((node.socketNames?.[socket] ?? "") === name) return graph;
  return replace(graph, nodeId, (current) =>
    name
      ? { ...current, socketNames: { ...current.socketNames, [socket]: name } }
      : withoutSocketNames(current, [socket]),
  );
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
  sourceType?: SocketType,
): Graph {
  let next = graph;
  let socket = to.socket;
  const drop = groupDrop(socket);
  if (
    socket === OBJECT_FIELD_SOCKET &&
    graph.nodes.some((node) => node.id === to.node && node.type === "object")
  ) {
    socket = crypto.randomUUID();
    next = addObjectField(next, to.node, socket, sourceType ?? { kind: "any" });
  } else if (drop) {
    const { group, before } = drop;
    const row = crypto.randomUUID();
    socket = `${group}/${row}`;
    next = insertGroupRow(next, to.node, group, before, row);
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

/** Add an intentionally empty input without creating a wire. */
export function insertGroupRow(
  graph: Graph,
  node: string,
  group: string,
  before?: string,
  row: string = crypto.randomUUID(),
): Graph {
  return replace(graph, node, (current) => {
    const rows = [...(current.groups[group] ?? [])];
    const index = before ? rows.indexOf(before) : -1;
    rows.splice(index < 0 ? rows.length : index, 0, row);
    return { ...current, groups: { ...current.groups, [group]: rows } };
  });
}

/** Drop disconnected group inputs unless they have a local value to restore. */
export function pruneDisconnectedRows(before: Graph, after: Graph): Graph {
  if (before === after || before.wires === after.wires) return after;
  const connected = new Set(
    after.wires.map((wire) => `${wire.to.node}\n${wire.to.socket}`),
  );
  const removed = new Set(
    before.wires
      .filter((wire) => !connected.has(`${wire.to.node}\n${wire.to.socket}`))
      .map((wire) => `${wire.to.node}\n${wire.to.socket}`),
  );
  if (removed.size === 0) return after;
  let changed = false;
  const nodes = after.nodes.map((node) => {
    const pruned: string[] = [];
    const groups = Object.fromEntries(
      Object.entries(node.groups).map(([group, rows]) => [
        group,
        rows.filter((row) => {
          const socket = `${group}/${row}`;
          if (
            !removed.has(`${node.id}\n${socket}`) ||
            Object.hasOwn(node.values, socket)
          ) {
            return true;
          }
          pruned.push(socket);
          return false;
        }),
      ]),
    );
    if (pruned.length === 0) return node;
    changed = true;
    return withoutSocketNames({ ...node, groups }, pruned);
  });
  return changed ? { ...after, nodes } : after;
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

export const groupPropertyId = (id: string) => `group:${id}`;

/** A group follows its default anchor until it has a saved position of its own. */
export function inPropertyOrder<
  T extends { id: string; before?: string | null },
>(fields: readonly T[], order: readonly string[] | undefined): readonly T[] {
  const positions = new Map(order?.map((id, index) => [id, index]));
  const position = (field: T) => positions.get(field.id) ?? positions.size;
  const anchored = (field: T) => field.before && !positions.has(field.id);
  const sorted = fields
    .filter((field) => !anchored(field))
    .sort((a, b) => position(a) - position(b));
  for (const field of fields.filter(anchored)) {
    const index = sorted.findIndex((entry) => entry.id === field.before);
    sorted.splice(index < 0 ? sorted.length : index, 0, field);
  }
  return sorted;
}

/** Replaces the positions of visible fields, leaving absent fields in their slots. */
function orderVisibleSlots(previous: readonly string[], fields: string[]) {
  const visible = new Set(fields);
  let at = 0;
  const order = previous.map((field) =>
    visible.has(field) ? (fields[at++] ?? field) : field,
  );
  order.push(...fields.slice(at));
  return order;
}

/** Reorders visible properties while retaining the slots of temporarily absent fields. */
export function setPropertyOrder(
  graph: Graph,
  id: string,
  fields: string[],
): Graph {
  const node = graph.nodes.find((each) => each.id === id);
  if (!node) return graph;
  const previous = node.propertyOrder ?? [];
  const order = orderVisibleSlots(previous, fields);
  if (
    order.length === previous.length &&
    order.every((field, index) => field === previous[index])
  )
    return graph;
  return replace(graph, id, (current) => ({
    ...current,
    propertyOrder: order,
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

/** Reorder stable input IDs, preserving the wires attached to them. */
export function placeRow(
  graph: Graph,
  node: string,
  group: string,
  row: string,
  before?: string,
  visible?: ReadonlySet<string>,
): Graph {
  const current = graph.nodes.find((each) => each.id === node)?.groups[group];
  if (!current) return graph;
  const displayed = visible ? current.filter((id) => visible.has(id)) : current;
  const rows = reorderedRows(displayed, row, before);
  if (rows === displayed) return graph;
  return replace(graph, node, (value) => ({
    ...value,
    groups: {
      ...value.groups,
      [group]: visible ? orderVisibleSlots(current, rows) : rows,
    },
  }));
}

/** The same prospective order is used for the drag preview and the committed edit. */
export function reorderedRows(
  current: string[],
  row: string,
  before?: string,
): string[] {
  if (
    !current.includes(row) ||
    before === row ||
    (before && !current.includes(before))
  )
    return current;
  const rows = current.filter((each) => each !== row);
  const index = before ? rows.indexOf(before) : rows.length;
  rows.splice(index, 0, row);
  return rows.every((each, at) => each === current[at]) ? current : rows;
}

/** Takes a group's row away, with its wire. */
export function removeRow(
  graph: Graph,
  id: string,
  group: string,
  row: string,
): Graph {
  const socket = `${group}/${row}`;
  const next = replace(graph, id, (node) => {
    const { [socket]: _, ...values } = node.values;
    return withoutSocketNames(
      {
        ...node,
        values,
        groups: {
          ...node.groups,
          [group]: (node.groups[group] ?? []).filter((each) => each !== row),
        },
      },
      [socket],
    );
  });
  return {
    ...next,
    wires: next.wires.filter(
      (wire) => !(wire.to.node === id && wire.to.socket === socket),
    ),
  };
}

type FieldOrigin = "property" | "input" | "group";

/** Restores a default input or group, or makes a property wireable. */
export function expose(
  graph: Graph,
  id: string,
  field: string,
  origin: FieldOrigin = "property",
): Graph {
  const key = origin === "group" ? groupPropertyId(field) : field;
  return replace(graph, id, (node) => {
    const { unexposed, ...rest } = node;
    const hidden = (unexposed ?? []).filter((each) => each !== key);
    const exposed =
      origin === "input" || origin === "group" || node.exposed.includes(field)
        ? node.exposed
        : [...node.exposed, field];
    return {
      ...rest,
      exposed,
      ...(hidden.length ? { unexposed: hidden } : {}),
    };
  });
}

/** Removes a field's input and its wires, restoring inline values to their output. */
export function unexpose(
  graph: Graph,
  id: string,
  field: string,
  origin: FieldOrigin = "property",
): Graph {
  const key = origin === "group" ? groupPropertyId(field) : field;
  const next = replace(graph, id, (node) => {
    const hidden = node.unexposed ?? [];
    return {
      ...node,
      exposed:
        origin === "group"
          ? node.exposed
          : node.exposed.filter((each) => each !== field),
      ...(origin !== "property" && !hidden.includes(key)
        ? { unexposed: [...hidden, key] }
        : {}),
    };
  });
  return {
    ...next,
    wires: next.wires.filter(
      (wire) =>
        wire.to.node !== id ||
        (origin === "group"
          ? !wire.to.socket.startsWith(`${field}/`)
          : wire.to.socket !== field),
    ),
  };
}

/** Materializes the Object's spare socket using the source type as its local fallback. */
function addObjectField(
  graph: Graph,
  nodeId: string,
  id: string,
  type: SocketType,
): Graph {
  return replace(graph, nodeId, (node) => {
    const fields = node.fields ?? [];
    const name = freeNameAmong(fields, "field");
    return {
      ...node,
      fields: [...fields, { id, name, type }],
    };
  });
}

export function renameObjectField(
  graph: Graph,
  nodeId: string,
  id: string,
  requested: string,
): Graph {
  return replace(graph, nodeId, (node) => {
    const fields = node.fields ?? [];
    const name = requested.trim();
    if (!name || fields.some((field) => field.id !== id && field.name === name))
      return node;
    return {
      ...node,
      fields: fields.map((field) =>
        field.id === id ? { ...field, name } : field,
      ),
    };
  });
}

export function placeObjectField(
  graph: Graph,
  nodeId: string,
  id: string,
  before?: string,
): Graph {
  return replace(graph, nodeId, (node) => {
    const fields = node.fields ?? [];
    const order = fields.map((field) => field.id);
    const next = reorderedRows(order, id, before);
    return next === order
      ? node
      : { ...node, fields: [...inPropertyOrder(fields, next)] };
  });
}

/** Deletes an Object input, its local value and its incoming wire. */
export function removeObjectField(
  graph: Graph,
  nodeId: string,
  id: string,
): Graph {
  const next = replace(graph, nodeId, (node) => {
    const { [id]: _, ...values } = node.values;
    return {
      ...node,
      fields: node.fields?.filter((field) => field.id !== id) ?? [],
      values,
    };
  });
  return {
    ...next,
    wires: next.wires.filter(
      (wire) => wire.to.node !== nodeId || wire.to.socket !== id,
    ),
  };
}

/** A prop name, as Component Input takes it: a lowercase letter, then letters and digits, like ctaHref. */
export const PROP_NAME = /^[a-z][A-Za-z0-9]*$/;

/** The first of name, name2, name3… that no prop has. */
export function freeName(graph: Graph, name: string): string {
  return freeNameAmong(graph.props, name);
}

function freeNameAmong(
  fields: readonly { name: string }[],
  name: string,
): string {
  const taken = new Set(fields.map((field) => field.name));
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

/** Moves a component prop by ID, keeping its value and connected wires. */
export function placeProp(graph: Graph, id: string, before?: string): Graph {
  const current = graph.props.map((prop) => prop.id);
  const order = reorderedRows(current, id, before);
  return order === current
    ? graph
    : { ...graph, props: [...inPropertyOrder(graph.props, order)] };
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
