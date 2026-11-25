"""Tests of turning a component's graph into a JSX file."""

from collections.abc import Mapping

import pytest
from pydantic import JsonValue

from compono.code import CodeError, component_name, generate
from compono.graph.model import Graph, ObjectField
from compono.graph.node_types import (
    CodeContext,
    EvaluateContext,
    Input,
    Js,
    NodeType,
    Output,
    Sockets,
    text,
)
from compono.graph.sockets import BooleanType, TextType
from compono.graph.values import Value
from compono.nodes import NODE_TYPES
from compono.nodes.component import new_graph

TEXT: JsonValue = {"kind": "text"}


def node(node_id: str, node_type: str, **fields: JsonValue) -> JsonValue:
    return {"id": node_id, "type": node_type, "position": {"x": 0, "y": 0}, **fields}


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


def code(
    nodes: list[JsonValue],
    wires: list[JsonValue] | None = None,
    props: list[JsonValue] | None = None,
    name: str = "PricingCard",
    node_types: Mapping[str, NodeType] = NODE_TYPES,
) -> str:
    stored: dict[str, JsonValue] = {
        "props": props or [],
        "nodes": nodes,
        "wires": wires or [],
    }
    graph = Graph.model_validate(stored)
    return generate(graph, node_types, name).code


def test_a_new_component_renders_nothing() -> None:
    generated = generate(Graph.model_validate(new_graph()), NODE_TYPES, "NavBar")

    assert generated.filename == "NavBar.jsx"
    assert generated.code == "export default function NavBar() {\n  return null;\n}\n"


def test_object_code_uses_literals_for_keys_and_expressions_for_inputs() -> None:
    writer = NODE_TYPES["object"].code
    assert writer is not None
    assert writer(
        CodeContext(
            inputs={"label-id": Js("title", fallback="New"), "flag-id": False},
            groups={},
            properties={},
            fields=(
                ObjectField(id="label-id", name="item label", type=TextType()),
                ObjectField(id="flag-id", name="__proto__", type=BooleanType()),
            ),
        )
    ) == {
        "value": Js(
            '{"item label": (title ?? "New"), ["__proto__"]: false}', nothing=False
        )
    }


def test_an_inferred_element_field_exports_as_jsx_inside_the_object() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("label", "element", values={"tag": "strong"}),
            node(
                "object",
                "object",
                fields=[{"id": "field", "name": "badge", "type": {"kind": "any"}}],
            ),
            node("break", "break-object"),
            node("output", "component-output"),
        ],
        [
            wire("w1", "input.title", "label.text"),
            wire("w2", "label.element", "object.field"),
            wire("w3", "object.value", "break.object"),
            wire("w4", "break.field:badge", "output.render"),
        ],
        [prop("title", "title", TEXT)],
    )

    assert '"badge": (<strong>{title}</strong>)' in written


def test_break_object_exports_an_access_to_the_wired_field() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("break", "break-object"),
            node("heading", "element", values={"tag": "h2", "text": "Fallback"}),
            node("output", "component-output"),
        ],
        [
            wire("w1", "input.content", "break.object"),
            wire("w2", "break.field:page%2Ftitle", "heading.text"),
            wire("w3", "heading.element", "output.render"),
        ],
        [
            prop(
                "content", "content", {"kind": "object", "fields": {"page/title": TEXT}}
            )
        ],
    )

    assert '<h2>{(content)?.["page/title"] ?? "Fallback"}</h2>' in written


def test_set_field_and_merge_objects_export_in_override_order() -> None:
    card: JsonValue = {"kind": "object", "fields": {"item/title": TEXT}}
    written = code(
        [
            node("input", "component-input"),
            node("set", "set-field", values={"field": "item/title"}),
            node("merge", "merge-objects"),
            node("break", "break-object"),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("base", "input.base", "merge.base"),
            wire("source", "input.overrides", "set.object"),
            wire("label", "input.label", "set.value"),
            wire("override", "set.value", "merge.override"),
            wire("merged", "merge.value", "break.object"),
            wire("title", "break.field:item%2Ftitle", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("base", "base", card),
            prop("overrides", "overrides", card),
            prop("label", "label", TEXT),
        ],
    )

    assert (
        '...((base ?? {"item/title": null})), '
        '...({...((overrides ?? {"item/title": null})), "item/title": label})'
    ) in written
    assert '?.["item/title"]' in written


def test_set_field_exports_a_wired_field_selector() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("set", "set-field", values={"value": "Updated"}),
            node("break", "break-object"),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("object", "input.card", "set.object"),
            wire("field", "input.key", "set.field"),
            wire("updated", "set.value", "break.object"),
            wire("title", "break.field:title", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop(
                "card",
                "card",
                {"kind": "object", "fields": {"title": TEXT, "subtitle": TEXT}},
            ),
            prop(
                "key",
                "key",
                {"kind": "choice", "options": ["title", "subtitle"]},
                default="title",
            ),
        ],
    )

    assert (
        '["title", "subtitle"].includes(field) ? {...object, [field]: value} : object'
        in written
    )
    assert ', key, "Updated")' in written


