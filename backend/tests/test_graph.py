"""Tests of graphs and their evaluation, with node types made for the tests."""

import re
import time
from collections.abc import Callable, Mapping
from datetime import UTC, datetime

import pytest
from pydantic import JsonValue, ValidationError

from compono.graph.evaluate import Evaluation, evaluate
from compono.graph.model import Graph
from compono.graph.node_types import (
    EvaluateContext,
    Group,
    Input,
    NodeError,
    NodeType,
    Output,
    Property,
    Sockets,
    SocketsContext,
)
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
    accepts,
)
from compono.graph.values import Element, Value, from_json, to_json

NUMBER = NumberType()
INTEGER = NumberType(integer=True)
TEXT = TextType()
LINK = TextType(link=True)
TAG = ChoiceType(options=("div", "span"))


def number(value: Value) -> float:
    assert isinstance(value, int | float) and not isinstance(value, bool)
    return value


def text(value: Value) -> str:
    assert isinstance(value, str)
    return value


def fixed(sockets: Sockets) -> Callable[[SocketsContext], Sockets]:
    return lambda _: sockets


def constant(name: str, socket_type: SocketType) -> NodeType:
    """A node that gives its Value property."""
    return NodeType(
        type=name,
        name=name.capitalize(),
        category="Values",
        properties=(Property("value", "Value", socket_type),),
        sockets=fixed(Sockets(outputs=(Output("value", "Value", socket_type),))),
        evaluate=lambda context: {"value": context.properties["value"]},
    )


def placeholders(template: str) -> list[str]:
    """The {names} in a template."""
    names: list[str] = []
    for part in template.split("{")[1:]:
        name, closed, _ = part.partition("}")
        if closed and name.isidentifier():
            names.append(name)
    return names


def template_sockets(context: SocketsContext) -> Sockets:
    # An input for each {name} in the template
    names = placeholders(text(context.properties["template"]))
    return Sockets(
        inputs=tuple(Input(name, name, TEXT, "") for name in names),
        outputs=(Output("text", "Text", TEXT),),
    )


def template_evaluate(context: EvaluateContext) -> Mapping[str, Value]:
    filled = text(context.properties["template"])
    for name in placeholders(filled):
        filled = filled.replace(f"{{{name}}}", text(context.inputs[name]))
    return {"text": filled}


def switch_sockets(context: SocketsContext) -> Sockets:
    # The result takes the type wired into True or False
    result = context.wired.get("true") or context.wired.get("false") or AnyType()
    return Sockets(
        inputs=(
            Input("condition", "Condition", BooleanType(), False),
            Input("true", "True", AnyType()),
            Input("false", "False", AnyType()),
        ),
        outputs=(Output("result", "Result", result),),
    )


def element_evaluate(context: EvaluateContext) -> Mapping[str, Value]:
    children: list[Element | str] = []
    if context.inputs["text"]:
        children.append(text(context.inputs["text"]))
    for child in context.groups["children"]:
        # A child that is Nothing isn't rendered
        if isinstance(child, Element):
            children.append(child)
    return {
        "element": Element(
            tag=text(context.properties["tag"]),
            class_name=text(context.inputs["class"]),
            children=tuple(children),
        )
    }


def fail(_: EvaluateContext) -> Mapping[str, Value]:
    raise NodeError("badge.tone no longer exists")


def crash(_: EvaluateContext) -> Mapping[str, Value]:
    raise RuntimeError


