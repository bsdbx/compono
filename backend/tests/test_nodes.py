"""Tests of Compono's node types: the component's, elements and values."""

import math
import pkgutil

import pytest
from pydantic import JsonValue

import compono.nodes
from compono.graph.evaluate import Evaluation, evaluate
from compono.graph.model import Graph
from compono.graph.node_types import EvaluateContext, NodeError
from compono.graph.sockets import (
    BooleanType,
    ChoiceType,
    ElementType,
    NothingType,
    NumberType,
    SlotType,
    TextType,
    name_of,
)
from compono.graph.values import Element, Value
from compono.nodes import NODE_TYPES
from compono.nodes.component import new_graph
from compono.nodes.elements import ELEMENT_NODE

TEXT = TextType()
LINK = TextType(link=True)


def node(node_id: str, node_type: str, **fields: JsonValue) -> JsonValue:
    return {"id": node_id, "type": node_type, **fields}


def wire(wire_id: str, start: str, end: str) -> JsonValue:
    start_node, start_socket = start.split(".", 1)
    end_node, end_socket = end.split(".", 1)
    return {
        "id": wire_id,
        "from": {"node": start_node, "socket": start_socket},
        "to": {"node": end_node, "socket": end_socket},
    }


def prop(
    prop_id: str, name: str, socket_type: JsonValue, **fields: JsonValue
) -> JsonValue:
    return {"id": prop_id, "name": name, "type": socket_type, **fields}


def run(
    nodes: list[JsonValue],
    wires: list[JsonValue] | None = None,
    props: list[JsonValue] | None = None,
) -> Evaluation:
    stored: dict[str, JsonValue] = {
        "format": 1,
        "props": props or [],
        "nodes": nodes,
        "wires": wires or [],
    }
    return evaluate(Graph.model_validate(stored), NODE_TYPES)


def output(evaluation: Evaluation, node_id: str, socket: str = "value") -> Value:
    return evaluation.nodes[node_id].outputs.get(socket)


def test_every_module_of_node_types_is_listed() -> None:
    modules = {
        module.name
        for module in pkgutil.iter_modules(compono.nodes.__path__)
        if not module.name.startswith("_")
    }

    assert modules == {
        module.__name__.rpartition(".")[2] for module in compono.nodes.MODULES
    }


def test_the_node_types_and_their_categories() -> None:
    assert [(each.type, each.category) for each in NODE_TYPES.values()] == [
        ("component-input", "Component"),
        ("component-output", "Component"),
        ("element", "Elements"),
        ("fragment", "Component"),
        ("boolean", "Values"),
        ("number", "Values"),
        ("text", "Values"),
        ("choice", "Values"),
        ("nothing", "Values"),
        ("switch", "Logic"),
        ("compare", "Logic"),
        ("template", "Text"),
    ]


def test_a_new_component_has_its_input_and_output() -> None:
    graph = Graph.model_validate(new_graph())
    evaluation = evaluate(graph, NODE_TYPES)

    assert [each.type for each in graph.nodes] == [
        "component-input",
        "component-output",
    ]
    assert all(result.error is None for result in evaluation.nodes.values())


PROPS: list[JsonValue] = [
    prop("p1", "title", {"kind": "text"}, default="Pro"),
    prop(
        "p2",
        "price",
        {"kind": "number", "integer": True, "minimum": 0, "maximum": 9999, "step": 1},
        default=24,
        description="Monthly price in dollars",
    ),
    prop("p3", "period", {"kind": "choice", "options": ["month", "year"]}),
    prop("p4", "featured", {"kind": "boolean"}, default=True),
    prop("p5", "ctaHref", {"kind": "text", "link": True}, required=True),
]


def test_component_input_gives_each_prop_its_default_or_nothing() -> None:
    evaluation = run([node("in", "component-input")], props=PROPS)

    result = evaluation.nodes["in"]
    assert [(each.id, each.label) for each in result.sockets.outputs] == [
        ("p1", "title"),
        ("p2", "price"),
        ("p3", "period"),
        ("p4", "featured"),
        ("p5", "ctaHref"),
    ]
    assert result.sockets.outputs[1].type == NumberType(
        integer=True, minimum=0, maximum=9999, step=1
    )
    assert result.outputs == {
        "p1": "Pro",
        "p2": 24,
        "p3": None,
        "p4": True,
        "p5": None,
    }


