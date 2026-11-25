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
    ObjectType,
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
        ("object", "Objects"),
        ("break-object", "Objects"),
        ("set-field", "Objects"),
        ("merge-objects", "Objects"),
        ("nothing", "Values"),
        ("switch", "Logic"),
        ("compare", "Logic"),
    ]


def test_saved_template_nodes_are_reported_as_unsupported() -> None:
    evaluation = run(
        [
            node("old", "template", properties={"template": "Hi {name}!"}),
            node("title", "element", values={"tag": "h3"}),
        ],
        [wire("w1", "old.text", "title.text")],
    )

    assert evaluation.nodes["old"].error == "There's no template node"
    assert evaluation.nodes["title"].skipped


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
    ("options", "default", "tag", "image", "refusal"),
    [
        (
            [],
            None,
            "h2",
            Element(tag="img", attributes=(("src", "/logo.svg"),)),
            "No choice selected",
        ),
        (
            ["a"],
            None,
            "h2",
            Element(tag="img", attributes=(("src", "/logo.svg"),)),
            "No choice selected",
        ),
        (["a"], "a", "a", Element(tag="a"), None),
        (["a", "Large"], "a", "a", Element(tag="a"), None),
        (
            ["a", "Large"],
            "Large",
            "h2",
            Element(tag="img", attributes=(("src", "/logo.svg"),)),
            "Tag can't be Large",
        ),
    ],
)
def test_element_tag_sockets_follow_the_value_of_a_choice_prop(
    options: list[str],
    default: str | None,
    tag: str,
    image: Element,
    refusal: str | None,
) -> None:
    evaluation = run(
        [
            node("input", "component-input"),
            node("heading", "element", values={"tag": "h2"}),
            node("logo", "element", values={"tag": "img", "src": "/logo.svg"}),
        ],
        [wire("w1", "input.p1", "heading.tag"), wire("w2", "input.p1", "logo.tag")],
        [
            prop(
                "p1",
                "tag",
                {"kind": "choice", "options": list(options)},
                default=default,
            )
        ],
    )

    assert evaluation.wires == (
        {} if refusal is None else {"w1": refusal, "w2": refusal}
    )
    assert [each.id for each in evaluation.nodes["heading"].sockets.inputs] == (
        ["tag", "href", "text", "class"] if tag == "a" else ["tag", "text", "class"]
    )
    assert [each.id for each in evaluation.nodes["logo"].sockets.inputs] == (
        ["tag", "href", "text", "class"]
        if tag == "a"
        else ["tag", "src", "alt", "class"]
    )
    assert output(evaluation, "heading", "element") == Element(tag=tag)
    assert output(evaluation, "logo", "element") == image


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
        "object": [],
        "break-object": [],
        "set-field": [],
        "merge-objects": [],
        "nothing": ["value"],
        "switch": [],
        "compare": [],
    }


def test_an_object_builds_its_shape_and_value_from_independent_inputs() -> None:
    evaluation = run(
        [
            node("label", "text", properties={"value": "New"}),
            node(
                "object",
                "object",
                fields=[
                    {"id": "label-id", "name": "label", "type": {"kind": "text"}},
                    {
                        "id": "count-id",
                        "name": "count",
                        "type": {"kind": "number", "integer": True},
                    },
                    {"id": "flag-id", "name": "highlight", "type": {"kind": "boolean"}},
                ],
                values={"label-id": "Old", "count-id": 3},
            ),
            node(
                "outer",
                "object",
                fields=[
                    {
                        "id": "item",
                        "name": "item",
                        "type": {"kind": "object", "fields": {}},
                    }
                ],
            ),
        ],
        [
            wire("w1", "label.value", "object.label-id"),
            wire("w2", "object.value", "outer.item"),
        ],
    )

    sockets = evaluation.nodes["object"].sockets
    assert [(each.id, each.label) for each in sockets.inputs] == [
        ("label-id", "label"),
        ("count-id", "count"),
        ("flag-id", "highlight"),
    ]
    assert sockets.groups == ()
    shape = ObjectType(
        fields={
            "label": TEXT,
            "count": NumberType(integer=True),
            "highlight": BooleanType(),
        }
    )
    assert sockets.outputs[0].type == shape
    assert evaluation.nodes["outer"].sockets.outputs[0].type == ObjectType(
        fields={"item": shape}
    )
    assert output(evaluation, "outer") == {
        "item": {"label": "New", "count": 3, "highlight": False}
    }
    assert evaluation.wires == {}


