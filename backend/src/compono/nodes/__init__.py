"""Compono's node types."""

from collections.abc import Mapping
from typing import Final

from compono.graph.node_types import NodeType


def by_type(*node_types: NodeType) -> Mapping[str, NodeType]:
    """The node types, by the type that graphs store."""
    return {node_type.type: node_type for node_type in node_types}


# Every node type. A test fails when a module's node type isn't here
NODE_TYPES: Final[Mapping[str, NodeType]] = by_type()
