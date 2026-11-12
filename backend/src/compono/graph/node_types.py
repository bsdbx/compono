"""What a node type is: its sockets, properties, and how it turns inputs into outputs."""

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

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


@dataclass(frozen=True)
class Js:
    """A JavaScript expression: a value that depends on the props, so it's only known when the component renders."""

    code: str
    # What it is when the expression is Nothing, like a value typed in on the node
    fallback: Value = None


@dataclass(frozen=True)
class Jsx:
    """A JSX element. Its tag is an expression when it depends on the props, and empty for a fragment."""

    tag: str | Js
    # By HTML attribute name, like class and tabindex
    attributes: tuple[tuple[str, Code], ...] = ()
    children: tuple[Code, ...] = ()


# What a socket is in code: a value known now, or one the props give
type Code = Value | Js | Jsx


@dataclass(frozen=True)
class CodeContext:
    """What a node writes its outputs' code from: as EvaluateContext, with expressions for what depends on the props."""

    inputs: Mapping[str, Code]
    groups: Mapping[str, tuple[Code, ...]]
    properties: Mapping[str, Code]


def literal(value: Value) -> str:
    """A value as a JavaScript literal."""
    match value:
        case None:
            return "null"
        case bool():
            return "true" if value else "false"
        case int() | float():
            return repr(value)
        case str():
            return json.dumps(value, ensure_ascii=False)
        case datetime():
            return json.dumps(value.isoformat())
        case dict():
            fields = ", ".join(
                f"{json.dumps(name)}: {literal(field)}" for name, field in value.items()
            )
            return f"{{{fields}}}"
        case _:
            raise TypeError(f"{value!r} has no literal")


def expression(code: Js) -> str:
    """The expression, falling back to its fallback when it gives Nothing."""
    if code.fallback is None:
        return code.code

    return f"({code.code} ?? {literal(code.fallback)})"


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
    # Its outputs as code, when its inputs depend on the props. A node without it can only take values known now
    code: Callable[[CodeContext], Mapping[str, Code]] | None = None


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
