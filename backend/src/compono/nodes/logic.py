"""Nodes that decide: Switch, and Compare."""

from collections.abc import Mapping
from datetime import datetime
from typing import Final

from compono.graph.node_types import (
    Choose,
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
    boolean,
    expression,
    js_of,
    known,
    markup,
    text,
)
from compono.graph.sockets import AnyType, BooleanType, ChoiceType, SocketType
from compono.graph.values import Value

CATEGORY: Final = "Logic"

BOOLEAN: Final = BooleanType()


def _following(context: SocketsContext, *inputs: str) -> SocketType:
    """The type of the first of the inputs with a wire, or Any until one has."""
    for each in inputs:
        if each in context.wired:
            return context.wired[each]
    return AnyType()


def _switch_sockets(context: SocketsContext) -> Sockets:
    # True, False and Result are one type: what's wired into True or False
    value = _following(context, "true", "false")
    return Sockets(
        inputs=(
            Input("condition", "Condition", BOOLEAN, True),
            Input("true", "True", value, None),
            Input("false", "False", value, None),
        ),
        outputs=(Output("result", "Result", value),),
    )


def _switch(context: EvaluateContext) -> Mapping[str, Value]:
    chosen = "true" if boolean(context.inputs["condition"]) else "false"
    return {"result": context.inputs[chosen]}


def _may_be_nothing(code: Code) -> bool:
    return code is None or (isinstance(code, Js) and code.may_be_nothing)


def _switch_code(context: CodeContext) -> Mapping[str, Code]:
    condition = context.inputs["condition"]
    yes = context.inputs["true"]
    no = context.inputs["false"]
    if not isinstance(condition, Js):
        return {"result": yes if boolean(known(condition)) else no}

    # Nothing is false, as it is in JavaScript, unless it falls back to true
    test = (
        expression(condition)
        if condition.nothing and condition.fallback not in (None, False)
        else condition.code
    )
    then, otherwise = js_of(yes), js_of(no)
    if then is None or otherwise is None:
        return {"result": Choose(Js(test), yes, no)}

    return {
        "result": Js(
            f"({test} ? {then} : {otherwise})",
            nothing=_may_be_nothing(yes) or _may_be_nothing(no),
        )
    }


SWITCH: Final = NodeType(
    type="switch",
    name="Switch",
    category=CATEGORY,
    sockets=_switch_sockets,
    evaluate=_switch,
    code=_switch_code,
)

# By name, each comparison and its JavaScript
COMPARISONS: Final = {
    "Equal": "===",
    "Not equal": "!==",
    "Less": "<",
    "Less or equal": "<=",
    "Greater": ">",
    "Greater or equal": ">=",
}


def _compare_sockets(context: SocketsContext) -> Sockets:
    # A and B are one type: what's wired into either
    value = _following(context, "a", "b")
    return Sockets(
        inputs=(
            Input("op", "Comparison", ChoiceType(options=tuple(COMPARISONS)), "Equal"),
            Input("a", "A", value, None),
            Input("b", "B", value, None),
        ),
        outputs=(Output("result", "Result", BOOLEAN),),
    )


def _order(a: Value, b: Value) -> int | None:
    """-1, 0 or 1 as a is less than, equal to or more than b, for two numbers, texts or dates."""
    if (
        isinstance(a, int | float)
        and isinstance(b, int | float)
        and not isinstance(a, bool)
        and not isinstance(b, bool)
    ):
        return (a > b) - (a < b)

    if isinstance(a, str) and isinstance(b, str):
        return (a > b) - (a < b)

    if isinstance(a, datetime) and isinstance(b, datetime):
        return (a > b) - (a < b)

    return None


def _compare(context: EvaluateContext) -> Mapping[str, Value]:
    comparison = text(context.inputs["op"])
    a, b = context.inputs["a"], context.inputs["b"]
    if comparison == "Equal":
        return {"result": a == b}

    if comparison == "Not equal":
        return {"result": a != b}

    # Nothing is neither less nor more than anything
    if a is None or b is None:
        return {"result": False}

    order = _order(a, b)
    if order is None:
        raise NodeError(f"{comparison} needs two numbers, two texts or two dates")

    results = {
        "Less": order < 0,
        "Less or equal": order <= 0,
        "Greater": order > 0,
        "Greater or equal": order >= 0,
    }
    return {"result": results[comparison]}


def _operand(code: Code) -> str:
    written = js_of(code)
    if written is None:
        raise NodeError("Compare can't compare elements in code")

    return written


def _compare_code(context: CodeContext) -> Mapping[str, Code]:
    comparison = context.inputs["op"]
    if isinstance(comparison, Js) or markup(comparison):
        raise NodeError("Compare can't take its comparison from a prop in code yet")

    name = text(known(comparison))
    sides = (context.inputs["a"], context.inputs["b"])
    operator = COMPARISONS[name]
    if name in ("Equal", "Not equal"):
        # Nothing is null here, and undefined too in JavaScript
        a, b = (
            f"({side.code} ?? null)"
            if isinstance(side, Js) and side.may_be_nothing
            else _operand(side)
            for side in sides
        )
        return {"result": Js(f"({a} {operator} {b})", nothing=False)}

    # Nothing is neither less nor more than anything, though JavaScript orders null as 0
    if any(side is None for side in sides):
        return {"result": False}

    a, b = (_operand(side) for side in sides)
    checks = [
        f"{_operand(side)} != null"
        for side in sides
        if isinstance(side, Js) and side.may_be_nothing
    ]
    return {
        "result": Js(
            f"({' && '.join([*checks, f'{a} {operator} {b}'])})", nothing=False
        )
    }


COMPARE: Final = NodeType(
    type="compare",
    name="Compare",
    category=CATEGORY,
    sockets=_compare_sockets,
    evaluate=_compare,
    code=_compare_code,
)

NODE_TYPES: Final = (SWITCH, COMPARE)
