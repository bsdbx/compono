"""What a node type is: its sockets, properties, and how it turns inputs into outputs."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from compono.graph.sockets import SocketType
from compono.graph.values import Value


@dataclass(frozen=True)
class Input:
    """A socket a node takes a value through. Without a wire it uses the value typed in on the node, or `default`."""

    id: str
    label: str
    type: SocketType
    default: Value = None


@dataclass(frozen=True)
class Group:
    """A socket group: numbered inputs that grow a row at a time, such as an Element's Children."""

    id: str
    label: str
    type: SocketType


@dataclass(frozen=True)
class Output:
    """A socket a node passes a result through."""

    id: str
    label: str
    type: SocketType


@dataclass(frozen=True)
class Property:
    """A setting from the properties panel. Exposed, it shows as an input and takes a wire."""

    id: str
    label: str
    type: SocketType
    default: Value = None


@dataclass(frozen=True)
class Sockets:
    """A node's sockets, which can depend on its properties and on what's wired into it."""

    inputs: tuple[Input, ...] = ()
    groups: tuple[Group, ...] = ()
    outputs: tuple[Output, ...] = ()


@dataclass(frozen=True)
class SocketsContext:
    """What a node's sockets can depend on."""

    # Its properties, as set or by default
    properties: Mapping[str, Value]
    # The socket type of each wired input's output, by input
    wired: Mapping[str, SocketType]


@dataclass(frozen=True)
class EvaluateContext:
    """What a node computes its outputs from."""

    # By input: the wired value, else the typed one, else the default. None is Nothing
    inputs: Mapping[str, Value]
    # By group: its rows' values, in order
    groups: Mapping[str, tuple[Value, ...]]
    # By property, an exposed one with its wired value
    properties: Mapping[str, Value]


class NodeError(Exception):
    """The node can't evaluate, and the message says why, such as "badge.tone no longer exists"."""


@dataclass(frozen=True)
class NodeType:
    """A kind of node, such as Element or Switch."""

    # Stored in graphs, so it never changes
    type: str
    name: str
    category: str
    sockets: Callable[[SocketsContext], Sockets]
    # The outputs' values, by output. Pure: the same inputs always give the same outputs
    evaluate: Callable[[EvaluateContext], Mapping[str, Value]]
    properties: tuple[Property, ...] = ()
