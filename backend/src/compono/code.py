"""A component as code: a React component in a JSX file, which renders as the Preview does."""

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from compono.graph.evaluate import Evaluation, NodeResult, evaluate
from compono.graph.model import Graph, Node, Wire
from compono.graph.node_types import (
    Choose,
    Code,
    CodeContext,
    Js,
    Jsx,
    NodeError,
    NodeType,
    bare,
    expression,
    js_of,
    known,
    literal,
    markup,
)
from compono.graph.values import Element, Value, from_json
from compono.nodes.component import COMPONENT_INPUT, COMPONENT_OUTPUT

# Words JavaScript keeps for itself, which can't name a prop
RESERVED: Final = frozenset(
    {
        "await",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "continue",
        "debugger",
        "default",
        "delete",
        "do",
        "else",
        "enum",
        "export",
        "extends",
        "false",
        "finally",
        "for",
        "function",
        "if",
        "implements",
        "import",
        "in",
        "instanceof",
        "interface",
        "let",
        "new",
        "null",
        "package",
        "private",
        "protected",
        "public",
        "return",
        "static",
        "super",
        "switch",
        "this",
        "throw",
        "true",
        "try",
        "typeof",
        "var",
        "void",
        "while",
        "with",
        "yield",
    }
)

# HTML attributes that React spells another way
REACT_NAMES: Final = {"class": "className", "tabindex": "tabIndex"}


class CodeError(Exception):
    """The graph can't be code yet, and why: each node in error, or what code can't do."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


@dataclass(frozen=True)
class Generated:
    filename: str
    code: str


def component_name(name: str) -> str:
    """The component's name for React: its words, each with a capital, like PricingCard."""
    words = "".join(
        letter if letter.isascii() and letter.isalnum() else " " for letter in name
    ).split()
    joined = "".join(word[:1].upper() + word[1:] for word in words)
    if not joined or joined[0].isdigit():
        return f"Component{joined}"

    return joined


def _jsx_of(element: Element) -> Jsx:
    """A rendered element as JSX, as the Preview shows it."""
    return Jsx(
        tag=element.tag,
        attributes=(
            ("key", element.key or None),
            ("class", element.class_name or None),
            *element.attributes,
        ),
        children=element.children,
    )


