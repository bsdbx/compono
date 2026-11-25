"""A component's own nodes: its props coming in, and what it renders going out."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from compono.graph.model import Graph, Node, Prop
from compono.graph.node_types import (
    EvaluateContext,
    Input,
    NodeError,
    NodeType,
    Output,
    Sockets,
    SocketsContext,
)
from compono.graph.sockets import AnyType, NothingType, SlotType, name_of
from compono.graph.values import Value, from_json

CATEGORY: Final = "Component"


def _check(props: Sequence[Prop]) -> None:
    """Raises NodeError for a prop React can't take, or whose default doesn't fit it."""
    names: set[str] = set()
    for prop in props:
        name = prop.name
        # A lowercase letter, then letters and digits, like ctaHref
        if not (name[:1].islower() and name.isascii() and name.isalnum()):
            raise NodeError(
                f"{name or 'A prop'} can't be a prop's name. Start with a lowercase letter, then use letters and digits"
            )

        if name in names:
            raise NodeError(f"Two props are named {name}")
        names.add(name)

        if isinstance(prop.type, (SlotType, NothingType, AnyType)):
            raise NodeError(f"{name} can't be {name_of(prop.type)}")

        try:
            from_json(prop.default, prop.type)
        except ValueError as error:
            raise NodeError(f"{name}'s default {error}") from error


def _input_sockets(context: SocketsContext) -> Sockets:
    _check(context.props)
    return Sockets(
        outputs=tuple(Output(prop.id, prop.name, prop.type) for prop in context.props)
    )


def _input_values(context: EvaluateContext) -> Mapping[str, Value]:
    # In the Preview, each prop is its default, or Nothing without one
    return {prop.id: from_json(prop.default, prop.type) for prop in context.props}


COMPONENT_INPUT: Final = NodeType(
    type="component-input",
    name="Component Input",
    category=CATEGORY,
    sockets=_input_sockets,
    evaluate=_input_values,
    single=True,
)

COMPONENT_OUTPUT: Final = NodeType(
    type="component-output",
    name="Component Output",
    category=CATEGORY,
    # What's wired into Render is what the component renders
    sockets=lambda _: Sockets(inputs=(Input("render", "Render", SlotType()),)),
    evaluate=lambda _: {},
    single=True,
)

NODE_TYPES: Final = (COMPONENT_INPUT, COMPONENT_OUTPUT)


@dataclass(frozen=True)
class RenderPath:
    output: Node | None
    nodes: set[str]
    refused: dict[str, str]


def render_path(graph: Graph, refused: Mapping[str, str]) -> RenderPath:
    """Follow accepted wires back from Render and collect errors on those inputs."""
    output = next(
        (node for node in graph.nodes if node.type == COMPONENT_OUTPUT.type), None
    )
    if output is None:
        return RenderPath(None, set(), {})

    sources: dict[str, list[str]] = {}
    for wire in graph.wires:
        if wire.id not in refused:
            sources.setdefault(wire.to.node, []).append(wire.from_.node)

    nodes = {output.id}
    pending = [output.id]
    while pending:
        for source in sources.get(pending.pop(), []):
            if source not in nodes:
                nodes.add(source)
                pending.append(source)

    errors = {
        wire.id: refused[wire.id]
        for wire in graph.wires
        if wire.to.node in nodes and wire.id in refused
    }
    return RenderPath(output, nodes, errors)


def new_graph() -> dict[str, object]:
    """The graph a new component starts with: its Component Input, and its Component Output to the right."""
    return {
        "format": 1,
        "props": [],
        "nodes": [
            {"id": "input", "type": COMPONENT_INPUT.type, "position": {"x": 0, "y": 0}},
            {
                "id": "output",
                "type": COMPONENT_OUTPUT.type,
                "position": {"x": 440, "y": 0},
            },
        ],
        "wires": [],
    }