def test_what_doesnt_take_a_prop_is_written_as_it_renders() -> None:
    written = code(
        [
            node("output", "component-output"),
            node(
                "list",
                "element",
                values={"tag": "ul", "class": "list"},
                groups={"children": ["a", "b", "c", "d"]},
            ),
            node("plain", "element", values={"tag": "li", "text": "Plain"}),
            node("spaced", "element", values={"tag": "li", "text": "  spaced  "}),
            node("marks", "element", values={"tag": "li", "text": '{a} & "b" <c>'}),
            node("line", "element", values={"tag": "hr"}),
        ],
        [
            wire("w1", "plain.element", "list.children/a"),
            wire("w2", "spaced.element", "list.children/b"),
            wire("w3", "marks.element", "list.children/c"),
            wire("w4", "line.element", "list.children/d"),
            wire("w5", "list.element", "output.render"),
        ],
        [],
        name="feature list",
    )

    # Text JSX would trim or read is a string
    assert written == (
        "export default function FeatureList() {\n"
        "  return (\n"
        '    <ul className="list">\n'
        "      <li>Plain</li>\n"
        '      <li>{"  spaced  "}</li>\n'
        '      <li>{"{a} & \\"b\\" <c>"}</li>\n'
        "      <hr />\n"
        "    </ul>\n"
        "  );\n"
        "}\n"
    )


def card() -> tuple[list[JsonValue], list[JsonValue], list[JsonValue]]:
    nodes = [
        node("input", "component-input"),
        node(
            "badge",
            "element",
            values={"tag": "span", "text": "Most popular"},
            exposed=["hidden"],
        ),
        node("title", "element", values={"tag": "h3", "text": "Plan"}),
        node("cta", "element", values={"tag": "a", "text": "Get started"}),
        node(
            "card",
            "element",
            values={"class": "card"},
            groups={"children": ["a", "b", "c"]},
        ),
        node("output", "component-output"),
    ]
    wires = [
        wire("w1", "input.p1", "title.text"),
        wire("w2", "input.p2", "cta.href"),
        wire("w3", "input.p3", "badge.hidden"),
        wire("w4", "badge.element", "card.children/a"),
        wire("w5", "title.element", "card.children/b"),
        wire("w6", "cta.element", "card.children/c"),
        wire("w7", "card.element", "output.render"),
    ]
    props = [
        prop("p1", "title", TEXT, default="Pro"),
        prop("p2", "ctaHref", {"kind": "text", "link": True}, default="https://a.dev"),
        prop("p3", "hideBadge", {"kind": "boolean"}),
    ]
    return nodes, wires, props


def test_what_takes_a_prop_is_written_with_it() -> None:
    nodes, wires, props = card()

    assert code(nodes, wires, props) == (
        "export default function PricingCard({\n"
        '  title = "Pro",\n'
        '  ctaHref = "https://a.dev",\n'
        "  hideBadge,\n"
        "}) {\n"
        "  return (\n"
        '    <div className="card">\n'
        "      <span hidden={hideBadge}>Most popular</span>\n"
        # A prop that's Nothing counts as no wire, so the typed text shows
        '      <h3>{title ?? "Plan"}</h3>\n'
        "      <a href={ctaHref?.trim() || undefined}>Get started</a>\n"
        "    </div>\n"
        "  );\n"
        "}\n"
    )


def test_a_refused_wire_outside_the_render_path_does_not_block_export() -> None:
    nodes, wires, props = card()
    expected = code(nodes, wires, props)
    # A Boolean can't go into Text
    nodes.append(node("loose", "element"))
    wires.append(wire("w8", "input.p3", "loose.text"))

    assert code(nodes, wires, props) == expected


