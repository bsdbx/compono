"""Evaluating a graph: first every node's sockets and wires, then every node's values."""

import logging
from collections.abc import Mapping
from dataclasses import dataclass, field

from compono.graph.model import Graph, Node, Wire
from compono.graph.node_types import (
    EvaluateContext,
    Input,
    NodeError,
    NodeType,
    Sockets,
    SocketsContext,
)
from compono.graph.sockets import SocketType, accepts, name_of
from compono.graph.values import Value, from_json

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NodeResult:
    """What became of one node."""

    # Its sockets, with its exposed properties as inputs
    sockets: Sockets
    # Its outputs' values, by output. Empty if it didn't evaluate
    outputs: Mapping[str, Value]
    # Why it can't evaluate
    error: str | None = None
    # Not evaluated, because a node it takes values from has an error
    skipped: bool = False


@dataclass(frozen=True)
class Evaluation:
    """Every node's result, and why each refused wire is refused."""

    nodes: Mapping[str, NodeResult]
    wires: Mapping[str, str]


@dataclass
class _Node:
    """A node while it's evaluated."""

    node: Node
    node_type: NodeType | None
    properties: dict[str, Value]
    sockets: Sockets = field(default_factory=Sockets)
    error: str | None = None
    skipped: bool = False
    # The accepted wire into each input, by input
    wires: dict[str, Wire] | None = None


def evaluate(graph: Graph, node_types: Mapping[str, NodeType]) -> Evaluation:
    """Evaluates every node of the graph. A wire that can't be used is refused and left out, with the reason."""
    refused: dict[str, str] = {}
    nodes = _nodes(graph, node_types)
    wires = _wires(graph, nodes, refused)
    order = _order(nodes, wires)

    # 1. Every node's sockets, and whether its wires fit them
    for node_id in order:
        _sockets(nodes[node_id], nodes, wires.get(node_id, []), refused)

    # 2. Every node's values, after the nodes it takes them from
    outputs: dict[str, Mapping[str, Value]] = {}
    for node_id in order:
        outputs[node_id] = _values(nodes[node_id], nodes, outputs)

    return Evaluation(
        nodes={
            node_id: NodeResult(
                sockets=nodes[node_id].sockets,
                outputs=outputs[node_id],
                error=nodes[node_id].error,
                skipped=nodes[node_id].skipped,
            )
            for node_id in order
        },
        wires=refused,
    )


def _nodes(graph: Graph, node_types: Mapping[str, NodeType]) -> dict[str, _Node]:
    nodes: dict[str, _Node] = {}
    for node in graph.nodes:
        # The first of two nodes with one id wins
        if node.id in nodes:
            continue
        node_type = node_types.get(node.type)
        evaluated = _Node(node=node, node_type=node_type, properties={})
        if node_type is None:
            evaluated.error = f"There's no {node.type} node"
        else:
            try:
                evaluated.properties = _properties(node, node_type)
            except NodeError as error:
                evaluated.error = str(error)
        nodes[node.id] = evaluated
    return nodes


def _properties(node: Node, node_type: NodeType) -> dict[str, Value]:
    properties: dict[str, Value] = {}
    for prop in node_type.properties:
        if prop.id not in node.properties:
            properties[prop.id] = prop.default
            continue
        try:
            properties[prop.id] = from_json(node.properties[prop.id], prop.type)
        except ValueError as error:
            raise NodeError(f"{prop.label} {error}") from error
    return properties


def _wires(
    graph: Graph, nodes: Mapping[str, _Node], refused: dict[str, str]
) -> dict[str, list[Wire]]:
    """The wires into each node, by node. Refuses wires between missing nodes, a second wire into an input, and wires that make a loop."""
    into: dict[str, list[Wire]] = {}
    taken: set[tuple[str, str]] = set()
    # The nodes each node passes values to, to find loops
    after: dict[str, set[str]] = {node_id: set() for node_id in nodes}
    for wire in graph.wires:
        start, end = wire.from_.node, wire.to.node
        if start not in nodes or end not in nodes:
            refused[wire.id] = "It runs from or to a node that isn't there"
        elif (end, wire.to.socket) in taken:
            refused[wire.id] = "Its input already has a wire"
        elif start == end or _reaches(end, start, after):
            refused[wire.id] = "It makes a loop"
        else:
            taken.add((end, wire.to.socket))
            after[start].add(end)
            into.setdefault(end, []).append(wire)
    return into


def _reaches(start: str, goal: str, after: Mapping[str, set[str]]) -> bool:
    """Whether values from `start` already flow to `goal`."""
    seen = {start}
    stack = [start]
    while stack:
        current = stack.pop()
        if current == goal:
            return True
        for following in after[current] - seen:
            seen.add(following)
            stack.append(following)
    return False


