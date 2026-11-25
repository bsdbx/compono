"""Nodes that work with text."""

from collections.abc import Mapping
from typing import Final

from compono.graph.node_types import (
    Code,
    CodeContext,
    EvaluateContext,
    Group,
    Input,
    Js,
    NodeError,
    NodeType,
    Output,
    Sockets,
    expression,
    literal,
    text,
)
from compono.graph.sockets import TextType
from compono.graph.values import Value

CATEGORY: Final = "Text"
TEXT: Final = TextType()


def _join(context: EvaluateContext) -> Mapping[str, Value]:
    separator = text(context.inputs["separator"])
    items = (text(item) for item in context.groups["items"] if item is not None)
    return {"text": separator.join(items)}


def _text_expression(value: Code) -> str:
    if isinstance(value, Js):
        return expression(value)
    if value is None or isinstance(value, str):
        return literal(text(value))
    raise NodeError("Expected Text")


def _join_code(context: CodeContext) -> Mapping[str, Code]:
    items = [item for item in context.groups["items"] if item is not None]
    if not items:
        return {"text": ""}

    separator = context.inputs["separator"]
    glue = _text_expression(separator)
    if isinstance(separator, Js) and separator.may_be_nothing:
        glue = f'({glue} ?? "")'
    values = f"[{', '.join(map(_text_expression, items))}]"
    if any(isinstance(item, Js) and item.may_be_nothing for item in items):
        values += ".filter((item) => item != null)"
    return {"text": Js(f"{values}.join({glue})", nothing=False)}


JOIN: Final = NodeType(
    type="join",
    name="Join",
    category=CATEGORY,
    sockets=lambda _: Sockets(
        inputs=(Input("separator", "Separator", TEXT, ""),),
        groups=(Group("items", "Items", TEXT, item_label="Item"),),
        outputs=(Output("text", "Text", TEXT),),
    ),
    evaluate=_join,
    code=_join_code,
)

NODE_TYPES: Final = (JOIN,)