@pytest.mark.parametrize(
    ("props", "error"),
    [
        (
            [prop("p1", "Title", {"kind": "text"})],
            "Title can't be a prop's name. Start with a lowercase letter, then use letters and digits",
        ),
        (
            [prop("p1", "cta-href", {"kind": "text"})],
            "cta-href can't be a prop's name. Start with a lowercase letter, then use letters and digits",
        ),
        (
            [
                prop("p1", "title", {"kind": "text"}),
                prop("p2", "title", {"kind": "text"}),
            ],
            "Two props are named title",
        ),
        ([prop("p1", "body", {"kind": "slot"})], "body can't be Slot"),
        (
            [prop("p1", "price", {"kind": "number", "maximum": 10}, default=24)],
            "price's default is more than 10",
        ),
    ],
)
def test_props_that_react_cant_take_are_component_inputs_error(
    props: list[JsonValue], error: str
) -> None:
    evaluation = run([node("in", "component-input")], props=props)

    assert evaluation.nodes["in"].error == error


def test_a_component_has_one_input_and_one_output() -> None:
    evaluation = run(
        [
            node("in", "component-input"),
            node("out", "component-output"),
            node("in2", "component-input"),
            node("out2", "component-output"),
        ]
    )

    assert evaluation.nodes["in"].error is None
    assert evaluation.nodes["in2"].error == "A component has one Component Input"
    assert evaluation.nodes["out2"].error == "A component has one Component Output"


def test_component_output_renders_an_element_and_nothing_else() -> None:
    evaluation = run(
        [
            node("title", "text", properties={"value": "Pro"}),
            node("card", "element", values={"text": "Pro"}),
            node("out", "component-output"),
            node("wrong", "component-output"),
        ],
        [
            wire("w1", "card.element", "out.render"),
            wire("w2", "title.value", "out.render"),
        ],
    )

    assert evaluation.nodes["out"].sockets.inputs[0].type == SlotType()
    assert evaluation.nodes["out"].inputs == {
        "render": Element(tag="div", children=("Pro",))
    }
    assert evaluation.wires == {"w2": "Its input already has a wire"}


def test_an_element_puts_its_text_children_and_attributes_together() -> None:
    evaluation = run(
        [
            node("badge", "element", values={"tag": "span", "text": "Most popular"}),
            node("nothing", "nothing"),
            node(
                "card",
                "element",
                values={"text": "Pro", "class": "card"},
                groups={"children": ["c1", "c2"]},
                properties={
                    "id": "pro",
                    "key": "pro",
                    "title": "The Pro plan",
                    "role": "region",
                    "tabindex": 0,
                    "lang": "en",
                    "hidden": True,
                },
            ),
        ],
        [
            wire("w1", "badge.element", "card.children/c1"),
            wire("w2", "nothing.value", "card.children/c2"),
        ],
    )

    assert output(evaluation, "card", "element") == Element(
        tag="div",
        class_name="card",
        key="pro",
        attributes=(
            ("id", "pro"),
            ("title", "The Pro plan"),
            ("role", "region"),
            ("lang", "en"),
            ("tabindex", 0),
            ("hidden", True),
        ),
        # A child that is Nothing isn't rendered
        children=("Pro", Element(tag="span", children=("Most popular",))),
    )


def test_an_elements_sockets_follow_its_tag() -> None:
    evaluation = run(
        [
            node("div", "element"),
            node("link", "element", values={"tag": "a"}),
            node("image", "element", values={"tag": "img"}),
            node("pick", "choice", properties={"value": "a"}),
            node("wired", "element"),
        ],
        [wire("w1", "pick.value", "wired.tag")],
    )

    def inputs(node_id: str) -> list[str]:
        return [each.id for each in evaluation.nodes[node_id].sockets.inputs]

    assert inputs("div") == ["tag", "text", "class"]
    assert [
        (group.id, group.before) for group in evaluation.nodes["div"].sockets.groups
    ] == [("children", "class")]
    assert inputs("link") == ["tag", "href", "text", "class"]
    assert evaluation.nodes["link"].sockets.inputs[1].type == LINK
    # An image has no text or children
    assert inputs("image") == ["tag", "src", "alt", "class"]
    assert evaluation.nodes["image"].sockets.groups == ()
    # A Choice wired in can only be its own value
    assert inputs("wired") == ["tag", "href", "text", "class"]
    assert output(evaluation, "wired", "element") == Element(tag="a")
    assert evaluation.wires == {}


@pytest.mark.parametrize(
    "link",
    [
        "https://acme.dev/pricing",
        "/pricing",
        "#plans",
        "?plan=pro",
        "mailto:sales@acme.dev",
        "tel:+380441234567",
    ],
)
def test_a_link_that_goes_somewhere_is_kept(link: str) -> None:
    evaluation = run([node("cta", "element", values={"tag": "a", "href": link})])

    element = output(evaluation, "cta", "element")
    assert isinstance(element, Element)
    assert element.attributes == (("href", link),)


