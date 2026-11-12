"""Tests of the graph engine through the API, with node types made for the tests."""

from collections.abc import Callable, Mapping

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, JsonValue, TypeAdapter
from sqlalchemy.orm import Session

from compono import auth
from compono.api.graphs import Evaluated, NodeTypeInfo
from compono.graph.node_types import (
    EvaluateContext,
    Group,
    Input,
    NodeError,
    NodeType,
    Output,
    Property,
    Sockets,
)
from compono.graph.sockets import ChoiceType, ElementType, NumberType, TextType
from compono.graph.values import Element, Value
from compono.nodes.component import new_graph

NUMBER = NumberType()
TEXT = TextType()


def number(value: Value) -> float:
    assert isinstance(value, int | float) and not isinstance(value, bool)
    return value


def element(context: EvaluateContext) -> Mapping[str, Value]:
    text = context.inputs["text"]
    assert isinstance(text, str)
    tag = context.properties["tag"]
    assert isinstance(tag, str)
    children = tuple(
        child for child in context.groups["children"] if isinstance(child, Element)
    )
    return {
        "element": Element(tag=tag, children=(text, *children) if text else children)
    }


def no_template(_: object) -> Sockets:
    raise NodeError("Write a template first")


TEST_TYPES = {
    node_type.type: node_type
    for node_type in [
        NodeType(
            type="add",
            name="Add",
            category="Math",
            sockets=lambda _: Sockets(
                inputs=(Input("a", "A", NUMBER, 0), Input("b", "B", NUMBER, 1)),
                outputs=(Output("sum", "Sum", NUMBER),),
            ),
            evaluate=lambda context: {
                "sum": number(context.inputs["a"]) + number(context.inputs["b"])
            },
        ),
        NodeType(
            type="element",
            name="Element",
            category="Elements",
            properties=(
                Property("tag", "Tag", ChoiceType(options=("div", "span")), "div"),
            ),
            sockets=lambda _: Sockets(
                inputs=(Input("text", "Text", TEXT, ""),),
                groups=(Group("children", "Children", ElementType()),),
                outputs=(Output("element", "Element", ElementType()),),
            ),
            evaluate=element,
        ),
        NodeType(
            type="broken",
            name="Broken",
            category="Test",
            sockets=no_template,
            evaluate=lambda _: {},
        ),
    ]
}

nodes_listed = TypeAdapter(list[NodeTypeInfo])


class Error(BaseModel):
    detail: str


@pytest.fixture()
def signed_in(
    client: TestClient,
    session: Session,
    use_node_types: Callable[[Mapping[str, NodeType]], None],
) -> TestClient:
    """The client, signed in, with the test's node types."""
    account = auth.create_account(
        session, "Mira Kovalenko", "mira@acme.dev", "correct horse battery staple"
    )
    client.cookies["session"] = auth.sign_in(session, account)
    use_node_types(TEST_TYPES)
    return client


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


def test_the_graph_engine_needs_a_session(client: TestClient) -> None:
    empty: JsonValue = {}
    for response in [
        client.get("/api/node-types"),
        client.post("/api/evaluate", json=empty),
    ]:
        assert response.status_code == 401
        assert Error.model_validate_json(response.text).detail == "no_session"


def test_the_node_types_say_what_a_new_node_has(signed_in: TestClient) -> None:
    response = signed_in.get("/api/node-types")

    assert response.status_code == 200
    listed = {info.type: info for info in nodes_listed.validate_json(response.text)}
    assert list(listed) == ["add", "element", "broken"]
    add = listed["add"]
    assert (add.name, add.category, add.properties) == ("Add", "Math", [])
    assert [(each.id, each.label, each.default) for each in add.sockets.inputs] == [
        ("a", "A", 0),
        ("b", "B", 1),
    ]
    assert add.sockets.outputs[0].type == NUMBER
    tag = listed["element"].properties[0]
    assert (tag.id, tag.default, tag.type) == (
        "tag",
        "div",
        ChoiceType(options=("div", "span")),
    )
    assert [group.id for group in listed["element"].sockets.groups] == ["children"]
    # Sockets it can't work out yet are none
    assert listed["broken"].sockets.inputs == []


