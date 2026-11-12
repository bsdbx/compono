"""Nodes that make text: Template."""

from collections.abc import Mapping
from datetime import datetime
from typing import Final

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
    bare,
    expression,
    known,
    markup,
    text,
)
from compono.graph.sockets import TextType
from compono.graph.values import Element, Value

CATEGORY: Final = "Text"

TEXT: Final = TextType()


def parts(template: str) -> list[tuple[str, bool]]:
    """The template's pieces in order: text, and each name in braces, like {price}, marked True."""
    pieces: list[tuple[str, bool]] = []
    rest = template
    while rest:
        start = rest.find("{")
        end = rest.find("}", start + 1) if start != -1 else -1
        if end == -1:
            pieces.append((rest, False))
            break

        name = rest[start + 1 : end]
        if name.isascii() and name.isidentifier():
            pieces += [(rest[:start], False), (name, True)]
            rest = rest[end + 1 :]
        else:
            # Braces around something else are just text
            pieces.append((rest[: start + 1], False))
            rest = rest[start + 1 :]
    return [(piece, named) for piece, named in pieces if piece]


def names(template: str) -> list[str]:
    """Each name in braces once, in order."""
    found: list[str] = []
    for piece, named in parts(template):
        if named and piece not in found:
            found.append(piece)
    return found


def written(value: Value, name: str) -> str:
    """A value as text in a template, as JavaScript writes it: 24, 24.5, true, and nothing for Nothing."""
    match value:
        case None:
            return ""
        case bool():
            return "true" if value else "false"
        case int():
            return str(value)
        case float():
            return (
                str(int(value))
                if value.is_integer() and abs(value) < 1e21
                else repr(value)
            )
        case str():
            return value
        case datetime():
            return value.isoformat()
        case Element():
            raise NodeError(f"{name} can't be an element in a template")
        case _:
            raise NodeError(f"{name} can't be an object in a template")


def _template_sockets(context: SocketsContext) -> Sockets:
    # An input for each name in braces: Text to type, or what's wired in
    return Sockets(
        inputs=tuple(
            Input(name, name, context.wired.get(name, TEXT), None)
            for name in names(text(context.properties["template"]))
        ),
        outputs=(Output("text", "Text", TEXT),),
    )


def _template(context: EvaluateContext) -> Mapping[str, Value]:
    return {
        "text": "".join(
            written(context.inputs.get(piece), piece) if named else piece
            for piece, named in parts(text(context.properties["template"]))
        )
    }


def _escaped(piece: str) -> str:
    """Text inside a JavaScript template literal."""
    return piece.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def _template_code(context: CodeContext) -> Mapping[str, Code]:
    template = context.properties["template"]
    if isinstance(template, Js) or markup(template):
        raise NodeError("Template can't take its text from a prop in code yet")

    pieces: list[str] = []
    for piece, named in parts(text(known(template))):
        value = context.inputs.get(piece) if named else piece
        if not named:
            pieces.append(_escaped(piece))
        elif isinstance(value, Js):
            # JavaScript writes Nothing as "undefined", so it's empty text first
            shown = f'{value.code} ?? ""' if value.may_be_nothing else expression(value)
            pieces.append(f"${{{bare(shown)}}}")
        elif markup(value):
            raise NodeError(f"{piece} can't be an element in a template")
        else:
            pieces.append(_escaped(written(known(value), piece)))
    return {"text": Js(f"`{''.join(pieces)}`", nothing=False)}


TEMPLATE: Final = NodeType(
    type="template",
    name="Template",
    category=CATEGORY,
    properties=(Property("template", "Template", TEXT, ""),),
    sockets=_template_sockets,
    evaluate=_template,
    code=_template_code,
)

NODE_TYPES: Final = (TEMPLATE,)