NODE_TYPES = {
    node_type.type: node_type
    for node_type in [
        constant("number", NUMBER),
        constant("integer", INTEGER),
        constant("text", TEXT),
        constant("link", LINK),
        constant("date", DateType()),
        constant("nothing", NothingType()),
        constant("card", ObjectType(fields={"title": TEXT, "price": NUMBER})),
        NodeType(
            type="add",
            name="Add",
            category="Math",
            sockets=fixed(
                Sockets(
                    inputs=(Input("a", "A", NUMBER, 0), Input("b", "B", NUMBER, 0)),
                    outputs=(Output("sum", "Sum", NUMBER),),
                )
            ),
            evaluate=lambda context: {
                "sum": number(context.inputs["a"]) + number(context.inputs["b"])
            },
        ),
        NodeType(
            type="whole",
            name="Whole",
            category="Math",
            sockets=fixed(Sockets(inputs=(Input("n", "N", INTEGER, 0),))),
            evaluate=lambda _: {},
        ),
        NodeType(
            type="join",
            name="Join",
            category="Text",
            sockets=fixed(
                Sockets(
                    groups=(Group("parts", "Parts", TEXT),),
                    outputs=(Output("text", "Text", TEXT),),
                )
            ),
            evaluate=lambda context: {
                "text": "".join(text(part or "") for part in context.groups["parts"])
            },
        ),
        NodeType(
            type="template",
            name="Template",
            category="Text",
            properties=(Property("template", "Template", TEXT, ""),),
            sockets=template_sockets,
            evaluate=template_evaluate,
        ),
        NodeType(
            type="switch",
            name="Switch",
            category="Logic",
            sockets=switch_sockets,
            evaluate=lambda context: {
                "result": context.inputs["true"]
                if context.inputs["condition"]
                else context.inputs["false"]
            },
        ),
        NodeType(
            type="element",
            name="Element",
            category="Elements",
            properties=(Property("tag", "Tag", TAG, "div"),),
            sockets=fixed(
                Sockets(
                    inputs=(
                        Input("text", "Text", TEXT, ""),
                        Input("class", "Class name", TEXT, ""),
                    ),
                    groups=(Group("children", "Children", ElementType()),),
                    outputs=(Output("element", "Element", ElementType()),),
                )
            ),
            evaluate=element_evaluate,
        ),
        NodeType(
            type="output",
            name="Component Output",
            category="Component",
            sockets=fixed(
                Sockets(
                    inputs=(Input("render", "Render", SlotType()),),
                    outputs=(Output("shown", "Shown", ElementType()),),
                )
            ),
            evaluate=lambda context: {"shown": context.inputs["render"]},
        ),
        NodeType(
            type="fail",
            name="Fail",
            category="Test",
            sockets=fixed(Sockets(outputs=(Output("value", "Value", NUMBER),))),
            evaluate=fail,
        ),
        NodeType(
            type="crash",
            name="Crash",
            category="Test",
            sockets=fixed(Sockets(outputs=(Output("value", "Value", NUMBER),))),
            evaluate=crash,
        ),
    ]
}


def node(node_id: str, node_type: str, **fields: JsonValue) -> JsonValue:
    return {"id": node_id, "type": node_type, **fields}


def wire(wire_id: str, start: str, end: str) -> JsonValue:
    """A wire from "node.socket" to "node.socket"."""
    start_node, start_socket = start.split(".", 1)
    end_node, end_socket = end.split(".", 1)
    return {
        "id": wire_id,
        "from": {"node": start_node, "socket": start_socket},
        "to": {"node": end_node, "socket": end_socket},
    }


def run(nodes: list[JsonValue], wires: list[JsonValue] | None = None) -> Evaluation:
    stored: dict[str, JsonValue] = {"format": 1, "nodes": nodes, "wires": wires or []}
    graph = Graph.model_validate(stored)
    return evaluate(graph, NODE_TYPES)


def output(evaluation: Evaluation, node_id: str, socket: str) -> Value:
    return evaluation.nodes[node_id].outputs.get(socket)


def test_a_new_components_graph_is_empty() -> None:
    new: dict[str, JsonValue] = {}
    graph = Graph.model_validate(new)

    assert graph == Graph(format=1, nodes=[], wires=[])
    assert evaluate(graph, NODE_TYPES) == Evaluation(nodes={}, wires={})


def test_the_stored_format_keeps_from_and_its_version() -> None:
    stored: dict[str, JsonValue] = {
        "format": 1,
        "nodes": [],
        "wires": [wire("w1", "a.value", "b.a")],
    }

    graph = Graph.model_validate(stored)

    assert graph.wires[0].from_.node == "a"
    assert graph.model_dump_json() == (
        '{"format":1,"nodes":[],"wires":[{"id":"w1",'
        '"from":{"node":"a","socket":"value"},"to":{"node":"b","socket":"a"}}]}'
    )
    later: dict[str, JsonValue] = {"format": 2}
    with pytest.raises(ValidationError):
        Graph.model_validate(later)


