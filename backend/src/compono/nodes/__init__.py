"""Compono's node types."""

from collections.abc import Mapping
from typing import Final

from compono.graph.node_types import NodeType
from compono.nodes import component, elements, logic, text, values


def by_type(*node_types: NodeType) -> Mapping[str, NodeType]:
    """The node types, by the type that graphs store."""
    return {node_type.type: node_type for node_type in node_types}


# Every module of node types. A test fails when one isn't here
MODULES: Final = (component, elements, values, logic, text)

# Every node type, in the order the Add node menu lists them
NODE_TYPES: Final[Mapping[str, NodeType]] = by_type(
    *component.NODE_TYPES,
    *elements.NODE_TYPES,
    *values.NODE_TYPES,
    *logic.NODE_TYPES,
    *text.NODE_TYPES,
)