def test_a_new_components_graph_evaluates_to_nothing(signed_in: TestClient) -> None:
    empty: JsonValue = {}
    response = signed_in.post("/api/evaluate", json=empty)

    assert response.status_code == 200
    assert Evaluated.model_validate_json(response.text) == Evaluated(
        nodes={}, wires={}, rendered=None
    )


def test_evaluating_a_graph(signed_in: TestClient) -> None:
    graph: JsonValue = {
        "format": 1,
        "nodes": [
            node("sum", "add", values={"a": 2}),
            node(
                "badge", "element", properties={"tag": "span"}, values={"text": "New"}
            ),
            node("card", "element", groups={"children": ["c1"]}),
            node("after", "add"),
            node("ghost", "zebra"),
            node("waiting", "add"),
        ],
        "wires": [
            wire("w1", "badge.element", "card.children/c1"),
            wire("w2", "badge.element", "after.a"),
            wire("w3", "ghost.value", "waiting.a"),
        ],
    }

    response = signed_in.post("/api/evaluate", json=graph)

    assert response.status_code == 200
    evaluated = Evaluated.model_validate_json(response.text)
    assert evaluated.nodes["sum"].outputs == {"sum": 3}
    assert evaluated.nodes["card"].outputs == {
        "element": {
            "tag": "div",
            "key": "",
            "className": "",
            "attributes": {},
            "children": [
                {
                    "tag": "span",
                    "key": "",
                    "className": "",
                    "attributes": {},
                    "children": ["New"],
                }
            ],
        }
    }
    assert evaluated.wires == {"w2": "Element can't go into Number"}
    assert evaluated.nodes["after"].outputs == {"sum": 1}
    assert evaluated.nodes["ghost"].error == "There's no zebra node"
    assert evaluated.nodes["waiting"].skipped
    assert evaluated.nodes["waiting"].outputs == {}
    assert [group.id for group in evaluated.nodes["card"].sockets.groups] == [
        "children"
    ]


def test_a_graph_in_another_format_is_refused(signed_in: TestClient) -> None:
    refused: list[JsonValue] = [
        {"format": 2},
        {"nodes": [{"id": "a"}]},
        {"wires": [{"id": "w"}]},
    ]
    for graph in refused:
        assert signed_in.post("/api/evaluate", json=graph).status_code == 422


@pytest.fixture()
def signed_in_with_compono_nodes(client: TestClient, session: Session) -> TestClient:
    """The client, signed in, with Compono's own node types."""
    account = auth.create_account(
        session, "Mira Kovalenko", "mira@acme.dev", "correct horse battery staple"
    )
    client.cookies["session"] = auth.sign_in(session, account)
    return client


def test_compono_node_types_say_where_they_belong(
    signed_in_with_compono_nodes: TestClient,
) -> None:
    response = signed_in_with_compono_nodes.get("/api/node-types")

    listed = {info.type: info for info in nodes_listed.validate_json(response.text)}
    assert [(info.type, info.category, info.single) for info in listed.values()] == [
        ("component-input", "Component", True),
        ("component-output", "Component", True),
        ("element", "Elements", False),
        ("fragment", "Component", False),
        ("boolean", "Values", False),
        ("number", "Values", False),
        ("text", "Values", False),
        ("choice", "Values", False),
        ("nothing", "Values", False),
    ]
    assert [(each.id, each.on_node) for each in listed["number"].properties] == [
        ("subtype", False),
        ("constant", False),
        ("value", True),
    ]
    assert [(group.id, group.before) for group in listed["element"].sockets.groups] == [
        ("children", "class")
    ]


def test_evaluating_says_what_the_component_renders(
    signed_in_with_compono_nodes: TestClient,
) -> None:
    empty = signed_in_with_compono_nodes.post("/api/evaluate", json=new_graph())
    rendering: JsonValue = {
        "format": 1,
        "nodes": [
            node("output", "component-output"),
            node("title", "element", values={"tag": "h3", "text": "Pro"}),
        ],
        "wires": [wire("w1", "title.element", "output.render")],
    }

    response = signed_in_with_compono_nodes.post("/api/evaluate", json=rendering)

    assert Evaluated.model_validate_json(empty.text).rendered is None
    assert Evaluated.model_validate_json(response.text).rendered == {
        "tag": "h3",
        "key": "",
        "className": "",
        "attributes": {},
        "children": ["Pro"],
    }