def test_an_empty_object_has_an_empty_value_and_shape() -> None:
    evaluation = run([node("object", "object")])

    assert output(evaluation, "object") == {}
    assert evaluation.nodes["object"].sockets.outputs[0].type == ObjectType(fields={})


def test_an_object_field_follows_the_connected_type_and_subtype() -> None:
    stored = node(
        "object",
        "object",
        fields=[{"id": "field-id", "name": "field", "type": {"kind": "text"}}],
        values={"field-id": "Local"},
    )
    number = node("number", "number", properties={"value": 3, "subtype": "Integer"})
    link = node("link", "text", properties={"value": "/pricing", "subtype": "Link"})
    for source, start, expected in [
        (number, "number", NumberType(integer=True)),
        (link, "link", LINK),
    ]:
        evaluation = run(
            [stored, source], [wire("wire", f"{start}.value", "object.field-id")]
        )
        sockets = evaluation.nodes["object"].sockets
        assert sockets.inputs[0].type == expected
        assert sockets.outputs[0].type == ObjectType(fields={"field": expected})
        assert evaluation.wires == {}
    assert output(run([stored]), "object") == {"field": "Local"}


def test_break_object_exposes_each_field_with_its_name_type_and_value() -> None:
    nodes = [
        node(
            "object",
            "object",
            fields=[
                {
                    "id": "link",
                    "name": "cta/link",
                    "type": {"kind": "text", "link": True},
                },
                {
                    "id": "count",
                    "name": "count",
                    "type": {"kind": "number", "integer": True},
                },
                {
                    "id": "settings",
                    "name": "settings",
                    "type": {
                        "kind": "object",
                        "fields": {"featured": {"kind": "boolean"}},
                    },
                },
            ],
            values={"link": "/pricing", "count": 3, "settings": {"featured": True}},
        ),
        node("break", "break-object"),
        node("cta", "element", values={"tag": "a"}),
    ]
    assert run(nodes).nodes["break"].sockets.outputs == ()
    evaluation = run(
        nodes,
        [
            wire("object", "object.value", "break.object"),
            wire("href", "break.field:cta%2Flink", "cta.href"),
        ],
    )
    result = evaluation.nodes["break"]
    assert [
        (socket.id, socket.label, socket.type) for socket in result.sockets.outputs
    ] == [
        ("field:cta%2Flink", "cta/link", LINK),
        ("field:count", "count", NumberType(integer=True)),
        ("field:settings", "settings", ObjectType(fields={"featured": BooleanType()})),
    ]
    assert result.outputs == {
        "field:cta%2Flink": "/pricing",
        "field:count": 3,
        "field:settings": {"featured": True},
    }
    assert evaluation.wires == {}
    assert output(evaluation, "cta", "element") == Element(
        tag="a", attributes=(("href", "/pricing"),)
    )


@pytest.mark.parametrize("field", ["removed", "title", ""])
def test_set_field_only_replaces_a_field_present_in_the_input(field: str) -> None:
    original: dict[str, JsonValue] = {"title": "Pricing", "public": True}
    shape = {"title": TEXT, "public": BooleanType()}
    evaluation = run(
        [
            node("source", "component-input"),
            node("rating", "number", properties={"value": 4, "subtype": "Integer"}),
            node("set", "set-field", properties={"field": field}),
            node("break", "break-object"),
        ],
        [
            wire("object", "source.card", "set.object"),
            wire("value", "rating.value", "set.value"),
            wire("updated", "set.value", "break.object"),
        ],
        [
            prop(
                "card",
                "card",
                {
                    "kind": "object",
                    "fields": {
                        "title": {"kind": "text"},
                        "public": {"kind": "boolean"},
                    },
                },
                default=original,
            )
        ],
    )

    values = dict(original)
    if field in shape:
        values[field] = 4
        shape[field] = NumberType(integer=True)
    assert evaluation.wires == {}
    assert output(evaluation, "source", "card") == original
    assert output(evaluation, "set") == values
    sockets = evaluation.nodes["set"].sockets
    assert [item.id for item in sockets.inputs] == ["object", "field", "value"]
    assert sockets.inputs[1].type == ChoiceType(options=("title", "public"))
    assert sockets.outputs[0].label == "Object"
    assert [
        (item.label, item.type) for item in evaluation.nodes["break"].sockets.outputs
    ] == list(shape.items())