@pytest.mark.parametrize(
    ("default", "reason"),
    [(None, "No choice selected"), ("Large", "Tag can't be Large")],
)
def test_a_refused_choice_wire_blocks_export(default: str | None, reason: str) -> None:
    with pytest.raises(CodeError) as raised:
        code(
            [
                node("input", "component-input"),
                node("heading", "element", values={"tag": "h2", "text": "Hi"}),
                node("output", "component-output"),
            ],
            [
                wire("w1", "input.p1", "heading.tag"),
                wire("w2", "heading.element", "output.render"),
            ],
            [
                prop(
                    "p1",
                    "level",
                    {"kind": "choice", "options": ["a", "Large"]},
                    default=default,
                )
            ],
        )

    assert raised.value.errors == [f"Wire: {reason}"]


def test_a_wire_that_brings_nothing_counts_as_no_wire() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("nothing", "nothing"),
            node("title", "element", values={"tag": "h3", "text": "Typed"}),
            node("output", "component-output"),
        ],
        [
            wire("w1", "input.p1", "title.class"),
            wire("w2", "nothing.value", "title.text"),
            wire("w3", "title.element", "output.render"),
        ],
        [prop("p1", "tone", TEXT)],
    )

    assert "<h3 className={tone || undefined}>Typed</h3>" in written


def test_a_component_that_renders_a_node_in_error_isnt_code_yet() -> None:
    nodes, wires, props = card()
    nodes[2] = node("title", "element", values={"tag": "script"})

    with pytest.raises(CodeError) as raised:
        code(nodes, wires, props)

    assert raised.value.errors == ["Element: A value typed in isn't a Choice"]


def test_a_node_in_error_that_isnt_rendered_doesnt_matter() -> None:
    nodes, wires, props = card()
    nodes.append(node("loose", "element", values={"tag": "script"}))

    assert "<h3>" in code(nodes, wires, props)


@pytest.mark.parametrize("name", ["class", "2fast", "with space"])
def test_a_prop_needs_a_name_javascript_can_take(name: str) -> None:
    with pytest.raises(CodeError) as raised:
        code([node("input", "component-input")], [], [prop("p1", name, TEXT)])

    assert raised.value.errors == [f"{name} can't name a prop"]


@pytest.mark.parametrize(
    ("options", "expression"),
    [
        (["h2", "h3"], "level"),
        (["h2", "Large"], '(["h2"].includes(level) ? level : undefined)'),
    ],
)
def test_a_tag_from_a_prop_is_a_variable_named_apart_from_the_component(
    options: list[str], expression: str
) -> None:
    written = code(
        [
            node("input", "component-input"),
            node("heading", "element", values={"tag": "h2", "text": "Hi"}),
            node("output", "component-output"),
        ],
        [
            wire("w1", "input.p1", "heading.tag"),
            wire("w2", "heading.element", "output.render"),
        ],
        [
            prop(
                "p1",
                "level",
                {"kind": "choice", "options": list(options)},
                default="h2",
            )
        ],
        name="Tag",
    )

    assert written == (
        'export default function Tag({ level = "h2" }) {\n'
        f'  const Tag2 = {expression} ?? "h2";\n'
        "  return (\n"
        "    <Tag2>\n"
        '      {["br", "hr", "img"].includes(Tag2) ? null : "Hi"}\n'
        "    </Tag2>\n"
        "  );\n"
        "}\n"
    )


def test_a_fragment_with_a_key_imports_fragment() -> None:
    written = code(
        [
            node(
                "list", "fragment", properties={"key": "k"}, groups={"children": ["a"]}
            ),
            node("item", "element", values={"tag": "li", "text": "One"}),
            node("output", "component-output"),
        ],
        [
            wire("w1", "item.element", "list.children/a"),
            wire("w2", "list.element", "output.render"),
        ],
    )

    assert written.startswith('import { Fragment } from "react";\n\n')
    assert '<Fragment key="k">' in written


def shout(context: EvaluateContext) -> Mapping[str, Value]:
    return {"value": text(context.inputs["text"]).upper()}


SHOUT = NodeType(
    type="shout",
    name="Shout",
    category="Text",
    sockets=lambda _: Sockets(
        inputs=(Input("text", "Text", TextType(), ""),),
        outputs=(Output("value", "Value", TextType()),),
    ),
    evaluate=shout,
)


