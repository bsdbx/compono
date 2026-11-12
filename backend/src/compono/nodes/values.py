"""Nodes that give a value set on them: Boolean, Number, Text, Choice and Nothing."""

import math
from collections.abc import Mapping
from typing import Final

from compono.graph.node_types import (
    EvaluateContext,
    NodeError,
    NodeType,
    Output,
    Property,
    Sockets,
    SocketsContext,
    number,
    text,
)
from compono.graph.sockets import (
    BooleanType,
    ChoiceType,
    NothingType,
    NumberType,
    TextType,
)
from compono.graph.values import Value

CATEGORY: Final = "Values"

CONSTANTS: Final[Mapping[str, float]] = {"Pi": math.pi, "E": math.e}


def _value_output(
    socket_type: BooleanType | NumberType | TextType | ChoiceType | NothingType,
) -> Sockets:
    return Sockets(outputs=(Output("value", "Value", socket_type),))


BOOLEAN: Final = NodeType(
    type="boolean",
    name="Boolean",
    category=CATEGORY,
    properties=(Property("value", "Value", BooleanType(), False, on_node=True),),
    sockets=lambda _: _value_output(BooleanType()),
    evaluate=lambda context: {"value": context.properties["value"]},
)


def _number_type(context: SocketsContext | EvaluateContext) -> NumberType:
    return NumberType(integer=context.properties["subtype"] == "Integer")


def _number(context: EvaluateContext) -> Mapping[str, Value]:
    constant = text(context.properties["constant"])
    value = CONSTANTS.get(constant, number(context.properties["value"]))
    if _number_type(context).integer and value is not None:
        if not float(value).is_integer():
            raise NodeError(
                f"{constant if constant in CONSTANTS else value} isn't a whole number"
            )
        value = int(value)
    return {"value": value}


NUMBER: Final = NodeType(
    type="number",
    name="Number",
    category=CATEGORY,
    properties=(
        Property(
            "subtype", "Subtype", ChoiceType(options=("Number", "Integer")), "Number"
        ),
        Property(
            "constant", "Constant", ChoiceType(options=("Custom", *CONSTANTS)), "Custom"
        ),
        Property("value", "Value", NumberType(), 0, on_node=True),
    ),
    sockets=lambda context: _value_output(_number_type(context)),
    evaluate=_number,
)

TEXT: Final = NodeType(
    type="text",
    name="Text",
    category=CATEGORY,
    properties=(
        Property("subtype", "Subtype", ChoiceType(options=("Text", "Link")), "Text"),
        Property("value", "Value", TextType(), "", on_node=True),
    ),
    sockets=lambda context: _value_output(
        TextType(link=context.properties["subtype"] == "Link")
    ),
    evaluate=lambda context: {"value": context.properties["value"]},
)


def _choice_sockets(context: SocketsContext) -> Sockets:
    # It can only be its own value, so it fits any Choice that has it. The canvas offers the options of the input it's wired into
    value = text(context.properties["value"])
    return _value_output(ChoiceType(options=(value,) if value else ()))


CHOICE: Final = NodeType(
    type="choice",
    name="Choice",
    category=CATEGORY,
    properties=(Property("value", "Value", TextType(), "", on_node=True),),
    sockets=_choice_sockets,
    # No option chosen is Nothing
    evaluate=lambda context: {"value": text(context.properties["value"]) or None},
)

NOTHING: Final = NodeType(
    type="nothing",
    name="Nothing",
    category=CATEGORY,
    # Which one the exported code uses
    properties=(
        Property(
            "value",
            "Value",
            ChoiceType(options=("null", "undefined")),
            "null",
            on_node=True,
        ),
    ),
    sockets=lambda _: _value_output(NothingType()),
    evaluate=lambda _: {"value": None},
)

NODE_TYPES: Final = (BOOLEAN, NUMBER, TEXT, CHOICE, NOTHING)
