"""Explicit conversions between socket types."""

import re
from collections.abc import Mapping
from decimal import Decimal
from math import isfinite, isnan
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
    Sockets,
    SocketsContext,
    expression,
    js_of,
    literal,
)
from compono.graph.sockets import (
    AnyType,
    BooleanType,
    ChoiceType,
    NumberType,
    SocketType,
    TextType,
)
from compono.graph.values import JS_WHITESPACE, Value

TARGETS: Final[Mapping[str, SocketType]] = {
    "Number": NumberType(),
    "Text": TextType(),
    "Boolean": BooleanType(),
}
_TARGETS_BY_SOURCE: Final[Mapping[str, tuple[str, ...]]] = {
    "text": ("Number", "Boolean"),
    "number": ("Text", "Boolean"),
    "boolean": ("Number",),
    "choice": ("Text", "Number", "Boolean"),
    "nothing": tuple(TARGETS),
    "any": tuple(TARGETS),
}
_NUMBER: Final = re.compile(
    r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
)


def _target(value: object, options: tuple[str, ...]) -> str:
    return value if isinstance(value, str) and value in options else options[0]


def _sockets(context: SocketsContext) -> Sockets:
    source = context.wired.get("value", AnyType())
    options = _TARGETS_BY_SOURCE.get(source.kind, ("Boolean",))
    targets = {_target(context.typed.get("to"), options)}
    selector = context.wired.get("to")
    selected = context.wired_values.get("to")
    if (
        isinstance(selector, ChoiceType)
        and isinstance(selected, str)
        and selected in options
    ):
        targets.update(option for option in selector.options if option in options)
    elif isinstance(selector, AnyType):
        targets.update(options)

    # A wired target can change at runtime. Only fixed targets promise one output type.
    target = next(iter(targets)) if len(targets) == 1 else None
    result = TARGETS[target] if target else AnyType()
    if target == "Number" and isinstance(source, BooleanType):
        result = NumberType(integer=True)
    return Sockets(
        inputs=(
            Input("value", "Value", source, wire_only=True),
            Input(
                "to",
                "To",
                ChoiceType(options=options),
                options[0],
                allow_stale_value=True,
            ),
        ),
        outputs=(Output("result", target or "Result", result),),
    )


def _finite_number(value: str | float) -> float | None:
    try:
        result = float(value)
    except OverflowError:
        return None
    return result if isfinite(result) else None


def _number(value: Value) -> int | float | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, str):
        value = value.strip(JS_WHITESPACE)
        if _NUMBER.fullmatch(value):
            return _finite_number(value)
    return None


def _number_text(value: float) -> str:
    if value == 0:
        return "0"
    # Use the same thresholds and exponent spelling as JavaScript's number strings.
    decimal = Decimal(repr(value))
    if -6 <= decimal.adjusted() < 21:
        plain = format(decimal, "f")
        return plain.rstrip("0").rstrip(".") if "." in plain else plain
    coefficient, _, exponent = format(decimal.normalize(), "e").partition("e")
    return f"{coefficient}e{int(exponent):+d}"


def _input_options(sockets: tuple[Input, ...]) -> tuple[tuple[str, ...], bool]:
    source, target = (socket.type for socket in sockets)
    assert isinstance(target, ChoiceType)
    return target.options, isinstance(source, ChoiceType)


def _evaluate(context: EvaluateContext) -> Mapping[str, Value]:
    options, choice_source = _input_options(context.input_sockets)
    target = _target(context.inputs["to"], options)
    value = context.inputs["value"]
    if target == "Boolean":
        if isinstance(value, (int, float, str)):
            return {
                "result": bool(value)
                and not (isinstance(value, float) and isnan(value))
            }
        return {"result": value is not None}
    if target == "Text":
        if choice_source and isinstance(value, str):
            return {"result": value}
        number = (
            _finite_number(value)
            if isinstance(value, (int, float)) and not isinstance(value, bool)
            else None
        )
        return {"result": None if number is None else _number_text(number)}

    return {"result": _number(value)}


def _conversion(target: str, value: str, choice_source: bool) -> str:
    if target == "Boolean":
        return f"!!({value})"
    if target == "Text":
        strings = 'typeof value === "string" || ' if choice_source else ""
        return (
            f'((value) => {strings}(typeof value === "number" && value - value === 0) '
            "? `${value}` : null)"
            f"({value})"
        )

    # Subtracting the number from itself rejects NaN and infinity without relying on a global named Number.
    return (
        '((value) => { const input = typeof value === "string" ? value.trim() : ""; '
        f"const number = /^{_NUMBER.pattern}$/.test(input) ? +input : "
        'typeof value === "boolean" ? +value : null; '
        f'return typeof number === "number" && number - number === 0 ? number : null; }})({value})'
    )


def _code(context: CodeContext) -> Mapping[str, Code]:
    expression_of = context.expression_of or js_of
    value = expression_of(context.inputs["value"])
    if value is None:
        raise NodeError("Can't export Convert's input")

    options, choice_source = _input_options(context.input_sockets)
    selector = context.inputs["to"]
    if not isinstance(selector, Js) or len(options) == 1:
        target = _target(selector, options)
        return {
            "result": Js(
                _conversion(target, value, choice_source), nothing=target != "Boolean"
            )
        }

    fallback = _target(selector.fallback, options)
    cases = " ".join(
        f"target === {literal(target)} ? {_conversion(target, 'value', choice_source)} :"
        for target in options
        if target != fallback
    )
    return {
        "result": Js(
            f"((target, value) => {cases} {_conversion(fallback, 'value', choice_source)})"
            f"({expression(selector)}, {value})"
        )
    }


CONVERT: Final = NodeType(
    type="convert",
    name="Convert",
    category="Logic",
    sockets=_sockets,
    evaluate=_evaluate,
    code=_code,
    accepts_unselected_choices=("value",),
)

NODE_TYPES: Final = (CONVERT,)