def test_a_node_without_code_is_written_as_its_value_unless_it_takes_a_prop() -> None:
    types = {**NODE_TYPES, "shout": SHOUT}
    nodes = [
        node("input", "component-input"),
        node("shout", "shout", values={"text": "pro"}),
        node("title", "element", values={"tag": "h3"}),
        node("output", "component-output"),
    ]
    wires = [
        wire("w1", "shout.value", "title.text"),
        wire("w2", "title.element", "output.render"),
    ]

    assert "<h3>PRO</h3>" in code(nodes, wires, node_types=types)
    with pytest.raises(CodeError) as raised:
        code(
            nodes,
            [*wires, wire("w3", "input.p1", "shout.text")],
            [prop("p1", "title", TEXT)],
            node_types=types,
        )
    assert raised.value.errors == ["Shout can't take a prop in code yet"]


@pytest.mark.parametrize(
    ("name", "component"),
    [
        ("PricingCard", "PricingCard"),
        ("PricingCard.001", "PricingCard001"),
        ("pricing card", "PricingCard"),
        ("nav-bar 2", "NavBar2"),
        ("2 columns", "Component2Columns"),
        ("", "Component"),
    ],
)
def test_the_component_is_named_for_react(name: str, component: str) -> None:
    assert component_name(name) == component


def pricing_card() -> tuple[list[JsonValue], list[JsonValue], list[JsonValue]]:
    nodes = [
        node("input", "component-input"),
        node("badge", "element", values={"tag": "span", "class": "badge"}),
        node("switch", "switch"),
        node("title", "element", values={"tag": "h3"}),
        node("price", "element", values={"tag": "p"}),
        node("cta", "element", values={"tag": "a", "text": "Get started"}),
        node(
            "card",
            "element",
            values={"class": "card"},
            groups={"children": ["a", "b", "c", "d"]},
        ),
        node("output", "component-output"),
    ]
    wires = [
        wire("w1", "input.p1", "badge.text"),
        wire("w2", "input.p2", "switch.condition"),
        wire("w3", "badge.element", "switch.true"),
        wire("w4", "input.p3", "title.text"),
        wire("w5", "input.p5", "price.text"),
        wire("w6", "input.p4", "cta.href"),
        wire("w7", "switch.result", "card.children/a"),
        wire("w8", "title.element", "card.children/b"),
        wire("w9", "price.element", "card.children/c"),
        wire("w10", "cta.element", "card.children/d"),
        wire("w11", "card.element", "output.render"),
    ]
    props = [
        prop("p1", "badge", TEXT, default="Most popular"),
        prop("p2", "featured", {"kind": "boolean"}, default=True),
        prop("p3", "title", TEXT, default="Pro"),
        prop("p4", "ctaHref", {"kind": "text", "link": True}),
        prop("p5", "price", TEXT, default="$24/mo"),
    ]
    return nodes, wires, props


def test_pricing_card_as_code() -> None:
    nodes, wires, props = pricing_card()

    assert code(nodes, wires, props) == (
        "export default function PricingCard({\n"
        '  badge = "Most popular",\n'
        "  featured = true,\n"
        '  title = "Pro",\n'
        "  ctaHref,\n"
        '  price = "$24/mo",\n'
        "}) {\n"
        "  return (\n"
        '    <div className="card">\n'
        # The Switch's Condition is on when featured is Nothing
        "      {(featured ?? true) ? (\n"
        '        <span className="badge">{badge}</span>\n'
        "      ) : null}\n"
        "      <h3>{title}</h3>\n"
        "      <p>{price}</p>\n"
        "      <a href={ctaHref?.trim() || undefined}>Get started</a>\n"
        "    </div>\n"
        "  );\n"
        "}\n"
    )


@pytest.mark.parametrize(
    ("op", "kind", "operand", "condition"),
    [
        ("Less", {"kind": "number"}, 10, "value != null && value < 10"),
        ("Equal", TEXT, "b", '(value ?? null) === "b"'),
    ],
)
def test_a_switch_between_texts_is_an_expression(
    op: str, kind: JsonValue, operand: JsonValue, condition: str
) -> None:
    written = code(
        [
            node("input", "component-input"),
            node("compare", "compare", values={"op": op, "b": operand}),
            node("label", "switch", values={"true": "Matched", "false": "Other"}),
            node("p", "element", values={"tag": "p"}),
            node("output", "component-output"),
        ],
        [
            wire("w1", "input.p1", "compare.a"),
            wire("w2", "compare.result", "label.condition"),
            wire("w3", "label.result", "p.text"),
            wire("w4", "p.element", "output.render"),
        ],
        [prop("p1", "value", kind)],
    )

    assert f'<p>{{({condition}) ? "Matched" : "Other"}}</p>' in written