@pytest.mark.parametrize(
    ("tag", "values", "error"),
    [
        ("a", {"href": "javascript:alert(1)"}, "Href can't be a javascript: link"),
        ("a", {"href": "  JavaScript:alert(1)"}, "Href can't be a javascript: link"),
        ("a", {"href": "java\tscript:alert(1)"}, "Href can't be a javascript: link"),
        ("img", {"src": "data:text/html,hi"}, "Src can't be a data: link"),
    ],
)
def test_a_link_that_runs_code_is_refused(
    tag: str, values: dict[str, JsonValue], error: str
) -> None:
    evaluation = run([node("bad", "element", values={"tag": tag, **values})])

    assert evaluation.nodes["bad"].error == error


def test_an_image_has_its_source_and_alternative_text() -> None:
    evaluation = run(
        [
            node(
                "logo",
                "element",
                values={"tag": "img", "src": "/logo.svg", "alt": "Acme"},
            )
        ]
    )

    assert output(evaluation, "logo", "element") == Element(
        tag="img", attributes=(("src", "/logo.svg"), ("alt", "Acme"))
    )


def test_a_tag_that_isnt_html_is_refused() -> None:
    evaluation = run(
        [
            node("typed", "element", values={"tag": "script"}),
            node("pick", "choice", properties={"value": "script"}),
            node("wired", "element"),
        ],
        [wire("w1", "pick.value", "wired.tag")],
    )

    assert evaluation.nodes["typed"].error == "A value typed in isn't a Choice"
    assert evaluation.wires == {"w1": "Tag can't be script"}


def test_a_fragment_groups_children_without_an_element() -> None:
    evaluation = run(
        [
            node("one", "element", values={"text": "One"}),
            node("two", "element", values={"text": "Two"}),
            node(
                "both",
                "fragment",
                groups={"children": ["c2", "c1"]},
                properties={"key": "pair"},
            ),
        ],
        [
            wire("w1", "one.element", "both.children/c1"),
            wire("w2", "two.element", "both.children/c2"),
        ],
    )

    assert output(evaluation, "both", "element") == Element(
        tag="",
        key="pair",
        children=(
            Element(tag="div", children=("Two",)),
            Element(tag="div", children=("One",)),
        ),
    )


def test_value_nodes_give_the_value_set_on_them() -> None:
    evaluation = run(
        [
            node("on", "boolean", properties={"value": True}),
            node("off", "boolean"),
            node("price", "number", properties={"value": 24.5}),
            node("title", "text", properties={"value": "Get started"}),
            node("tag", "choice", properties={"value": "h3"}),
            node("unset", "choice"),
            node("none", "nothing", properties={"value": "undefined"}),
        ]
    )

    assert (output(evaluation, "on"), output(evaluation, "off")) == (True, False)
    assert output(evaluation, "price") == 24.5
    assert output(evaluation, "title") == "Get started"
    assert output(evaluation, "tag") == "h3"
    # No option chosen is Nothing
    assert output(evaluation, "unset") is None
    assert output(evaluation, "none") is None
    types = {
        node_id: evaluation.nodes[node_id].sockets.outputs[0].type
        for node_id in ["on", "price", "title", "tag", "unset", "none"]
    }
    assert types == {
        "on": BooleanType(),
        "price": NumberType(),
        "title": TEXT,
        "tag": ChoiceType(options=("h3",)),
        "unset": ChoiceType(options=()),
        "none": NothingType(),
    }


def test_values_set_on_a_node_show_there() -> None:
    on_node = {
        node_type.type: [each.id for each in node_type.properties if each.on_node]
        for node_type in NODE_TYPES.values()
    }

    assert on_node == {
        "component-input": [],
        "component-output": [],
        "element": [],
        "fragment": [],
        "boolean": ["value"],
        "number": ["value"],
        "text": ["value"],
        "choice": ["value"],
        "nothing": ["value"],
        # A template is typed in the panel
        "switch": [],
        "compare": [],
        "template": [],
    }


