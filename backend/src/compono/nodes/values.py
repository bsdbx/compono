"""Nodes that supply values or work with Object fields."""

from collections.abc import Mapping
from typing import Final
from urllib.parse import quote

from compono.graph.node_types import (
    Code,
    CodeContext,
    EvaluateContext,
    Input,
    Js,
    NodeError,
    NodeType,
    Output,
    Property,
    Sockets,
    SocketsContext,
    expression,
    js_of,
    literal,
    number,
    object_key,
    text,
)
from compono.graph.sockets import (
    BooleanType,
    ChoiceType,
    NothingType,
    NumberType,
    ObjectType,
    SocketType,
    TextType,
)
from compono.graph.values import Value

CATEGORY: Final = "Values"
OBJECT_CATEGORY: Final = "Objects"
ANY_OBJECT: Final = ObjectType(fields={})


def _value_output(
    socket_type: SocketType,
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
    value = number(context.properties["value"])
    if _number_type(context).integer and value is not None:
        if not float(value).is_integer():
            raise NodeError(f"{value} isn't a whole number")
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


def _object_sockets(context: SocketsContext) -> Sockets:
    ids = {field.id for field in context.fields}
    names = {field.name for field in context.fields}
    if len(ids) != len(context.fields) or len(names) != len(context.fields):
        raise NodeError("Object field names and socket IDs must be unique")
    if any(not name.strip() for name in names):
        raise NodeError("Object fields need names")

    inputs: list[Input] = []
    shape: dict[str, SocketType] = {}
    for field in context.fields:
        incoming = context.wired.get(field.id)
        socket = (
            field.type
            if incoming is None or isinstance(incoming, NothingType)
            else incoming
        )
        shape[field.name] = socket
        default: Value = (
            False
            if isinstance(socket, BooleanType)
            else ""
            if isinstance(socket, TextType)
            else None
        )
        inputs.append(
            Input(
                field.id,
                field.name,
                socket,
                default,
                allow_stale_value=socket != field.type,
            )
        )
    return Sockets(
        inputs=tuple(inputs),
        outputs=(Output("value", "Object", ObjectType(fields=shape)),),
    )


def _object(context: EvaluateContext) -> Mapping[str, Value]:
    return {"value": {field.name: context.inputs[field.id] for field in context.fields}}


def _object_code(context: CodeContext) -> Mapping[str, Code]:
    expression_of = context.expression_of or js_of
    fields: list[str] = []
    for field in context.fields:
        value = expression_of(context.inputs[field.id])
        if value is None:
            raise NodeError(f"{field.name} can't contain markup in an exported Object")
        fields.append(f"{object_key(field.name)}: {value}")
    return {"value": Js("{" + ", ".join(fields) + "}", nothing=False)}


OBJECT: Final = NodeType(
    type="object",
    name="Object",
    category=OBJECT_CATEGORY,
    sockets=_object_sockets,
    evaluate=_object,
    code=_object_code,
)


def _field_socket(name: str) -> str:
    return "field:" + quote(name, safe="")


def _object_fields(context: SocketsContext, socket: str) -> Mapping[str, SocketType]:
    incoming = context.wired.get(socket)
    return incoming.fields if isinstance(incoming, ObjectType) else {}


def _break_object_sockets(context: SocketsContext) -> Sockets:
    fields = _object_fields(context, "object")
    return Sockets(
        inputs=(Input("object", "Object", ANY_OBJECT),),
        outputs=tuple(
            Output(_field_socket(name), name, socket) for name, socket in fields.items()
        ),
    )


def _break_object(context: EvaluateContext) -> Mapping[str, Value]:
    value = context.inputs["object"]
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise NodeError("Break Object needs an Object")
    return {_field_socket(name): item for name, item in value.items()}


def _break_object_code(context: CodeContext) -> Mapping[str, Code]:
    value = context.inputs["object"]
    if isinstance(value, Js):
        object_expression = expression(value)
        return {
            output.id: Js(f"({object_expression})?.[{literal(output.label)}]")
            for output in context.outputs
        }
    if isinstance(value, dict):
        return {_field_socket(name): item for name, item in value.items()}
    return {}


BREAK_OBJECT: Final = NodeType(
    type="break-object",
    name="Break Object",
    category=OBJECT_CATEGORY,
    sockets=_break_object_sockets,
    evaluate=_break_object,
    code=_break_object_code,
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

NODE_TYPES: Final = (BOOLEAN, NUMBER, TEXT, CHOICE, OBJECT, BREAK_OBJECT, NOTHING)