def test_values_flow_along_wires_whatever_order_the_nodes_are_in() -> None:
    evaluation = run(
        [
            node("total", "add"),
            node("sum", "add"),
            node("two", "number", properties={"value": 2}),
            node("three", "number", properties={"value": 3}),
        ],
        [
            wire("w1", "sum.sum", "total.a"),
            wire("w2", "two.value", "sum.a"),
            wire("w3", "three.value", "sum.b"),
            wire("w4", "three.value", "total.b"),
        ],
    )

    assert output(evaluation, "total", "sum") == 8
    assert list(evaluation.nodes) == ["two", "three", "sum", "total"]
    assert evaluation.wires == {}


def test_an_input_without_a_wire_uses_its_typed_value_then_its_default() -> None:
    evaluation = run(
        [
            node("typed", "add", values={"a": 5}),
            node("nothing", "nothing"),
            node("cleared", "add", values={"a": 4}),
        ],
        # A wire that brings Nothing counts as no wire
        [wire("w1", "nothing.value", "cleared.a")],
    )

    assert output(evaluation, "typed", "sum") == 5
    assert output(evaluation, "cleared", "sum") == 4
    assert evaluation.wires == {}


@pytest.mark.parametrize(
    ("into", "out", "allowed"),
    [
        (BooleanType(), BooleanType(), True),
        (BooleanType(), NUMBER, False),
        (NUMBER, NUMBER, True),
        (NUMBER, INTEGER, True),
        (INTEGER, NUMBER, False),
        (INTEGER, NumberType(integer=True, minimum=0), True),
        (TEXT, TEXT, True),
        (TEXT, LINK, True),
        (LINK, TEXT, False),
        (TEXT, NUMBER, False),
        (TAG, ChoiceType(options=("div",)), True),
        (ChoiceType(options=("div",)), TAG, False),
        (TAG, TEXT, False),
        (
            ObjectType(fields={"title": TEXT}),
            ObjectType(fields={"title": LINK, "price": NUMBER}),
            True,
        ),
        (ObjectType(fields={"title": LINK}), ObjectType(fields={"title": TEXT}), False),
        (ObjectType(fields={"title": TEXT}), ObjectType(fields={}), False),
        (DateType(), DateType(), True),
        (DateType(), TEXT, False),
        (ElementType(), ElementType(), True),
        (SlotType(), ElementType(), True),
        (SlotType(), TEXT, False),
        (ElementType(), SlotType(), False),
        (AnyType(), DateType(), True),
        (NUMBER, NothingType(), True),
        (NUMBER, AnyType(), True),
        (NothingType(), NUMBER, False),
    ],
)
def test_wires_follow_the_socket_types(
    into: SocketType, out: SocketType, allowed: bool
) -> None:
    assert accepts(into, out) is allowed


def test_a_wire_of_the_wrong_type_is_refused_and_left_out() -> None:
    evaluation = run(
        [
            node("title", "text", properties={"value": "Pro"}),
            node("price", "number", properties={"value": 2.5}),
            node("sum", "add", values={"a": 1}),
            node("whole", "whole"),
        ],
        [
            wire("w1", "title.value", "sum.a"),
            # A Number may not be whole
            wire("w2", "price.value", "whole.n"),
        ],
    )

    assert evaluation.wires == {
        "w1": "Text can't go into Number",
        "w2": "Number can't go into Integer",
    }
    assert output(evaluation, "sum", "sum") == 1


def test_a_wire_that_makes_a_loop_is_refused() -> None:
    evaluation = run(
        [node("a", "add"), node("b", "add", values={"b": 1})],
        [
            wire("w1", "a.sum", "b.a"),
            wire("w2", "b.sum", "a.a"),
            wire("w3", "a.sum", "a.b"),
        ],
    )

    assert evaluation.wires == {"w2": "It makes a loop", "w3": "It makes a loop"}
    assert output(evaluation, "b", "sum") == 1


def test_an_input_takes_one_wire_and_missing_ends_are_refused() -> None:
    evaluation = run(
        [
            node("one", "number", properties={"value": 1}),
            node("two", "number", properties={"value": 2}),
            node("sum", "add"),
        ],
        [
            wire("w1", "one.value", "sum.a"),
            wire("w2", "two.value", "sum.a"),
            wire("w3", "ghost.value", "sum.b"),
            wire("w4", "two.total", "sum.b"),
            wire("w5", "two.value", "sum.c"),
        ],
    )

    assert evaluation.wires == {
        "w2": "Its input already has a wire",
        "w3": "It runs from or to a node that isn't there",
        "w4": "Number has no output total",
        "w5": "Add has no input c",
    }
    assert output(evaluation, "sum", "sum") == 1