def test_a_number_can_be_whole_or_a_constant() -> None:
    evaluation = run(
        [
            node("whole", "number", properties={"subtype": "Integer", "value": 24.0}),
            node("half", "number", properties={"subtype": "Integer", "value": 2.5}),
            node("pi", "number", properties={"constant": "Pi", "value": 1}),
            node(
                "whole_pi",
                "number",
                properties={"subtype": "Integer", "constant": "Pi"},
            ),
            node("price", "element"),
        ],
        [wire("w1", "whole.value", "price.text")],
    )

    assert output(evaluation, "whole") == 24
    assert evaluation.nodes["whole"].sockets.outputs[0].type == NumberType(integer=True)
    assert evaluation.nodes["half"].error == "2.5 isn't a whole number"
    assert output(evaluation, "pi") == math.pi
    assert evaluation.nodes["whole_pi"].error == "Pi isn't a whole number"
    assert evaluation.wires == {"w1": "Integer can't go into Text"}


def test_a_text_can_be_a_link() -> None:
    evaluation = run(
        [
            node("href", "text", properties={"subtype": "Link", "value": "/pricing"}),
            node("plain", "text", properties={"value": "/pricing"}),
            node("cta", "element", values={"tag": "a"}),
            node("other", "element", values={"tag": "a"}),
        ],
        [
            wire("w1", "href.value", "cta.href"),
            wire("w2", "plain.value", "other.href"),
        ],
    )

    assert evaluation.nodes["href"].sockets.outputs[0].type == LINK
    assert evaluation.wires == {"w2": "Text can't go into Link"}
    element = output(evaluation, "cta", "element")
    assert isinstance(element, Element)
    assert element.attributes == (("href", "/pricing"),)


def test_a_choice_fits_any_choice_that_has_its_value() -> None:
    evaluation = run(
        [
            node("tag", "choice", properties={"value": "h3"}),
            node("heading", "element"),
            node("number", "number"),
            node("other", "element"),
        ],
        [
            wire("w1", "tag.value", "heading.tag"),
            wire("w2", "number.value", "other.tag"),
        ],
    )

    assert output(evaluation, "heading", "element") == Element(tag="h3")
    assert evaluation.wires == {"w2": "Number can't go into Choice"}


def test_a_pricing_card_renders_from_its_props() -> None:
    evaluation = run(
        [
            node("in", "component-input"),
            node("title", "element", values={"tag": "h3", "class": "uppercase"}),
            node(
                "cta",
                "element",
                values={"tag": "a", "text": "Get started", "class": "btn"},
            ),
            node(
                "card",
                "element",
                values={"class": "card"},
                groups={"children": ["c1", "c2"]},
            ),
            node("out", "component-output"),
        ],
        [
            wire("w1", "in.p1", "title.text"),
            wire("w2", "in.p5", "cta.href"),
            wire("w3", "title.element", "card.children/c1"),
            wire("w4", "cta.element", "card.children/c2"),
            wire("w5", "card.element", "out.render"),
        ],
        props=[
            *PROPS[:4],
            prop("p5", "ctaHref", {"kind": "text", "link": True}, default="/signup"),
        ],
    )

    assert evaluation.wires == {}
    assert evaluation.nodes["out"].inputs["render"] == Element(
        tag="div",
        class_name="card",
        children=(
            Element(tag="h3", class_name="uppercase", children=("Pro",)),
            Element(
                tag="a",
                class_name="btn",
                attributes=(("href", "/signup"),),
                children=("Get started",),
            ),
        ),
    )
    assert evaluation.nodes["out"].sockets.inputs[0].type == SlotType()
    assert evaluation.nodes["card"].sockets.outputs[0].type == ElementType()


def test_an_element_refuses_a_tag_that_isnt_html_from_any_wire() -> None:
    # A wire whose type isn't known yet, like Any, can bring any word
    context = EvaluateContext(
        inputs={"tag": "script", "text": "", "class": ""},
        groups={"children": ()},
        properties={
            name: None
            for name in ["id", "key", "title", "role", "tabindex", "lang", "hidden"]
        },
        props=[],
    )

    with pytest.raises(NodeError, match="^There's no script tag$"):
        ELEMENT_NODE.evaluate(context)


def inputs_of(evaluation: Evaluation, node_id: str) -> list[tuple[str, str]]:
    return [
        (each.id, name_of(each.type))
        for each in evaluation.nodes[node_id].sockets.inputs
    ]


def test_a_switch_has_no_type_until_true_or_false_is_wired() -> None:
    unwired = run([node("switch", "switch")])
    wired = run(
        [node("switch", "switch"), node("badge", "element")],
        [wire("w1", "badge.element", "switch.false")],
    )

    assert inputs_of(unwired, "switch") == [
        ("condition", "Boolean"),
        ("true", "Any"),
        ("false", "Any"),
    ]
    assert inputs_of(wired, "switch")[1:] == [("true", "Element"), ("false", "Element")]
    assert name_of(wired.nodes["switch"].sockets.outputs[0].type) == "Element"


