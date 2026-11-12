"""Socket types: what a socket accepts or gives. A type is a value, so Number carries its range and Object its fields."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Discriminator


class _Type(BaseModel):
    model_config = ConfigDict(frozen=True)


class BooleanType(_Type):
    kind: Literal["boolean"] = "boolean"


class NumberType(_Type):
    """A number. Its subtype Integer is a whole number."""

    kind: Literal["number"] = "number"
    integer: bool = False
    minimum: float | None = None
    maximum: float | None = None
    # How much a number field steps by. Only the field uses it
    step: float | None = None


class TextType(_Type):
    """Text. Its subtype Link is an address to go to."""

    kind: Literal["text"] = "text"
    link: bool = False


class ChoiceType(_Type):
    """One of a fixed set of options, such as an HTML tag."""

    kind: Literal["choice"] = "choice"
    options: tuple[str, ...]


class ObjectType(_Type):
    """Named fields, each with a socket type of its own."""

    kind: Literal["object"] = "object"
    fields: dict[str, SocketType]


class DateType(_Type):
    kind: Literal["date"] = "date"


class ElementType(_Type):
    """Rendered markup, such as an HTML element with its children."""

    kind: Literal["element"] = "element"


class SlotType(_Type):
    """Where a component renders. It takes an Element."""

    kind: Literal["slot"] = "slot"


class NothingType(_Type):
    """No value. A wire that brings Nothing counts as no wire."""

    kind: Literal["nothing"] = "nothing"


class AnyType(_Type):
    """An input that takes whatever type is wired into it."""

    kind: Literal["any"] = "any"


type SocketType = Annotated[
    BooleanType
    | NumberType
    | TextType
    | ChoiceType
    | ObjectType
    | DateType
    | ElementType
    | SlotType
    | NothingType
    | AnyType,
    Discriminator("kind"),
]

ObjectType.model_rebuild()


def accepts(into: SocketType, out: SocketType) -> bool:
    """Whether a wire may run from an output of the type `out` into an input of the type `into`."""
    # Any takes everything, and Nothing counts as no wire. An output still Any isn't known yet, so it's let through
    if isinstance(into, AnyType) or isinstance(out, NothingType | AnyType):
        return True

    # The place a component renders takes an Element
    if isinstance(into, SlotType):
        return isinstance(out, ElementType)

    # A subtype feeds its type: Integer feeds Number, and Link feeds Text, but not the other way
    if isinstance(into, NumberType):
        return isinstance(out, NumberType) and (out.integer or not into.integer)

    if isinstance(into, TextType):
        return isinstance(out, TextType) and (out.link or not into.link)

    # Fewer options fit into more
    if isinstance(into, ChoiceType):
        return isinstance(out, ChoiceType) and set(out.options) <= set(into.options)

    # An object with every field the input needs, each of a type it accepts
    if isinstance(into, ObjectType):
        return isinstance(out, ObjectType) and all(
            name in out.fields and accepts(field, out.fields[name])
            for name, field in into.fields.items()
        )

    # Boolean, Date, Element and Nothing take only themselves
    return type(into) is type(out)


def name_of(socket_type: SocketType) -> str:
    """The type's name, as people read it: Number, Integer, Link..."""
    if isinstance(socket_type, NumberType) and socket_type.integer:
        return "Integer"

    if isinstance(socket_type, TextType) and socket_type.link:
        return "Link"

    return socket_type.kind.capitalize()