def test_a_node_that_cant_evaluate_says_why_and_the_nodes_after_it_wait() -> None:
    evaluation = run(
        [
            node("broken", "fail"),
            node("after", "add"),
            node("later", "add"),
            node("apart", "add", values={"a": 3}),
            node("crash", "crash"),
            node("ghost", "zebra"),
        ],
        [
            wire("w1", "broken.value", "after.a"),
            wire("w2", "after.sum", "later.a"),
            wire("w3", "ghost.value", "apart.b"),
        ],
    )

    assert evaluation.nodes["broken"].error == "badge.tone no longer exists"
    assert evaluation.nodes["after"].skipped
    assert evaluation.nodes["after"].error is None
    assert evaluation.nodes["later"].skipped
    assert evaluation.nodes["crash"].error == "Something went wrong in this node"
    assert evaluation.nodes["ghost"].error == "There's no zebra node"
    assert evaluation.nodes["apart"].skipped
    # A wire from a broken node isn't refused: it waits for the node to be fixed
    assert evaluation.wires == {}


def test_a_typed_value_or_property_that_doesnt_fit_is_the_nodes_error() -> None:
    evaluation = run(
        [
            node("typed", "add", values={"a": "five"}),
            node("property", "number", properties={"value": True}),
            node("tag", "element", properties={"tag": "table"}),
        ]
    )

    assert evaluation.nodes["typed"].error == "A value typed in isn't a Number"
    assert evaluation.nodes["property"].error == "Value isn't a Number"
    assert evaluation.nodes["tag"].error == "Tag isn't a Choice"


def test_sockets_follow_the_properties() -> None:
    evaluation = run(
        [
            node("name", "text", properties={"value": "Mira"}),
            node("greeting", "template", properties={"template": "Hi {name}!"}),
        ],
        [
            wire("w1", "name.value", "greeting.name"),
            wire("w2", "name.value", "greeting.title"),
        ],
    )

    assert [each.id for each in evaluation.nodes["greeting"].sockets.inputs] == ["name"]
    assert output(evaluation, "greeting", "text") == "Hi Mira!"
    # Its placeholder was removed
    assert evaluation.wires == {"w2": "Template has no input title"}


def test_an_any_input_takes_the_type_wired_into_it() -> None:
    evaluation = run(
        [
            node("title", "text", properties={"value": "Pro"}),
            node("pick", "switch", values={"condition": True}),
            node("sum", "add"),
            node("join", "join", groups={"parts": ["p1"]}),
        ],
        [
            wire("w1", "title.value", "pick.true"),
            wire("w2", "pick.result", "sum.a"),
            wire("w3", "pick.result", "join.parts/p1"),
        ],
    )

    assert evaluation.nodes["pick"].sockets.outputs == (
        Output("result", "Result", TEXT),
    )
    assert evaluation.wires == {"w2": "Text can't go into Number"}
    assert output(evaluation, "join", "text") == "Pro"


def test_a_socket_group_takes_its_rows_in_order() -> None:
    evaluation = run(
        [
            node("a", "text", properties={"value": "one "}),
            node("b", "text", properties={"value": "two "}),
            node("join", "join", groups={"parts": ["second", "first", "typed"]}),
        ],
        [
            wire("w1", "a.value", "join.parts/first"),
            wire("w2", "b.value", "join.parts/second"),
            wire("w3", "b.value", "join.parts/gone"),
        ],
    )
    joined = run(
        [node("join", "join", groups={"parts": ["typed"]}, values={"parts/typed": "c"})]
    )

    assert output(evaluation, "join", "text") == "two one "
    assert evaluation.wires == {"w3": "Join has no input parts/gone"}
    assert output(joined, "join", "text") == "c"


