"""Evaluating a graph: each node's sockets, wires and values, in dependency order."""

import logging
from collections.abc import Mapping
from dataclasses import dataclass, field, replace

from compono.graph.model import Graph, Node, Wire
from compono.graph.node_types import (
    EvaluateContext,
    Input,
    NodeError,
    NodeType,
    Sockets,
    SocketsContext,
)
from compono.graph.sockets import AnyType, ChoiceType, SocketType, accepts, name_of
from compono.graph.values import Value, from_json

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NodeResult:
    """What became of one node."""

    # Its sockets, with its exposed properties as inputs
    sockets: Sockets
    # Its outputs' values, by output. Empty if it didn't evaluate
    outputs: Mapping[str, Value]
    # The values it evaluated with, by input. Empty if it didn't evaluate
    inputs: Mapping[str, Value] = field(default_factory=dict)
    # Why it can't evaluate
    error: str | None = None
    # Not evaluated, because a node it takes values from has an error
    skipped: bool = False


@dataclass(frozen=True)
class Evaluation:
    """Every node's result, and why each refused wire is refused."""

    nodes: Mapping[str, NodeResult]
    wires: Mapping[str, str]
    # Runtime options for accepted Choice wires with a narrower destination.
    choice_options: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    inactive_wires: frozenset[str] = frozenset()


@dataclass
class _Node:
    """A node while it's evaluated."""

    node: Node
    node_type: NodeType | None
    properties: dict[str, Value]
    sockets: Sockets = field(default_factory=Sockets)
    sockets_ready: bool = False
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

    outputs: dict[str, Mapping[str, Value]] = {}
    inputs: dict[str, Mapping[str, Value]] = {}
    choice_options: dict[str, tuple[str, ...]] = {}
    for node_id in order:
        node = nodes[node_id]
        _sockets(
            node, nodes, wires.get(node_id, []), outputs, refused, choice_options, graph
        )
        outputs[node_id], inputs[node_id] = _values(node, nodes, outputs, graph)

    inactive = {
        (node_id, socket.id)
        for node_id, node in nodes.items()
        for socket in node.sockets.inactive_inputs
    }
    return Evaluation(
        nodes={
            node_id: NodeResult(
                sockets=nodes[node_id].sockets,
                outputs=outputs[node_id],
                inputs=inputs[node_id],
                error=nodes[node_id].error,
                skipped=nodes[node_id].skipped,
            )
            for node_id in order
        },
        wires=refused,
        choice_options=choice_options,
        inactive_wires=frozenset(
            wire.id
            for wire in graph.wires
            if (wire.to.node, wire.to.socket) in inactive
        ),
    )


def _nodes(graph: Graph, node_types: Mapping[str, NodeType]) -> dict[str, _Node]:
    nodes: dict[str, _Node] = {}
    singles: set[str] = set()
    for node in graph.nodes:
        # The first of two nodes with one id wins
        if node.id in nodes:
            continue
        node_type = node_types.get(node.type)
        evaluated = _Node(node=node, node_type=node_type, properties={})
        if node_type is None:
            evaluated.error = f"There's no {node.type} node"
        elif node_type.single and node_type.type in singles:
            evaluated.error = f"A component has one {node_type.name}"
        else:
            singles.add(node_type.type)
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
    outputs: Mapping[str, Mapping[str, Value]],
    refused: dict[str, str],
    choice_options: dict[str, tuple[str, ...]],
    graph: Graph,
) -> None:
    """Works out the node's sockets from its properties and the types wired into it, then refuses the wires that don't fit."""
    # What each wire brings from the nodes already evaluated
    wired: dict[str, SocketType] = {}
    wired_values: dict[str, Value] = {}
    candidates: list[Wire] = []
    accepts_unselected = (
        () if node.node_type is None else node.node_type.accepts_unselected_choices
    )
    for wire in wires:
        source = nodes[wire.from_.node]
        output = _output_type(source, wire.from_.socket)
        value = outputs[wire.from_.node].get(wire.from_.socket)
        if (
            isinstance(output, ChoiceType)
            and value is None
            and source.error is None
            and not source.skipped
            and wire.to.socket not in accepts_unselected
        ):
            refused[wire.id] = "No choice selected"
            continue
        candidates.append(wire)
        if output is not None:
            wired[wire.to.socket] = output
            wired_values[wire.to.socket] = value

    if node.node_type is not None and node.error is None:
        try:
            sockets = node.node_type.sockets(
                SocketsContext(
                    properties=node.properties,
                    wired=wired,
                    typed=node.node.values,
                    props=graph.props,
                    wired_values=wired_values,
                    fields=node.node.fields,
                )
            )
            node.sockets = _with_exposed(node, sockets)
            node.sockets_ready = True
        except NodeError as error:
            node.error = str(error)

    accepted: dict[str, Wire] = {}
    inactive = {socket.id for socket in node.sockets.inactive_inputs}
    for wire in candidates:
        reason = _refusal(
            wire,
            nodes[wire.from_.node],
            node,
            wired_values.get(wire.to.socket),
            choice_options,
        )
        if reason is not None:
            refused[wire.id] = reason
        elif wire.to.socket not in inactive:
            accepted[wire.to.socket] = wire
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
    return replace(sockets, inputs=sockets.inputs + exposed)