class _Printer:
    """Writes JSX, with a variable for each tag that depends on the props."""

    def __init__(self, taken: set[str]) -> None:
        self.tags: list[str] = []
        self.fragment = False
        # Names the tags' variables can't have, like the props'
        self.taken = taken

    def _tag(self, jsx: Jsx) -> str:
        if isinstance(jsx.tag, Js):
            # JSX takes a tag from a variable with a capital
            number = 1
            while (name := "Tag" if number == 1 else f"Tag{number}") in self.taken:
                number += 1
            self.taken.add(name)
            self.tags.append(f"const {name} = {bare(expression(jsx.tag))};")
            return name

        if jsx.tag == "" and any(
            name == "key" and value is not None for name, value in jsx.attributes
        ):
            self.fragment = True
            return "Fragment"

        return jsx.tag

    @staticmethod
    def _attribute(name: str, value: Code) -> str:
        if value is None or value is False:
            return ""

        name = REACT_NAMES.get(name, name)
        if value is True:
            return f" {name}"

        if isinstance(value, Js):
            return f" {name}={{{bare(expression(value))}}}"

        if isinstance(value, str) and re.fullmatch(r'[^"&\\{}\n\r]*', value):
            return f' {name}="{value}"'

        if markup(value):
            raise TypeError(f"{name} can't be an element")

        return f" {name}={{{literal(known(value))}}}"

    @staticmethod
    def _text(value: Code) -> str | None:
        """A child that's text, or None for one that's an element."""
        if isinstance(value, Js):
            return f"{{{bare(expression(value))}}}"

        if isinstance(value, str):
            # JSX trims a line's ends and reads braces, tags and entities in text, so such text is a string
            if value == value.strip() and re.fullmatch(r"[^{}<>&\n\r]+", value):
                return value
            return f"{{{json.dumps(value, ensure_ascii=False)}}}"

        if isinstance(value, int | float) and not isinstance(value, bool):
            return f"{{{literal(value)}}}"

        return None

    def lines(self, node: Jsx | Element, indent: str) -> list[str]:
        """The element's lines, each with its indent."""
        jsx = node if isinstance(node, Jsx) else _jsx_of(node)
        tag = self._tag(jsx)
        attributes = "".join(
            self._attribute(name, value)
            for name, value in jsx.attributes
            if not (tag == "" and name == "key")
        )
        children = [
            child
            for child in jsx.children
            if markup(child) or self._text(child) is not None
        ]
        if not children:
            return [f"{indent}<{tag}{attributes} />" if tag else f"{indent}<></>"]

        texts = [self._text(child) for child in children]
        one_line = (
            f"{indent}<{tag}{attributes}>{''.join(t or '' for t in texts)}</{tag}>"
        )
        if all(text is not None for text in texts) and len(one_line) <= 100:
            return [one_line]

        inner = f"{indent}  "
        lines = [f"{indent}<{tag}{attributes}>"]
        for child, text in zip(children, texts, strict=True):
            if text is not None:
                lines.append(f"{inner}{text}")
            elif isinstance(child, Choose):
                lines += self.choose(child, inner, "{", "}")
            elif isinstance(child, Jsx | Element):
                lines += self.lines(child, inner)
        lines.append(f"{indent}</{tag}>")
        return lines

    def branch(self, code: Code, indent: str) -> list[str] | str:
        """A branch of a choice: an expression, or the lines of an element."""
        if isinstance(code, Choose):
            return self.choose(code, indent, "", "")

        if isinstance(code, Jsx | Element):
            return self.lines(code, indent)

        written = js_of(code)
        return "null" if written is None else bare(written)

    def choose(
        self, choose: Choose, indent: str, opening: str, closing: str
    ) -> list[str]:
        """One of two branches by its condition, in braces as a child or bare to return."""
        test = choose.condition.code
        then = self.branch(choose.then, f"{indent}  ")
        otherwise = self.branch(choose.otherwise, f"{indent}  ")
        if isinstance(then, str) and isinstance(otherwise, str):
            return [f"{indent}{opening}{test} ? {then} : {otherwise}{closing}"]

        lines = [
            f"{indent}{opening}{test} ? " + (then if isinstance(then, str) else "(")
        ]
        if isinstance(then, list):
            lines += [*then, f"{indent})"]
        lines[-1] += " : " + (otherwise if isinstance(otherwise, str) else "(")
        if isinstance(otherwise, list):
            lines += [*otherwise, f"{indent})"]
        lines[-1] += closing
        return lines