def _order(nodes: Mapping[str, _Node], wires: Mapping[str, list[Wire]]) -> list[str]:
    """Every node after the nodes it takes values from, otherwise in the graph's order."""
    order: list[str] = []
    placed: set[str] = set()

    def place(node_id: str) -> None:
        if node_id in placed:
            return
        placed.add(node_id)
        for wire in wires.get(node_id, []):
            place(wire.from_.node)
        order.append(node_id)

    for node_id in nodes:
        place(node_id)
    return order


def _sockets(
    node: _Node,
    nodes: Mapping[str, _Node],
    wires: list[Wire],
    refused: dict[str, str],
) -> None:
    """Works out the node's sockets from its properties and the types wired into it, then refuses the wires that don't fit."""
    # What each wire brings, from the sockets of the nodes before
    wired: dict[str, SocketType] = {}
    for wire in wires:
        output = _output_type(nodes[wire.from_.node], wire.from_.socket)
        if output is not None:
            wired[wire.to.socket] = output

    if node.node_type is not None and node.error is None:
        try:
            sockets = node.node_type.sockets(
                SocketsContext(properties=node.properties, wired=wired)
            )
            node.sockets = _with_exposed(node, sockets)
        except NodeError as error:
            node.error = str(error)

    accepted: dict[str, Wire] = {}
    for wire in wires:
        reason = _refusal(wire, nodes, node)
        if reason is None:
            accepted[wire.to.socket] = wire
        else:
            refused[wire.id] = reason
    node.wires = accepted


def _output_type(node: _Node, socket: str) -> SocketType | None:
    for output in node.sockets.outputs:
        if output.id == socket:
            return output.type
    return None


def _with_exposed(node: _Node, sockets: Sockets) -> Sockets:
    """The sockets, with each exposed property as an input after the node's own."""
    assert node.node_type is not None
    exposed = tuple(
        Input(
            id=prop.id,
            label=prop.label,
            type=prop.type,
            default=node.properties[prop.id],
        )
        for prop in node.node_type.properties
        if prop.id in node.node.exposed
    )
    return Sockets(
        inputs=sockets.inputs + exposed, groups=sockets.groups, outputs=sockets.outputs
    )


def _input_type(node: _Node, socket: str) -> SocketType | None:
    for each in node.sockets.inputs:
        if each.id == socket:
            return each.type
    # A row of a group, like children/<row id>
    group, _, row = socket.partition("/")
    for socket_group in node.sockets.groups:
        if socket_group.id == group and row in node.node.groups.get(group, []):
            return socket_group.type
    return None


def _refusal(wire: Wire, nodes: Mapping[str, _Node], node: _Node) -> str | None:
    """Why the wire can't be used, if it can't."""
    start = nodes[wire.from_.node]
    # Unknown until the nodes they connect are fixed
    if start.error is not None or node.error is not None:
        return None
    output = _output_type(start, wire.from_.socket)
    if output is None:
        return f"{_name(start)} has no output {wire.from_.socket}"
    into = _input_type(node, wire.to.socket)
    if into is None:
        return f"{_name(node)} has no input {wire.to.socket}"
    if not accepts(into, output):
        return f"{name_of(output)} can't go into {name_of(into)}"
    return None


def _name(node: _Node) -> str:
    return node.node_type.name if node.node_type is not None else node.node.type


def _values(
    node: _Node,
    nodes: Mapping[str, _Node],
    outputs: Mapping[str, Mapping[str, Value]],
) -> Mapping[str, Value]:
    """The node's outputs, or nothing if it, or a node before it, has an error."""
    wires = node.wires or {}
    if node.error is not None or node.node_type is None:
        return {}
    if any(
        nodes[wire.from_.node].error is not None or nodes[wire.from_.node].skipped
        for wire in wires.values()
    ):
        node.skipped = True
        return {}

    def value(socket: str, typed_type: SocketType, default: Value) -> Value:
        wire = wires.get(socket)
        if wire is not None:
            brought = outputs[wire.from_.node].get(wire.from_.socket)
            # A wire that brings Nothing counts as no wire
            if brought is not None:
                return brought
        if socket in node.node.values:
            return from_json(node.node.values[socket], typed_type)
        return default

    try:
        inputs = {
            each.id: value(each.id, each.type, each.default)
            for each in node.sockets.inputs
        }
        groups = {
            group.id: tuple(
                value(f"{group.id}/{row}", group.type, None)
                for row in node.node.groups.get(group.id, [])
            )
            for group in node.sockets.groups
        }
    except ValueError as error:
        node.error = f"A value typed in {error}"
        return {}

    properties = {
        name: inputs[name] if name in node.node.exposed else prop
        for name, prop in node.properties.items()
    }
    try:
        computed = node.node_type.evaluate(
            EvaluateContext(inputs=inputs, groups=groups, properties=properties)
        )
    except NodeError as error:
        node.error = str(error)
        return {}
    except Exception:
        logger.exception("The %s node %s failed", node.node.type, node.node.id)
        node.error = "Something went wrong in this node"
        return {}
    return {output.id: computed.get(output.id) for output in node.sockets.outputs}
