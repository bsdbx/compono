"""The values that travel along wires, and their JSON."""

import math
from dataclasses import dataclass
from datetime import UTC, datetime

from pydantic import JsonValue

from compono.graph.sockets import (
    AnyType,
    BooleanType,
    ChoiceType,
    DateType,
    ElementType,
    NothingType,
    NumberType,
    ObjectType,
    SlotType,
    SocketType,
    TextType,
    name_of,
)


@dataclass(frozen=True)
class Element:
    """Rendered markup: a tag, its class name, attributes and children."""

    # Empty for a fragment: the children without an element around them
    tag: str
    class_name: str = ""
    # By HTML attribute name. True is an attribute that's just there, like hidden
    attributes: tuple[tuple[str, str | int | bool], ...] = ()
    children: tuple[Element | str, ...] = ()
    # React's key, which tells siblings apart
    key: str = ""


# None is Nothing. A Choice is its option, a Date is a datetime in UTC, an Object is a dict of its fields
type Value = None | bool | int | float | str | datetime | Element | dict[str, Value]


def from_json(json: JsonValue, socket_type: SocketType) -> Value:
    """The value that JSON stands for in a socket of the type, such as a value typed in on a node. Raises ValueError if it doesn't fit."""
    # Nothing fits everywhere
    if json is None:
        return None

    match socket_type:
        case BooleanType():
            if isinstance(json, bool):
                return json
        case NumberType():
            if isinstance(json, int | float) and not isinstance(json, bool):
                return _number(json, socket_type)
        case TextType():
            if isinstance(json, str):
                return json
        case ChoiceType():
            if isinstance(json, str) and json in socket_type.options:
                return json
        case ObjectType():
            if isinstance(json, dict):
                return {
                    name: from_json(json.get(name), field)
                    for name, field in socket_type.fields.items()
                }
        case DateType():
            if isinstance(json, str):
                return _date(json)
        case AnyType():
            return _any(json)
        case ElementType() | SlotType() | NothingType():
            # Made by nodes, never typed in
            pass

    raise ValueError(f"isn't {_article(name_of(socket_type))}")


def _number(number: float, socket_type: NumberType) -> int | float:
    if not math.isfinite(number):
        raise ValueError("isn't a number")
    if socket_type.integer:
        if not float(number).is_integer():
            raise ValueError("isn't a whole number")
        number = int(number)
    if socket_type.minimum is not None and number < socket_type.minimum:
        raise ValueError(f"is less than {socket_type.minimum:g}")
    if socket_type.maximum is not None and number > socket_type.maximum:
        raise ValueError(f"is more than {socket_type.maximum:g}")
    return number


def _date(text: str) -> datetime:
    try:
        date = datetime.fromisoformat(text)
    except ValueError as error:
        raise ValueError("isn't a date") from error
    # A date without a time zone is in UTC
    if date.tzinfo is None:
        date = date.replace(tzinfo=UTC)
    return date.astimezone(UTC)


def _any(json: JsonValue) -> Value:
    if isinstance(json, dict):
        return {name: _any(item) for name, item in json.items()}
    if isinstance(json, (str, int, float, bool)) or json is None:
        return json
    # A list: the alpha has none
    raise ValueError("can't be a list")


def _article(name: str) -> str:
    return f"an {name}" if name[0] in "AEIOU" else f"a {name}"


def to_json(value: Value) -> JsonValue:
    """The value as JSON, as the API answers it."""
    match value:
        case Element():
            return {
                "tag": value.tag,
                "key": value.key,
                "className": value.class_name,
                "attributes": dict(value.attributes),
                "children": [
                    child if isinstance(child, str) else to_json(child)
                    for child in value.children
                ],
            }
        case datetime():
            return value.isoformat()
        case dict():
            return {name: to_json(item) for name, item in value.items()}
        case _:
            return value
