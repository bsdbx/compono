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
    AnyType,
    BooleanType,
    ChoiceType,
    NothingType,
    NumberType,
    ObjectType,
    SocketType,
    TextType,
    accepts,
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


def _object_value(value: Value) -> dict[str, Value]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise NodeError("Expected an Object")
    return value


def _selectable_field_type(original: SocketType, replacement: SocketType) -> SocketType:
    """A field selected at runtime can keep either its original or its replacement type."""
    if isinstance(original, AnyType) or isinstance(replacement, AnyType):
        return AnyType()
    if accepts(original, replacement):
        return original
    if accepts(replacement, original):
        return replacement
    return AnyType()


def _set_field_sockets(context: SocketsContext) -> Sockets:
    fields = dict(_object_fields(context, "object"))
    choice = ChoiceType(options=tuple(fields))
    typed = context.typed.get("field")
    local = typed if isinstance(typed, str) and typed in fields else ""
    selector = context.wired.get("field")
    wired = context.wired_values.get("field")
    targets: set[str] = set()
    if isinstance(selector, ChoiceType) and isinstance(wired, str) and wired in fields:
        targets = set(selector.options).intersection(fields)
    elif isinstance(selector, AnyType):
        targets = set(fields)
    name = wired if targets and isinstance(wired, str) and wired in fields else local
    incoming = context.wired.get("value")
    socket = (
        fields.get(name, AnyType())
        if incoming is None or isinstance(incoming, NothingType)
        else incoming
    )
    empty: dict[str, Value] = {key: None for key in fields}
    if targets:
        if local:
            targets.add(local)
        for target in targets:
            fields[target] = _selectable_field_type(fields[target], socket)
    elif name:
        fields[name] = socket
    return Sockets(
        inputs=(
            Input("object", "Object", ANY_OBJECT, empty),
            Input("field", "Field Name", choice, allow_stale_value=True),
            Input("value", "Value", socket, allow_stale_value=True),
        ),
        outputs=(Output("value", "Object", ObjectType(fields=fields)),),
    )


def _set_field(context: EvaluateContext) -> Mapping[str, Value]:
    original = _object_value(context.inputs["object"])
    name = context.inputs["field"]
    if isinstance(name, str) and name in original:
        return {"value": {**original, name: context.inputs["value"]}}
    return {"value": original}


def _set_field_code(context: CodeContext) -> Mapping[str, Code]:
    field = context.inputs["field"]
    original = context.inputs["object"]
    output_type = context.outputs[0].type
    assert isinstance(output_type, ObjectType)
    if not isinstance(field, Js) and (
        not isinstance(field, str) or field not in output_type.fields
    ):
        return {"value": original}

    expression_of = context.expression_of or js_of
    source = expression_of(original)
    value = expression_of(context.inputs["value"])
    if source is None or value is None:
        raise NodeError("Can't export the Object field")
    if isinstance(field, Js):
        allowed = ", ".join(map(literal, output_type.fields))
        update = (
            f"((object, field, value) => [{allowed}].includes(field) "
            f"? {{...object, [field]: value}} : object)"
            f"({source}, {expression(field)}, {value})"
        )
    else:
        update = f"{{...({source}), {object_key(field)}: {value}}}"
    return {"value": Js(update, nothing=False)}


SET_FIELD: Final = NodeType(
    type="set-field",
    name="Set Field",
    category=OBJECT_CATEGORY,
    sockets=_set_field_sockets,
    evaluate=_set_field,
    code=_set_field_code,
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

NODE_TYPES: Final = (
    BOOLEAN,
    NUMBER,
    TEXT,
    CHOICE,
    OBJECT,
    BREAK_OBJECT,
    SET_FIELD,
    NOTHING,
)
