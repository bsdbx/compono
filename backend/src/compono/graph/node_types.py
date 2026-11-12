"""What a node type is: its sockets, properties, and how it turns inputs into outputs."""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from pydantic import JsonValue

from compono.graph.model import Prop
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
    # The input it shows before on the node. None puts it after them all
    before: str | None = None


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
    # Set on the node next to its output, like a Number's value, not only in the properties panel
    on_node: bool = False


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
    # The values typed in on the node, by input, as stored
    typed: Mapping[str, JsonValue]
    # The component's props
    props: Sequence[Prop]


@dataclass(frozen=True)
class EvaluateContext:
    """What a node computes its outputs from."""

    # By input: the wired value, else the typed one, else the default. None is Nothing
    inputs: Mapping[str, Value]
    # By group: its rows' values, in order
    groups: Mapping[str, tuple[Value, ...]]
    # By property, an exposed one with its wired value
    properties: Mapping[str, Value]
    # The component's props
    props: Sequence[Prop]


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
    # A graph has at most one, like Component Input
    single: bool = False


def text(value: Value) -> str:
    """A Text or Choice value. Nothing is empty text."""
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    raise TypeError(f"{value!r} isn't text")


def boolean(value: Value) -> bool:
    """A Boolean value. Nothing is false."""
    if value is None:
        return False

    if isinstance(value, bool):
        return value

    raise TypeError(f"{value!r} isn't a Boolean")


def number(value: Value) -> int | float | None:
    """A Number value, or None for Nothing."""
    if value is None or (
        isinstance(value, int | float) and not isinstance(value, bool)
    ):
        return value

    raise TypeError(f"{value!r} isn't a Number")