def _input_type(node: _Node, socket: str) -> SocketType | None:
    for each in (*node.sockets.inputs, *node.sockets.inactive_inputs):
        if each.id == socket:
            return each.type
    # A row of a group, like children/<row id>
    group, _, row = socket.partition("/")
    for socket_group in node.sockets.groups:
        if socket_group.id == group and row in node.node.groups.get(group, []):
            return socket_group.type
    return None


def _refusal(
    wire: Wire,
    start: _Node,
    node: _Node,
    value: Value,
    choice_options: dict[str, tuple[str, ...]],
) -> str | None:
    """Why the wire can't be used, if it can't."""
    # A value error still leaves sockets that can be checked.
    if not start.sockets_ready or not node.sockets_ready:
        return None
    output = _output_type(start, wire.from_.socket)
    if output is None:
        return f"{_name(start)} has no output {wire.from_.socket}"
    into = _input_type(node, wire.to.socket)
    if into is None:
        return f"{_name(node)} has no input {wire.to.socket}"

    if isinstance(into, ChoiceType) and isinstance(output, ChoiceType):
        if start.error is not None or start.skipped:
            return None
        if value is None and accepts(into, output):
            return None
        if isinstance(value, str) and value in into.options:
            options = tuple(
                option for option in output.options if option in into.options
            )
            if len(options) < len(output.options):
                choice_options[wire.id] = options
            return None
        label = next(
            (each.label for each in node.sockets.inputs if each.id == wire.to.socket),
            wire.to.socket,
        )
        return f"{label} can't be {value}"

    if accepts(into, output):
        return None
    if isinstance(into, AnyType):
        return f"{_name(node)} doesn't accept {name_of(output)}"
    return f"{name_of(output)} can't go into {name_of(into)}"


def _name(node: _Node) -> str:
    return node.node_type.name if node.node_type is not None else node.node.type


def _values(
    node: _Node,
    nodes: Mapping[str, _Node],
    outputs: Mapping[str, Mapping[str, Value]],
    graph: Graph,
) -> tuple[Mapping[str, Value], Mapping[str, Value]]:
    """The node's outputs and the inputs they came from, or neither if it, or a node before it, has an error."""
    wires = node.wires or {}
    if node.error is not None or node.node_type is None:
        return {}, {}
    if any(
        nodes[wire.from_.node].error is not None or nodes[wire.from_.node].skipped
        for wire in wires.values()
    ):
        node.skipped = True
        return {}, {}

    def brought(socket: str) -> Value:
        wire = wires.get(socket)
        return outputs[wire.from_.node].get(wire.from_.socket) if wire else None

    def value(socket: Input) -> Value:
        wired = brought(socket.id)
        return socket.local_value(node.node.values) if wired is None else wired

    def row_value(socket: str, socket_type: SocketType) -> Value:
        wired = brought(socket)
        return (
            from_json(node.node.values.get(socket), socket_type)
            if wired is None
            else wired
        )

    try:
        inputs = {each.id: value(each) for each in node.sockets.inputs}
        groups = {
            group.id: tuple(
                row_value(f"{group.id}/{row}", group.type)
                for row in node.node.groups.get(group.id, [])
            )
            for group in node.sockets.groups
        }
    except ValueError as error:
        node.error = f"A value typed in {error}"
        return {}, {}

    properties = {
        name: inputs[name] if name in node.node.exposed else prop
        for name, prop in node.properties.items()
    }
    try:
        computed = node.node_type.evaluate(
            EvaluateContext(
                inputs=inputs,
                groups=groups,
                properties=properties,
                props=graph.props,
                fields=node.node.fields,
                input_sockets=node.sockets.inputs,
            )
        )
    except NodeError as error:
        node.error = str(error)
        return {}, {}
    except Exception:
        logger.exception("The %s node %s failed", node.node.type, node.node.id)
        node.error = "Something went wrong in this node"
        return {}, {}
    given = {output.id: computed.get(output.id) for output in node.sockets.outputs}
    return given, inputs