class _Generator:
    def __init__(self, graph: Graph, node_types: Mapping[str, NodeType]) -> None:
        self.graph = graph
        self.node_types = node_types
        self.evaluation: Evaluation = evaluate(graph, node_types)
        # The first of two nodes with one id, as evaluating takes it
        self.nodes: dict[str, Node] = {}
        for node in graph.nodes:
            self.nodes.setdefault(node.id, node)
        # The wires evaluating used, by the input they go into
        self.into: dict[tuple[str, str], Wire] = {
            (wire.to.node, wire.to.socket): wire
            for wire in graph.wires
            if wire.id not in self.evaluation.wires
        }
        self.props = {prop.id: prop for prop in graph.props}
        self._dynamic: dict[str, bool] = {}
        self._outputs: dict[str, Mapping[str, Code]] = {}

    def wires_into(self, node_id: str) -> list[Wire]:
        return [wire for (to, _), wire in self.into.items() if to == node_id]

    def dynamic(self, node_id: str) -> bool:
        """Whether the node's outputs depend on the props."""
        if node_id not in self._dynamic:
            node = self.nodes[node_id]
            self._dynamic[node_id] = node.type == COMPONENT_INPUT.type or any(
                self.dynamic(wire.from_.node) for wire in self.wires_into(node_id)
            )
        return self._dynamic[node_id]

    def needed(self, node_id: str, seen: set[str]) -> None:
        """The node, and every node it takes values from."""
        if node_id in seen:
            return

        seen.add(node_id)
        for wire in self.wires_into(node_id):
            self.needed(wire.from_.node, seen)

    def value(self, node: Node, socket: str, typed: Value) -> Code:
        """What goes into an input: its wire's value, or what's typed in when the wire brings Nothing."""
        wire = self.into.get((node.id, socket))
        if wire is None:
            return typed

        brought = self.output(wire.from_.node, wire.from_.socket)
        if isinstance(brought, Js):
            # A wire that never brings Nothing needs nothing to fall back to
            if not brought.may_be_nothing:
                return brought
            return Js(expression(brought), fallback=typed)

        # A wire that brings Nothing counts as no wire
        return typed if brought is None else brought

    def output(self, node_id: str, socket: str) -> Code:
        node = self.nodes[node_id]
        if node.type == COMPONENT_INPUT.type:
            prop = self.props.get(socket)
            return None if prop is None else Js(prop.name)

        result: NodeResult = self.evaluation.nodes[node_id]
        if not self.dynamic(node_id):
            return result.outputs.get(socket)

        if node_id not in self._outputs:
            self._outputs[node_id] = self.code(node, result)
        return self._outputs[node_id].get(socket)

    def code(self, node: Node, result: NodeResult) -> Mapping[str, Code]:
        node_type = self.node_types[node.type]
        if node_type.code is None:
            raise CodeError([f"{node_type.name} can't take a prop in code yet"])

        inputs = {
            each.id: self.value(
                node,
                each.id,
                from_json(node.values[each.id], each.type)
                if each.id in node.values
                else each.default,
            )
            for each in result.sockets.inputs
        }
        groups = {
            group.id: tuple(
                self.value(node, f"{group.id}/{row}", None)
                for row in node.groups.get(group.id, [])
            )
            for group in result.sockets.groups
        }
        properties: dict[str, Code] = {
            prop.id: inputs[prop.id]
            if prop.id in node.exposed and prop.id in inputs
            else (
                from_json(node.properties[prop.id], prop.type)
                if prop.id in node.properties
                else prop.default
            )
            for prop in node_type.properties
        }
        try:
            return node_type.code(
                CodeContext(inputs=inputs, groups=groups, properties=properties)
            )
        except NodeError as error:
            raise CodeError([f"{node_type.name}: {error}"]) from error


def generate(graph: Graph, node_types: Mapping[str, NodeType], name: str) -> Generated:
    """The component as a JSX file. Raises CodeError if a node it renders has an error, or a prop can't be a name."""
    generator = _Generator(graph, node_types)
    component = component_name(name)

    errors = [
        f"{prop.name} can't name a prop"
        for prop in graph.props
        if not re.fullmatch(r"[A-Za-z_$][\w$]*", prop.name) or prop.name in RESERVED
    ]
    outputs = [node for node in graph.nodes if node.type == COMPONENT_OUTPUT.type]
    output = outputs[0] if outputs else None
    if output is not None:
        needed: set[str] = set()
        generator.needed(output.id, needed)
        for node_id in sorted(needed, key=list(generator.nodes).index):
            error = generator.evaluation.nodes[node_id].error
            if error is not None:
                node_type = node_types.get(generator.nodes[node_id].type)
                errors.append(f"{node_type.name if node_type else 'A node'}: {error}")
    if errors:
        raise CodeError(errors)

    render = None if output is None else generator.value(output, "render", None)
    printer = _Printer({component, *(prop.name for prop in graph.props)})
    if isinstance(render, Jsx | Element):
        body = ["  return (", *printer.lines(render, "    "), "  );"]
    elif isinstance(render, Choose):
        body = ["  return (", *printer.choose(render, "    ", "", ""), "  );"]
    elif isinstance(render, Js):
        body = [f"  return {expression(render)};"]
    else:
        body = ["  return null;"]

    props = [
        prop.name
        if (default := from_json(prop.default, prop.type)) is None
        else f"{prop.name} = {literal(default)}"
        for prop in graph.props
    ]
    head = f"export default function {component}({{ {', '.join(props)} }}) {{"
    if not props:
        head = f"export default function {component}() {{"
    elif len(head) > 80:
        # A prop a line, when they don't fit on one
        head = "\n".join(
            [
                f"export default function {component}({{",
                *(f"  {prop}," for prop in props),
                "}) {",
            ]
        )
    lines = [
        *(['import { Fragment } from "react";', ""] if printer.fragment else []),
        head,
        *(f"  {tag}" for tag in printer.tags),
        *body,
        "}",
        "",
    ]
    return Generated(filename=f"{component}.jsx", code="\n".join(lines))