def test_an_exposed_property_takes_a_wire() -> None:
    evaluation = run(
        [
            node("sum", "add", values={"a": 2, "b": 5}),
            node("exposed", "number", exposed=["value"], properties={"value": 1}),
            node("hidden", "number", properties={"value": 1}),
        ],
        [
            wire("w1", "sum.sum", "exposed.value"),
            wire("w2", "sum.sum", "hidden.value"),
        ],
    )

    assert output(evaluation, "exposed", "value") == 7
    assert output(evaluation, "hidden", "value") == 1
    assert evaluation.wires == {"w2": "Number has no input value"}


def test_elements_render_into_a_slot() -> None:
    evaluation = run(
        [
            node(
                "badge", "element", properties={"tag": "span"}, values={"text": "New"}
            ),
            node(
                "card",
                "element",
                values={"class": "card"},
                groups={"children": ["c1", "c2"]},
            ),
            node("nothing", "nothing"),
            node("out", "output"),
            node("title", "text", properties={"value": "Pro"}),
            node("wrong", "output"),
        ],
        [
            wire("w1", "badge.element", "card.children/c1"),
            wire("w2", "nothing.value", "card.children/c2"),
            wire("w3", "card.element", "out.render"),
            wire("w4", "title.value", "wrong.render"),
        ],
    )

    shown = output(evaluation, "out", "shown")
    assert shown == Element(
        tag="div",
        class_name="card",
        children=(Element(tag="span", children=("New",)),),
    )
    assert to_json(shown) == {
        "tag": "div",
        "className": "card",
        "attributes": {},
        "children": [
            {"tag": "span", "className": "", "attributes": {}, "children": ["New"]}
        ],
    }
    assert evaluation.wires == {"w4": "Text can't go into Slot"}


def test_every_kind_of_value_fits_its_type() -> None:
    card = ObjectType(fields={"title": TEXT, "price": NUMBER})

    assert from_json(True, BooleanType()) is True
    assert from_json(2.0, INTEGER) == 2
    assert from_json("https://acme.dev", LINK) == "https://acme.dev"
    assert from_json("span", TAG) == "span"
    assert from_json({"title": "Pro"}, card) == {"title": "Pro", "price": None}
    assert from_json("2026-11-12T10:00:00", DateType()) == datetime(
        2026, 11, 12, 10, tzinfo=UTC
    )
    assert from_json({"a": 1}, AnyType()) == {"a": 1}
    assert from_json(None, NUMBER) is None
    assert (
        to_json(datetime(2026, 11, 12, 10, tzinfo=UTC)) == "2026-11-12T10:00:00+00:00"
    )
    assert to_json({"when": datetime(2026, 1, 1, tzinfo=UTC)}) == {
        "when": "2026-01-01T00:00:00+00:00"
    }


@pytest.mark.parametrize(
    ("json", "socket_type", "problem"),
    [
        (1, BooleanType(), "isn't a Boolean"),
        (True, NUMBER, "isn't a Number"),
        (2.5, INTEGER, "isn't a whole number"),
        (-1, NumberType(minimum=0), "is less than 0"),
        (11, NumberType(maximum=10), "is more than 10"),
        (1, TEXT, "isn't a Text"),
        ("table", TAG, "isn't a Choice"),
        ("tomorrow", DateType(), "isn't a date"),
        ({"title": 1}, ObjectType(fields={"title": TEXT}), "isn't a Text"),
        ([1], AnyType(), "can't be a list"),
        ("div", ElementType(), "isn't an Element"),
        ("div", SlotType(), "isn't a Slot"),
    ],
)
def test_a_value_that_doesnt_fit_says_why(
    json: JsonValue, socket_type: SocketType, problem: str
) -> None:
    with pytest.raises(ValueError, match=f"^{re.escape(problem)}$"):
        from_json(json, socket_type)


def test_two_hundred_nodes_evaluate_quickly() -> None:
    nodes = [node("n0", "number", properties={"value": 1})] + [
        node(f"n{i}", "add", values={"b": 1}) for i in range(1, 200)
    ]
    wires = [
        wire(f"w{i}", f"n{i - 1}.{'value' if i == 1 else 'sum'}", f"n{i}.a")
        for i in range(1, 200)
    ]

    started = time.perf_counter()
    evaluation = run(nodes, wires)
    seconds = time.perf_counter() - started

    assert output(evaluation, "n199", "sum") == 200
    # Far below the round trip to the API
    assert seconds < 0.1
