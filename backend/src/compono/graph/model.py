"""A component's graph, as it's stored: format 1."""

import math
from typing import Final, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from compono.graph.sockets import SocketType

_NUMBER_PRESETS: Final = {"Pi": math.pi, "E": math.e}


def _record(value: object) -> dict[str, object]:
    return cast(dict[str, object], value) if isinstance(value, dict) else {}


def upgrade_number_presets(graph: dict[str, object]) -> dict[str, object]:
    """Turn a saved Number preset into a value and remove its retired input."""
    stored_nodes = graph.get("nodes")
    if not isinstance(stored_nodes, list):
        return graph

    numbers: set[str] = set()
    nodes: list[object] = []
    for stored in cast(list[object], stored_nodes):
        node = _record(stored)
        node_id = node.get("id")
        if node.get("type") != "number" or not isinstance(node_id, str):
            nodes.append(stored)
            continue

        numbers.add(node_id)
        updated = node.copy()
        properties = _record(node.get("properties"))
        if "constant" in properties:
            properties = properties.copy()
            preset = properties.pop("constant")
            if isinstance(preset, str) and preset in _NUMBER_PRESETS:
                properties["value"] = _NUMBER_PRESETS[preset]
            updated["properties"] = properties
        for field in ("exposed", "propertyOrder"):
            fields = node.get(field)
            if isinstance(fields, list):
                updated[field] = [
                    entry for entry in cast(list[object], fields) if entry != "constant"
                ]
        nodes.append(updated)

    if not numbers:
        return graph

    upgraded = {**graph, "nodes": nodes}
    stored_wires = graph.get("wires")
    if isinstance(stored_wires, list):
        wires: list[object] = []
        for wire in cast(list[object], stored_wires):
            target = _record(_record(wire).get("to"))
            node_id = target.get("node")
            if (
                target.get("socket") == "constant"
                and isinstance(node_id, str)
                and node_id in numbers
            ):
                continue
            wires.append(wire)
        upgraded["wires"] = wires
    return upgraded


class Position(BaseModel):
    """Where a node sits on the canvas."""

    x: float = 0
    y: float = 0


class ObjectField(BaseModel):
    """A named Object field with a socket ID that survives renaming."""

    id: str
    name: str
    type: SocketType


class Node(BaseModel):
    """One node. A socket of a group is named like `children/<row id>`."""

    id: str
    type: str
    # An optional display label; it does not affect sockets, evaluation or code.
    name: str | None = Field(default=None, max_length=128)
    # Canvas layout only; height follows the node's content.
    width: float | None = Field(default=None, ge=168, le=1024)
    collapsed: bool = False
    position: Position = Position()
    # Typed into inputs on the node, by input
    values: dict[str, JsonValue] = {}
    # Set in the properties panel, by property
    properties: dict[str, JsonValue] = {}
    # The properties that show as inputs, and take wires
    exposed: list[str] = []
    # The rows of each socket group, in order
    groups: dict[str, list[str]] = {}
    fields: list[ObjectField] = []


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

    @model_validator(mode="before")
    @classmethod
    def legacy_number_presets(cls, data: object) -> object:
        return upgrade_number_presets(_record(data)) if isinstance(data, dict) else data
