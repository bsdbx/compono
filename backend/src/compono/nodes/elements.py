"""The nodes that make markup: Element, and Fragment."""

from collections.abc import Mapping
from typing import Final

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
    boolean,
    number,
    text,
)
from compono.graph.sockets import (
    BooleanType,
    ChoiceType,
    ElementType,
    NumberType,
    TextType,
)
from compono.graph.values import Element, Value

TAGS: Final = (
    "div",
    "span",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "button",
    "img",
    "section",
    "header",
    "footer",
    "main",
    "nav",
    "article",
    "aside",
    "ul",
    "ol",
    "li",
    "strong",
    "em",
    "small",
    "label",
    "hr",
    "br",
)

# Tags that can't have text or children
VOID: Final = frozenset({"img", "hr", "br"})

# The empty role is no role
ROLES: Final = (
    "",
    "alert",
    "article",
    "banner",
    "button",
    "contentinfo",
    "dialog",
    "heading",
    "img",
    "link",
    "list",
    "listitem",
    "main",
    "navigation",
    "none",
    "presentation",
    "region",
    "status",
    "tab",
    "tablist",
    "tabpanel",
)

# The schemes a link may have. Others, like javascript:, run code
SCHEMES: Final = frozenset({"http", "https", "mailto", "tel"})

TEXT: Final = TextType()
LINK: Final = TextType(link=True)
ELEMENT: Final = ElementType()


def _tag(context: SocketsContext) -> str:
    """The tag the sockets follow: the one a wired Choice can only be, or the one typed in."""
    wired = context.wired.get("tag")
    if isinstance(wired, ChoiceType) and len(wired.options) == 1:
        return wired.options[0]

    typed = context.typed.get("tag")
    return typed if isinstance(typed, str) else "div"


def _element_sockets(context: SocketsContext) -> Sockets:
    tag = _tag(context)
    inputs = [Input("tag", "Tag", ChoiceType(options=TAGS), "div")]
    if tag == "a":
        inputs.append(Input("href", "Href", LINK, ""))
    if tag == "img":
        inputs += [Input("src", "Src", LINK, ""), Input("alt", "Alt", TEXT, "")]

    groups: tuple[Group, ...] = ()
    if tag not in VOID:
        inputs.append(Input("text", "Text", TEXT, ""))
        groups = (Group("children", "Children", ELEMENT, before="class"),)
    inputs.append(Input("class", "Class name", TEXT, ""))

    return Sockets(
        inputs=tuple(inputs),
        groups=groups,
        outputs=(Output("element", "Element", ELEMENT),),
    )


def check_link(link: str, label: str) -> None:
    """Raises NodeError for a link that runs code when it's followed."""
    # The scheme comes before the first colon, unless a /, ? or # comes first
    head = link
    for stop in "/?#":
        head = head.split(stop, 1)[0]
    scheme, colon, _ = head.partition(":")
    # Browsers drop spaces, tabs and line breaks, so "java script:" is javascript:
    scheme = "".join(scheme.split()).lower()
    if colon and scheme not in SCHEMES:
        raise NodeError(f"{label} can't be a {scheme}: link")


def _children(values: tuple[Value, ...]) -> tuple[Element, ...]:
    # A child that is Nothing isn't rendered
    return tuple(child for child in values if isinstance(child, Element))


def _element(context: EvaluateContext) -> Mapping[str, Value]:
    tag = text(context.inputs["tag"])
    # A Choice wired in can be any word
    if tag not in TAGS:
        raise NodeError(f"There's no {tag} tag")

    attributes: list[tuple[str, str | int | bool]] = []
    for name, label in (("href", "Href"), ("src", "Src")):
        link = text(context.inputs.get(name)).strip()
        if link:
            check_link(link, label)
            attributes.append((name, link))
    alt = text(context.inputs.get("alt"))
    if alt:
        attributes.append(("alt", alt))

    for name in ("id", "title", "role", "lang"):
        value = text(context.properties[name])
        if value:
            attributes.append((name, value))
    tab_index = number(context.properties["tabindex"])
    if tab_index is not None:
        attributes.append(("tabindex", int(tab_index)))
    if boolean(context.properties["hidden"]):
        attributes.append(("hidden", True))

    children: list[Element | str] = []
    content = text(context.inputs.get("text"))
    if content:
        children.append(content)
    children += _children(context.groups.get("children", ()))

    return {
        "element": Element(
            tag=tag,
            class_name=text(context.inputs["class"]),
            attributes=tuple(attributes),
            children=tuple(children),
            key=text(context.properties["key"]),
        )
    }


ELEMENT_NODE: Final = NodeType(
    type="element",
    name="Element",
    category="Elements",
    properties=(
        Property("id", "ID", TEXT, ""),
        Property("key", "Key", TEXT, ""),
        Property("title", "Title", TEXT, ""),
        Property("role", "Role", ChoiceType(options=ROLES), ""),
        Property("tabindex", "Tab index", NumberType(integer=True), None),
        Property("lang", "Lang", TEXT, ""),
        Property("hidden", "Hidden", BooleanType(), False),
    ),
    sockets=_element_sockets,
    evaluate=_element,
)


def _fragment(context: EvaluateContext) -> Mapping[str, Value]:
    # An empty tag: the children, without an element around them
    return {
        "element": Element(
            tag="",
            children=_children(context.groups["children"]),
            key=text(context.properties["key"]),
        )
    }


FRAGMENT: Final = NodeType(
    type="fragment",
    name="Fragment",
    category="Component",
    properties=(Property("key", "Key", TEXT, ""),),
    sockets=lambda _: Sockets(
        groups=(Group("children", "Children", ELEMENT),),
        outputs=(Output("element", "Element", ELEMENT),),
    ),
    evaluate=_fragment,
)

NODE_TYPES: Final = (ELEMENT_NODE, FRAGMENT)
