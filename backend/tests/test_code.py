"""Tests of turning a component's graph into a JSX file."""

from collections.abc import Mapping

import pytest
from pydantic import JsonValue

from compono.code import CodeError, component_name, generate
from compono.graph.model import Graph
from compono.graph.node_types import (
    EvaluateContext,
    Input,
    NodeType,
    Output,
    Sockets,
    text,
)
from compono.graph.sockets import TextType
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


def test_a_refused_wire_is_left_out_as_the_preview_leaves_it_out() -> None:
    nodes, wires, props = card()
    # A Boolean can't go into Text
    wires[0] = wire("w1", "input.p3", "title.text")

    assert "<h3>Plan</h3>" in code(nodes, wires, props)


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


def test_a_tag_from_a_prop_is_a_variable_named_apart_from_the_component() -> None:
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
        [prop("p1", "level", {"kind": "choice", "options": ["h2", "h3"]})],
        name="Tag",
    )

    assert written == (
        "export default function Tag({ level }) {\n"
        '  const Tag2 = level ?? "h2";\n'
        "  return (\n"
        "    <Tag2>Hi</Tag2>\n"
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
        ("pricing card", "PricingCard"),
        ("nav-bar 2", "NavBar2"),
        ("2 columns", "Component2Columns"),
        ("", "Component"),
    ],
)
def test_the_component_is_named_for_react(name: str, component: str) -> None:
    assert component_name(name) == component
