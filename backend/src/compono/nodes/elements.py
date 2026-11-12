"""The nodes that make markup: Element, and Fragment."""

from collections.abc import Mapping
from typing import Final

from compono.graph.node_types import (
    Code,
    CodeContext,
    EvaluateContext,
    Group,
    Input,
    Js,
    Jsx,
    NodeError,
    NodeType,
    Output,
    Property,
    Sockets,
    SocketsContext,
    boolean,
    expression,
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


def _known(code: Code) -> Value:
    """A value that doesn't depend on the props."""
    if isinstance(code, Js | Jsx):
        raise TypeError(f"{code!r} depends on the props")

    return code


def _text_code(code: Js) -> str:
    # Nothing is empty text, so an empty fallback is no fallback
    return code.code if code.fallback in (None, "") else expression(code)


def _optional(code: Code) -> Code:
    """Text that's left out when it's empty, like an attribute."""
    if isinstance(code, Js):
        return Js(f"{_text_code(code)} || undefined")

    return text(_known(code)) or None


def _renders(row: Code) -> bool:
    # A child that is Nothing isn't rendered, which React does by itself for an expression
    match row:
        case Element() | Js() | Jsx():
            return True
        case _:
            return False


def _child_elements(rows: tuple[Code, ...]) -> tuple[Code, ...]:
    return tuple(row for row in rows if _renders(row))


def _element_code(context: CodeContext) -> Mapping[str, Code]:
    """The element in JSX, as _element makes it, with the props' expressions where they go."""
    attributes: list[tuple[str, Code]] = []
    for name in ("href", "src"):
        link = context.inputs.get(name)
        if isinstance(link, Js):
            attributes.append((name, Js(f"{_text_code(link)}?.trim() || undefined")))
        else:
            attributes.append((name, text(_known(link)).strip() or None))
    attributes.append(("alt", _optional(context.inputs.get("alt"))))
    attributes += [
        (name, _optional(context.properties[name]))
        for name in ("id", "title", "role", "lang")
    ]
    tab_index = context.properties["tabindex"]
    if isinstance(tab_index, Js):
        attributes.append(("tabindex", Js(expression(tab_index))))
    else:
        known = number(_known(tab_index))
        attributes.append(("tabindex", None if known is None else int(known)))
    hidden = context.properties["hidden"]
    if isinstance(hidden, Js):
        # An attribute that's just there or not: Nothing and false both leave it out
        attributes.append(
            (
                "hidden",
                Js(
                    hidden.code
                    if hidden.fallback in (None, False)
                    else expression(hidden)
                ),
            )
        )
    else:
        attributes.append(("hidden", boolean(_known(hidden))))

    children: list[Code] = []
    content = context.inputs.get("text")
    if isinstance(content, Js):
        children.append(Js(_text_code(content)))
    elif text(_known(content)):
        children.append(text(_known(content)))
    children += _child_elements(context.groups.get("children", ()))

    tag = context.inputs["tag"]
    class_name = context.inputs["class"]
    return {
        "element": Jsx(
            tag=Js(expression(tag)) if isinstance(tag, Js) else text(_known(tag)),
            attributes=(
                ("key", _optional(context.properties["key"])),
                ("class", _optional(class_name)),
                *attributes,
            ),
            children=tuple(children),
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
    code=_element_code,
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


def _fragment_code(context: CodeContext) -> Mapping[str, Code]:
    return {
        "element": Jsx(
            tag="",
            attributes=(("key", _optional(context.properties["key"])),),
            children=_child_elements(context.groups["children"]),
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
    code=_fragment_code,
)

NODE_TYPES: Final = (ELEMENT_NODE, FRAGMENT)