@pytest.mark.parametrize("choice", ["subtitle", "obsolete", ""])
def test_set_field_accepts_a_wired_choice_from_the_objects_fields(choice: str) -> None:
    evaluation = run(
        [
            node("input", "component-input"),
            node("selection", "choice", properties={"value": choice}),
            node("set", "set-field", values={"field": "title", "value": "New"}),
        ],
        [
            wire("object", "input.card", "set.object"),
            wire("field", "selection.value", "set.field"),
        ],
        [
            prop(
                "card",
                "card",
                {
                    "kind": "object",
                    "fields": {"title": {"kind": "text"}, "subtitle": {"kind": "text"}},
                },
                default={"title": "Pricing", "subtitle": "Details"},
            ),
        ],
    )

    if choice == "subtitle":
        assert evaluation.wires == {}
        assert output(evaluation, "set") == {"title": "Pricing", "subtitle": "New"}
    else:
        assert "field" in evaluation.wires
        assert output(evaluation, "set") == {"title": "New", "subtitle": "Details"}


@pytest.mark.parametrize("provided", [True, False])
def test_merge_objects_takes_shared_values_and_types_from_override(
    provided: bool,
) -> None:
    evaluation = run(
        [
            node("source", "component-input"),
            node("merge", "merge-objects"),
            node("break", "break-object"),
        ],
        [
            wire("base", "source.base", "merge.base"),
            wire("override", "source.override", "merge.override"),
            wire("merged", "merge.value", "break.object"),
        ],
        [
            prop(
                "base",
                "base",
                {
                    "kind": "object",
                    "fields": {"title": {"kind": "text"}, "rating": {"kind": "text"}},
                },
                default={"title": "Pricing", "rating": "Unrated"},
            ),
            prop(
                "override",
                "override",
                {
                    "kind": "object",
                    "fields": {
                        "rating": {"kind": "number", "integer": True},
                        "link": {"kind": "text", "link": True},
                    },
                },
                default={"rating": 4, "link": "/pricing"} if provided else None,
            ),
        ],
    )

    assert evaluation.wires == {}
    assert output(evaluation, "source", "base") == {
        "title": "Pricing",
        "rating": "Unrated",
    }
    assert output(evaluation, "merge") == {
        "title": "Pricing",
        "rating": 4 if provided else None,
        "link": "/pricing" if provided else None,
    }
    assert [
        (item.label, item.type) for item in evaluation.nodes["break"].sockets.outputs
    ] == [("title", TEXT), ("rating", NumberType(integer=True)), ("link", LINK)]


def test_a_number_can_be_whole() -> None:
    evaluation = run(
        [
            node("whole", "number", properties={"subtype": "Integer", "value": 24.0}),
            node("half", "number", properties={"subtype": "Integer", "value": 2.5}),
            node("price", "element"),
        ],
        [wire("w1", "whole.value", "price.text")],
    )

    assert output(evaluation, "whole") == 24
    assert evaluation.nodes["whole"].sockets.outputs[0].type == NumberType(integer=True)
    assert evaluation.nodes["half"].error == "2.5 isn't a whole number"
    assert evaluation.wires == {"w1": "Integer can't go into Text"}


def test_old_number_presets_load_as_editable_values() -> None:
    evaluation = run(
        [
            node("pi", "number", properties={"constant": "Pi", "value": 1}),
            node("e", "number", properties={"constant": "E"}, exposed=["constant"]),
            node("custom", "number", properties={"constant": "Custom", "value": 4}),
            node("choice", "choice", properties={"value": "Pi"}),
        ],
        [wire("retired", "choice.value", "e.constant")],
    )

    assert output(evaluation, "pi") == math.pi
    assert output(evaluation, "e") == math.e
    assert output(evaluation, "custom") == 4
    assert evaluation.nodes["e"].sockets.inputs == ()
    assert evaluation.wires == {}


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


def test_an_unselected_choice_does_not_set_the_type_of_a_switch() -> None:
    evaluation = run(
        [
            node("choice", "choice"),
            node("text", "text", properties={"value": "Fallback"}),
            node("switch", "switch", values={"condition": False}),
        ],
        [
            wire("w1", "choice.value", "switch.true"),
            wire("w2", "text.value", "switch.false"),
        ],
    )

    assert evaluation.wires == {"w1": "No choice selected"}
    assert output(evaluation, "switch", "result") == "Fallback"


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
