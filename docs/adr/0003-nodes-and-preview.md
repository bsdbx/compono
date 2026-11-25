# 3. Nodes and Preview

- Status: Accepted
- Date: 11.12.2026

## Context

`PROPOSAL.md` asks for a framework that defines node types, each with sockets, properties, a category and a UI, a preview that shows every change without a refresh, and an export that renders the same as the preview. `0001-scope.md` asks the preview for 60 fps with 200 nodes. `0002-stack.md` left open how the preview renders a component, to be decided together with the node framework.

The glossary and the design screens already settle what users see: the socket types, which wires connect, socket groups, properties that can be exposed, and the Component Input and Component Output nodes. This ADR decides how that works underneath.

## Decision

### The alpha

- **No interactivity**: no hover states and no click interactions. `0001-scope.md` keeps them for the final submission.
- **No lists**: a component can't repeat an item for each entry in its data.
- **Plain Tailwind CSS 4**: styling is Tailwind classes in Class name, with Tailwind's default settings. Configuring Tailwind, per component or per project, comes later.

### Graph

A component's graph is one JSON document in `components.graph`:

```json
{
  "format": 1,
  "nodes": [
    {
      "id": "0193f2c4-…",
      "type": "element",
      "position": { "x": 120, "y": 80 },
      "values": { "tag": "div", "className": "card" },
      "properties": { "role": "none" },
      "exposed": [],
      "groups": { "children": ["0193f2c5-…", "0193f2c6-…"] }
    }
  ],
  "wires": [
    {
      "id": "0193f2c7-…",
      "from": { "node": "0193f2c8-…", "socket": "element" },
      "to": { "node": "0193f2c4-…", "socket": "children/0193f2c5-…" }
    }
  ]
}
```

- `format` is the version of this layout, so that a later change can migrate older graphs. It's not the component's `version`, which counts saves.
- `values` are typed into inputs on the node, `properties` are set in the properties panel, and `exposed` lists the properties that show as inputs.
- A socket's id is a fixed name from its node type, so renaming a label keeps its wires. Each row of a socket group has its own id, so reordering rows keeps theirs.
- The API will check this shape with Pydantic. What the nodes mean stays in the frontend, as `0002-stack.md` decides.

### Node types

A node type is defined under `backend/src/compono/nodes/`. The Switch declaration in `logic.py` shows the structure.

```python
SWITCH: Final = NodeType(
    type="switch",
    name="Switch",
    category=CATEGORY,
    sockets=_switch_sockets,
    evaluate=_switch,
    code=_switch_code,
)
```

- `sockets` describes the node's inputs and outputs. Element's inputs follow its tag, and Switch's result type follows its True and False inputs.
- `evaluate` turns input values into output values. The same inputs always give the same outputs.
- `code` describes the equivalent expression or JSX for export when the node depends on props.
- One node component draws every node on the canvas from its sockets, and the properties panel draws itself from the properties. A node type has no UI code of its own.
- `backend/src/compono/nodes/__init__.py` registers the node types. A test checks that every node module is registered.

### Socket types

A socket type is a value, not just a name. Number can carry a subtype and a range, Choice its options, and Object its fields, each with a socket type of its own.

A wire is allowed from an output to an input when:

- both have the same socket type, or the output's is a subtype of the input's: Integer feeds Number, and Link feeds Text;
- for two Choice sockets, the output has a selected value and the input accepts that value;
- the input is Any, which then takes the output's socket type;
- the input is a Slot and the output an Element.

Any other wire is refused. The canvas shows the wire in red, and the preview and JSX export stop until every wire is valid. Changing a value's type takes a Convert node. This replaces the implicit conversions of `PROPOSAL.md`, whose example, Int to Float, subtypes cover.

### Nothing

A wire that brings Nothing counts as no wire: the input uses the value typed in on the node, and a child that is Nothing isn't rendered. A prop that isn't required and has no default gives Nothing.

### Evaluation

- The editor evaluates the graph in the browser, on the main thread.
- A wire that would make a loop is refused, so every node comes after the nodes it takes values from.
- Evaluation follows dependency order. For each node, it works out its sockets from the upstream types and values, checks its incoming wires, then computes its values.
- Each node's outputs are kept. After an edit, only the edited node and the nodes after it are evaluated again, and evaluation stops at a node whose outputs didn't change. An Element that didn't change stays the same object, so React skips it in the preview.
- A node that can't evaluate has an error that says why, such as "badge.tone no longer exists". The nodes that depend on it aren't evaluated, and the preview says **Can't render** with **Show node**.
- In the preview, Component Input gives each prop its default, or Nothing when it has none.

### Preview

- The editor converts the Element wired into Component Output to escaped HTML in a sandboxed iframe. The frame accepts updates through messages from the editor and has its own origin.
- The iframe keeps the chosen screen size's width and height when the preview panel resizes. Tailwind's responsive classes, such as `md:`, and viewport units respond to these dimensions rather than the editor's window. A dashed outline shows the screen's bounds.
- Preview zoom starts at 100% and is remembered per component; Fit scales the entire screen into the panel. Ctrl+wheel zooms the preview without changing browser zoom. Middle-drag pans within the rendered content's bounds, with a 40-pixel allowance. F centers the content in the panel. Neither the panel nor the iframe scrolls. Panel dimensions and the library's collapsed state are saved once for the browser, across projects and teams.
- The preview's CSS is built by Tailwind's browser compiler inside the iframe when its HTML changes. The preview's styles stay apart from the editor's.
- With nothing wired to Component Output, the preview says **Nothing to render yet**.
- Nodes produce data, never code. Element's tags and attributes come from fixed lists, and it refuses a link that runs code, such as `javascript:`. Share links will show this same preview to anyone, so this has to hold.

### Export

The exporter uses each node type's `code` function for outputs that depend on props. The export puts them together into one `.jsx` component for React 19, with the class names as they are, so the app that uses it needs Tailwind CSS 4. Tests evaluate sample graphs, run the code generated for them, and compare the HTML that both render.

### Canvas

React Flow, as `0002-stack.md` chose. Below 50% zoom, nodes leave out their text and inputs to keep navigation responsive in large graphs.

## Consequences

- **Each node is written twice**: `evaluate` for the preview and `code` for the export can drift apart, and the tests that compare them have to catch it. In exchange, an edit evaluates only what it changes, instead of building and running the whole component again.
- **Types travel along wires**: changing a prop or an Object's fields can break nodes further on. That's why an error belongs to a node and names what broke.
- **Interactivity fits in later**: a hover or click state is a value that nodes read, and evaluation already updates only what depends on a change. It needs new node types, and state in the preview and the export, but should need no new kind of evaluation.
- **Lists need a List socket type** later, and nodes that repeat an Element for each item.
- **The editor ships Tailwind's compiler**, which makes its JavaScript larger. Configurable Tailwind settings will be passed to the same compiler.
- **One node component draws every node**, which keeps node types small. A node that needs a look of its own, such as a color picker, will need a way to provide it.
- **A component can become a node** for the team library with the same API: its props are the node's inputs, and its Render is its output.
- **The graph's format is versioned**: changing it means writing a migration for older graphs.
