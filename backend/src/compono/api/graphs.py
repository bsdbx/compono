"""The graph engine: the node types there are, and evaluating a component's graph."""

from collections.abc import Mapping
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, JsonValue

from compono.api.dependencies import SignedIn
from compono.api.teams import NOT_SIGNED_IN, answers
from compono.graph.evaluate import evaluate
from compono.graph.model import Graph
from compono.graph.node_types import NodeError, NodeType, Sockets, SocketsContext
from compono.graph.sockets import SocketType
from compono.graph.values import to_json
from compono.nodes import NODE_TYPES
from compono.nodes.component import COMPONENT_OUTPUT

router = APIRouter()


def node_types() -> Mapping[str, NodeType]:
    """Every node type, by type. Tests answer with their own."""
    return NODE_TYPES


type NodeTypes = Annotated[Mapping[str, NodeType], Depends(node_types)]


class InputSocket(BaseModel):
    id: str
    label: str
    type: SocketType
    # What the input uses without a wire or a typed value
    default: JsonValue


class GroupSocket(BaseModel):
    """A socket group. Its rows are named like `children/<row id>`."""

    id: str
    label: str
    type: SocketType
    # The input it shows before on the node. None puts it after them all
    before: str | None


class OutputSocket(BaseModel):
    id: str
    label: str
    type: SocketType


class NodeSockets(BaseModel):
    inputs: list[InputSocket]
    groups: list[GroupSocket]
    outputs: list[OutputSocket]


def sockets_of(sockets: Sockets) -> NodeSockets:
    return NodeSockets(
        inputs=[
            InputSocket(
                id=each.id,
                label=each.label,
                type=each.type,
                default=to_json(each.default),
            )
            for each in sockets.inputs
        ],
        groups=[
            GroupSocket(
                id=group.id, label=group.label, type=group.type, before=group.before
            )
            for group in sockets.groups
        ],
        outputs=[
            OutputSocket(id=output.id, label=output.label, type=output.type)
            for output in sockets.outputs
        ],
    )


class NodeProperty(BaseModel):
    id: str
    label: str
    type: SocketType
    default: JsonValue
    # Set on the node next to its output, like a Number's value, not only in the properties panel
    on_node: bool


class NodeTypeInfo(BaseModel):
    """A node type, for the Add node menu, the canvas and the properties panel."""

    type: str
    name: str
    category: str
    # A graph has at most one, like Component Input
    single: bool
    properties: list[NodeProperty]
    # Its sockets as a new node has them: properties as they start, nothing wired
    sockets: NodeSockets


@router.get("/api/node-types", responses=answers(NOT_SIGNED_IN))
def list_node_types(_: SignedIn, types: NodeTypes) -> list[NodeTypeInfo]:
    """Every node type there is."""
    listed: list[NodeTypeInfo] = []
    for node_type in types.values():
        starting = {prop.id: prop.default for prop in node_type.properties}
        try:
            sockets = node_type.sockets(
                SocketsContext(properties=starting, wired={}, typed={}, props=[])
            )
        except NodeError:
            sockets = Sockets()
        listed.append(
            NodeTypeInfo(
                type=node_type.type,
                name=node_type.name,
                category=node_type.category,
                single=node_type.single,
                properties=[
                    NodeProperty(
                        id=prop.id,
                        label=prop.label,
                        type=prop.type,
                        default=to_json(prop.default),
                        on_node=prop.on_node,
                    )
                    for prop in node_type.properties
                ],
                sockets=sockets_of(sockets),
            )
        )
    return listed


class EvaluatedNode(BaseModel):
    """What became of a node."""

    # Its sockets, which can follow its properties and what's wired into it
    sockets: NodeSockets
    # Its outputs' values, by output. Empty if it didn't evaluate
    outputs: dict[str, JsonValue]
    # Why it can't evaluate
    error: str | None
    # Not evaluated, because a node before it has an error
    skipped: bool


class Evaluated(BaseModel):
    """Every node of the graph, by node, and why each refused wire is refused, by wire."""

    nodes: dict[str, EvaluatedNode]
    wires: dict[str, str]
    # What the component renders: the value wired into Component Output's Render, if any
    rendered: JsonValue


@router.post("/api/evaluate", responses=answers(NOT_SIGNED_IN))
def evaluate_graph(graph: Graph, _: SignedIn, types: NodeTypes) -> Evaluated:
    """Evaluates a graph: every node's sockets and values, and the wires it refuses."""
    evaluation = evaluate(graph, types)
    outputs = [node.id for node in graph.nodes if node.type == COMPONENT_OUTPUT.type]
    rendered = (
        evaluation.nodes[outputs[0]].inputs.get("render")
        if outputs and outputs[0] in evaluation.nodes
        else None
    )
    return Evaluated(
        nodes={
            node_id: EvaluatedNode(
                sockets=sockets_of(result.sockets),
                outputs={
                    socket: to_json(value) for socket, value in result.outputs.items()
                },
                error=result.error,
                skipped=result.skipped,
            )
            for node_id, result in evaluation.nodes.items()
        },
        wires=dict(evaluation.wires),
        rendered=to_json(rendered),
    )