@pytest.mark.parametrize(
    ("condition", "result"), [({}, "Most popular"), ({"condition": False}, "Plain")]
)
def test_a_switch_gives_true_or_false_by_its_condition(
    condition: dict[str, JsonValue], result: str
) -> None:
    evaluation = run(
        [
            node("label", "text", properties={"value": "x"}),
            node(
                "switch",
                "switch",
                values={**condition, "true": "Most popular", "false": "Plain"},
            ),
        ],
        # Wired from Text, so True and False are Text to type in
        [wire("w1", "label.value", "switch.true")],
    )

    assert output(evaluation, "switch", "result") == (
        "x" if result == "Most popular" else result
    )


def test_a_switch_condition_is_on_until_set_and_nothing_leaves_it_so() -> None:
    evaluation = run(
        [
            node("nothing", "nothing"),
            node("yes", "text", properties={"value": "yes"}),
            node("no", "text", properties={"value": "no"}),
            node("switch", "switch"),
        ],
        [
            wire("w1", "yes.value", "switch.true"),
            wire("w2", "no.value", "switch.false"),
            # A wire that brings Nothing counts as no wire
            wire("w3", "nothing.value", "switch.condition"),
        ],
    )

    assert output(evaluation, "switch", "result") == "yes"


@pytest.mark.parametrize(
    ("comparison", "a", "b", "result"),
    [
        ("Equal", 24, 24, True),
        ("Not equal", 24, 24, False),
        ("Less", 9.5, 10, True),
        ("Less or equal", 10, 10, True),
        ("Greater", "b", "a", True),
        ("Greater or equal", "a", "b", False),
        ("Less", None, 10, False),
        ("Equal", None, None, True),
    ],
)
def test_compare(comparison: str, a: JsonValue, b: JsonValue, result: bool) -> None:
    kind: JsonValue = {"kind": "text"} if isinstance(a, str) else {"kind": "number"}
    evaluation = run(
        [
            node("input", "component-input"),
            node("compare", "compare", values={"op": comparison, "b": b}),
        ],
        [wire("w1", "input.p1", "compare.a")],
        [prop("p1", "value", kind, default=a)],
    )

    assert output(evaluation, "compare", "result") is result


def test_compare_takes_the_type_wired_into_a_and_orders_only_like_kinds() -> None:
    evaluation = run(
        [
            node("input", "component-input"),
            node("compare", "compare", values={"op": "Less", "b": True}),
        ],
        [wire("w1", "input.p1", "compare.a")],
        [prop("p1", "on", {"kind": "boolean"}, default=False)],
    )

    assert inputs_of(evaluation, "compare") == [
        ("op", "Choice"),
        ("a", "Boolean"),
        ("b", "Boolean"),
    ]
    assert (
        evaluation.nodes["compare"].error
        == "Less needs two numbers, two texts or two dates"
    )


def test_a_template_has_an_input_for_each_name_in_braces() -> None:
    evaluation = run(
        [
            node("input", "component-input"),
            node(
                "template",
                "template",
                properties={"template": "${price}/{period} {price} {not a name} {"},
                values={"period": "mo"},
            ),
        ],
        [wire("w1", "input.p1", "template.price")],
        [prop("p1", "price", {"kind": "number"}, default=24.0)],
    )

    # A name once; price is a Number from its wire, period Text to type in
    assert inputs_of(evaluation, "template") == [
        ("price", "Number"),
        ("period", "Text"),
    ]
    assert output(evaluation, "template", "text") == "$24/mo 24 {not a name} {"


@pytest.mark.parametrize(
    ("value", "written"),
    [(True, "true"), (2.5, "2.5"), (3.0, "3"), (None, "")],
)
def test_a_template_writes_values_as_javascript_does(
    value: JsonValue, written: str
) -> None:
    kind: JsonValue = (
        {"kind": "boolean"} if isinstance(value, bool) else {"kind": "number"}
    )
    evaluation = run(
        [
            node("input", "component-input"),
            node("template", "template", properties={"template": "[{v}]"}),
        ],
        [wire("w1", "input.p1", "template.v")],
        [prop("p1", "v", kind, default=value)],
    )

    assert output(evaluation, "template", "text") == f"[{written}]"


def test_an_element_in_a_template_is_an_error() -> None:
    evaluation = run(
        [
            node("badge", "element"),
            node("template", "template", properties={"template": "{v}"}),
        ],
        [wire("w1", "badge.element", "template.v")],
    )

    assert evaluation.nodes["template"].error == "v can't be an element in a template"