def test_a_comparison_cant_take_its_operation_from_a_prop() -> None:
    with pytest.raises(CodeError) as raised:
        code(
            [
                node("input", "component-input"),
                node("tested", "compare"),
                node("p", "element", values={"tag": "p"}, exposed=["hidden"]),
                node("output", "component-output"),
            ],
            [
                wire("w1", "input.p1", "tested.op"),
                wire("w2", "tested.result", "p.hidden"),
                wire("w3", "p.element", "output.render"),
            ],
            [
                prop(
                    "p1",
                    "chosen",
                    {"kind": "choice", "options": ["Equal"]},
                    default="Equal",
                )
            ],
        )

    assert raised.value.errors == [
        "Compare: Compare can't take its comparison from a prop in code yet"
    ]


def test_boolean_math_exports_the_wired_operation_and_b_even_when_preview_uses_not() -> (
    None
):
    written = code(
        [
            node("input", "component-input"),
            node("math", "boolean-math", values={"a": True}),
            node("element", "element", exposed=["hidden"]),
            node("output", "component-output"),
        ],
        [
            wire("op", "input.operation", "math.op"),
            wire("b", "input.flag", "math.b"),
            wire("result", "math.result", "element.hidden"),
            wire("render", "element.element", "output.render"),
        ],
        [
            prop(
                "operation",
                "operation",
                {"kind": "choice", "options": ["And", "Or", "Not"]},
                default="Not",
            ),
            prop("flag", "flag", {"kind": "boolean"}),
        ],
    )

    assert 'op === "Not" ? !a : op === "Or" ? a || b() : a && b()' in written
    assert '((operation ?? "And"), true, () => ((flag ?? false)))' in written


def test_export_reports_a_removed_template_used_in_the_render() -> None:
    with pytest.raises(CodeError) as raised:
        code(
            [
                node("old", "template", properties={"template": "Hi {name}!"}),
                node("p", "element", values={"tag": "p"}),
                node("output", "component-output"),
            ],
            [
                wire("w1", "old.text", "p.text"),
                wire("w2", "p.element", "output.render"),
            ],
        )

    assert raised.value.errors == ["A node: There's no template node"]


def test_default_exports_nullish_coalescing_for_an_optional_prop() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("default", "default", values={"fallback": "Untitled"}),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "default.value"),
            wire("label", "default.result", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [prop("title", "title", TEXT)],
    )

    assert '<h2>{title ?? "Untitled"}</h2>' in written


def test_default_exports_a_fallback_element_for_a_switch_with_an_empty_branch() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("title", "element", values={"tag": "h2", "text": "Title"}),
            node("other", "element", values={"tag": "p", "text": "Fallback"}),
            node("switch", "switch"),
            node("default", "default"),
            node("output", "component-output"),
        ],
        [
            wire("condition", "input.showTitle", "switch.condition"),
            wire("title", "title.element", "switch.true"),
            wire("value", "switch.result", "default.value"),
            wire("fallback", "other.element", "default.fallback"),
            wire("render", "default.result", "output.render"),
        ],
        [prop("showTitle", "showTitle", {"kind": "boolean"})],
    )

    assert "<h2>Title</h2>" in written
    assert "?? (<p>Fallback</p>)" in written


def test_check_exports_only_predicates_for_the_value_type() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("check", "check"),
            node("heading", "element", values={"tag": "h2"}, exposed=["hidden"]),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "check.value"),
            wire("check", "input.predicate", "check.op"),
            wire("hidden", "check.result", "heading.hidden"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("title", "title", TEXT),
            prop(
                "predicate",
                "predicate",
                {"kind": "choice", "options": ["Is nothing", "Is empty", "Is false"]},
                default="Is empty",
            ),
        ],
    )

    assert 'operation === "Is empty"' in written
    assert 'operation === "Is false"' not in written
    assert "value == null)" in written


def test_number_check_exports_both_numeric_predicates_for_a_wired_operation() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("check", "number-check"),
            node("heading", "element", values={"tag": "h2"}, exposed=["hidden"]),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.count", "check.value"),
            wire("check", "input.predicate", "check.op"),
            wire("hidden", "check.result", "heading.hidden"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("count", "count", {"kind": "number"}),
            prop(
                "predicate",
                "predicate",
                {"kind": "choice", "options": ["Is integer", "Is finite"]},
                default="Is finite",
            ),
        ],
    )

    assert (
        'operation === "Is finite" ? (Number.isFinite(value)) : Number.isInteger(value)'
        in written
    )


