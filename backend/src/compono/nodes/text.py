"""Nodes that work with text."""

from collections.abc import Callable, Mapping
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
from compono.graph.sockets import ChoiceType, NumberType, TextType
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


def _characters(value: Code) -> str:
    """Spread a string so JavaScript indexes the same code points as Python."""
    written = _text_expression(value)
    if isinstance(value, Js) and value.may_be_nothing:
        written = f'({written}) ?? ""'
    return f"[...({written})]"


def _length_code(context: CodeContext) -> Mapping[str, Code]:
    value = context.inputs["text"]
    if isinstance(value, Js):
        return {"length": Js(f"{_characters(value)}.length", nothing=False)}
    if value is None or isinstance(value, str):
        return {"length": len(text(value))}
    raise NodeError("Text Length needs a Text input")


TEXT_LENGTH: Final = NodeType(
    type="text-length",
    name="Text Length",
    category=CATEGORY,
    sockets=lambda _: Sockets(
        inputs=(Input("text", "Text", TEXT, ""),),
        outputs=(Output("length", "Length", NumberType(integer=True, minimum=0)),),
    ),
    evaluate=lambda context: {"length": len(text(context.inputs["text"]))},
    code=_length_code,
)


def _index(value: Code) -> int | None:
    if value is None:
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raise NodeError("Start and End need whole numbers")


def _slice(context: EvaluateContext) -> Mapping[str, Value]:
    source = text(context.inputs["text"])
    start = _index(context.inputs["start"])
    end = _index(context.inputs["end"])
    return {"text": source[start:end]}


def _slice_code(context: CodeContext) -> Mapping[str, Code]:
    characters = _characters(context.inputs["text"])
    start = context.inputs["start"]
    end = context.inputs["end"]
    bounds = expression(start) if isinstance(start, Js) else literal(_index(start) or 0)
    if isinstance(end, Js):
        stop = expression(end)
        if end.may_be_nothing:
            stop = f"(({stop}) ?? void 0)"
        bounds += f", {stop}"
    elif end is not None:
        bounds += f", {literal(_index(end))}"

    return {"text": Js(f'{characters}.slice({bounds}).join("")', nothing=False)}


SLICE: Final = NodeType(
    type="slice",
    name="Slice",
    category=CATEGORY,
    sockets=lambda _: Sockets(
        inputs=(
            Input("text", "Text", TEXT, ""),
            Input("start", "Start", NumberType(integer=True), 0),
            Input("end", "End", NumberType(integer=True)),
        ),
        outputs=(Output("text", "Text", TEXT),),
    ),
    evaluate=_slice,
    code=_slice_code,
)

type TextModes = Mapping[str, tuple[Callable[[str], str], str]]

CASE_MODES: Final[TextModes] = {
    "Upper": (str.upper, ".toUpperCase()"),
    "Lower": (str.lower, ".toLowerCase()"),
    "Capitalize first": (
        lambda value: value[:1].upper() + value[1:],
        ".replace(/^./su, (first) => first.toUpperCase())",
    ),
}


def _text_mode(value: Code, modes: TextModes) -> str:
    return value if isinstance(value, str) and value in modes else next(iter(modes))


def _apply_mode(context: EvaluateContext, modes: TextModes) -> Mapping[str, Value]:
    transform, _ = modes[_text_mode(context.inputs["op"], modes)]
    return {"text": transform(text(context.inputs["text"]))}


def _mode_code(context: CodeContext, modes: TextModes) -> Mapping[str, Code]:
    value = context.inputs["text"]
    source = _text_expression(value)
    if isinstance(value, Js) and value.may_be_nothing:
        source = f'({source}) ?? ""'
    mode = context.inputs["op"]
    if isinstance(mode, Js):
        default = next(iter(modes))
        checks = " ".join(
            f"mode === {literal(name)} ? value{suffix} :"
            for name, (_, suffix) in modes.items()
            if name != default
        )
        written = (
            f"((mode, value) => {checks} value{modes[default][1]})"
            f"({expression(mode)}, {source})"
        )
    else:
        written = f"({source}){modes[_text_mode(mode, modes)][1]}"
    return {"text": Js(written, nothing=False)}


CASE: Final = NodeType(
    type="case",
    name="Case",
    category=CATEGORY,
    sockets=lambda _: Sockets(
        inputs=(
            Input("op", "Case", ChoiceType(options=tuple(CASE_MODES)), "Upper"),
            Input("text", "Text", TEXT, ""),
        ),
        outputs=(Output("text", "Text", TEXT),),
    ),
    evaluate=lambda context: _apply_mode(context, CASE_MODES),
    code=lambda context: _mode_code(context, CASE_MODES),
)

NODE_TYPES: Final = (JOIN, TEXT_LENGTH, SLICE, CASE)
