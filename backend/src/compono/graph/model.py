"""A component's graph, as it's stored: format 1."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from compono.graph.sockets import SocketType


class Position(BaseModel):
    """Where a node sits on the canvas."""

    x: float = 0
    y: float = 0


class Node(BaseModel):
    """One node. A socket of a group is named like `children/<row id>`."""

    id: str
    type: str
    position: Position = Position()
    # Typed into inputs on the node, by input
    values: dict[str, JsonValue] = {}
    # Set in the properties panel, by property
    properties: dict[str, JsonValue] = {}
    # The properties that show as inputs, and take wires
    exposed: list[str] = []
    # The rows of each socket group, in order
    groups: dict[str, list[str]] = {}


class End(BaseModel):
    """A socket of a node: where a wire starts or ends."""

    node: str
    socket: str


class Wire(BaseModel):
    """From an output to an input."""

    # "from" is a Python keyword, so the field is from_, and "from" in JSON
    model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True)

    id: str
    from_: End = Field(alias="from")
    to: End


class Prop(BaseModel):
    """A value the component takes from whoever uses it. Component Input gives each prop as an output."""

    # The output's id, which stays when the prop is renamed, so its wires stay too
    id: str
    # Its name in React, like ctaHref
    name: str
    type: SocketType
    required: bool = False
    default: JsonValue = None
    description: str = ""


class Graph(BaseModel):
    """Nodes and wires. A new component's graph is `{}`, which is a graph of neither."""

    format: Literal[1] = 1
    props: list[Prop] = []
    nodes: list[Node] = []
    wires: list[Wire] = []