def test_join_exports_the_saved_order_and_local_row_fallbacks() -> None:
    written = code(
        [
            node("input", "component-input"),
            node(
                "join",
                "join",
                groups={"items": ["first", "absent", "middle", "empty", "last"]},
                values={
                    "separator": "/",
                    "items/first": "Home",
                    "items/middle": "Pricing",
                    "items/empty": "",
                    "items/last": "Pro",
                },
            ),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("separator", "input.glue", "join.separator"),
            wire("absent", "input.optional", "join.items/absent"),
            wire("middle", "input.label", "join.items/middle"),
            wire("text", "join.text", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [prop(name, name, TEXT) for name in ("glue", "optional", "label")],
    )

    assert (
        '["Home", optional, (label ?? "Pricing"), "", "Pro"]'
        '.filter((item) => item != null).join((glue ?? "/"))'
    ) in written


def test_convert_exports_strict_numeric_parsing_and_text_conversion() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("parse", "convert", values={"to": "Number"}),
            node("display", "convert"),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("raw", "input.amount", "parse.value"),
            wire("number", "parse.result", "display.value"),
            wire("display", "display.result", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [prop("amount", "amount", TEXT)],
    )

    assert 'typeof value === "string" ? value.trim()' in written
    assert ".test(input) ? +input" in written
    assert "number - number === 0 ? number : null" in written
    assert "`${value}` : null" in written


def test_text_length_exports_code_point_counting_with_the_inline_fallback() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("count", "text-length", values={"text": "👋"}),
            node("display", "convert"),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "count.text"),
            wire("length", "count.length", "display.value"),
            wire("text", "display.result", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [prop("title", "title", TEXT)],
    )

    assert '[...((title ?? "👋"))].length' in written


def test_slice_exports_an_optional_end_without_treating_it_as_zero() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("slice", "slice", values={"start": -4}),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "slice.text"),
            wire("end", "input.end", "slice.end"),
            wire("text", "slice.text", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("title", "title", TEXT),
            prop("end", "end", {"kind": "number", "integer": True}),
        ],
    )

    assert '[...((title ?? ""))].slice(-4, ((end) ?? void 0)).join("")' in written


def test_case_exports_all_three_modes_when_wired() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("case", "case", values={"text": "pro plan"}),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "case.text"),
            wire("mode", "input.mode", "case.op"),
            wire("text", "case.text", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("title", "title", TEXT),
            prop(
                "mode",
                "mode",
                {"kind": "choice", "options": ["Upper", "Lower", "Capitalize first"]},
                default="Capitalize first",
            ),
        ],
    )

    assert 'mode === "Lower" ? value.toLowerCase()' in written
    assert 'mode === "Capitalize first" ? value.replace(/^./su' in written
    assert ": value.toUpperCase()" in written
    assert '(title ?? "pro plan")' in written


def test_trim_exports_all_three_modes_when_wired() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("trim", "trim", values={"text": "  Pro plan  "}),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "trim.text"),
            wire("side", "input.side", "trim.op"),
            wire("text", "trim.text", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("title", "title", TEXT),
            prop(
                "side",
                "side",
                {"kind": "choice", "options": ["Both", "Start", "End"]},
                default="Both",
            ),
        ],
    )

    assert 'mode === "Start" ? value.trimStart()' in written
    assert 'mode === "End" ? value.trimEnd()' in written
    assert ": value.trim()" in written
    assert '(title ?? "  Pro plan  ")' in written


def test_pad_exports_wired_inputs_and_their_inline_fallbacks() -> None:
    written = code(
        [
            node("input", "component-input"),
            node("pad", "pad", values={"text": "7", "length": 2, "fill": "0"}),
            node("heading", "element", values={"tag": "h2"}),
            node("output", "component-output"),
        ],
        [
            wire("value", "input.title", "pad.text"),
            wire("length", "input.length", "pad.length"),
            wire("fill", "input.fill", "pad.fill"),
            wire("side", "input.side", "pad.op"),
            wire("text", "pad.text", "heading.text"),
            wire("render", "heading.element", "output.render"),
        ],
        [
            prop("title", "title", TEXT),
            prop("length", "length", {"kind": "number", "integer": True}),
            prop("fill", "fill", TEXT),
            prop(
                "side",
                "side",
                {"kind": "choice", "options": ["Start", "End"]},
                default="Start",
            ),
        ],
    )

    assert (
        '(title ?? "7"), (length ?? 2), (fill ?? "0"), (side ?? "Start") === "End"'
        in written
    )
    assert "length - [...value].length" in written
    assert "const characters = [...fill]" in written
