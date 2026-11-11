# Compono

Compono is a web app where teams build React components by wiring nodes together in a graph. This glossary covers what the alpha builds, and grows with the app.

## Language

### Accounts and teams

**Account**:
A person's identity in Compono, identified by their email address.
_Avoid_: User, profile, login

**Team**:
A group of accounts that owns projects.
_Avoid_: Organization, workspace

**Team URL**:
A team's unique address in Compono, such as `compono.app/acme`.
_Avoid_: Slug, handle

**Owner**:
The team role that manages the team: its name and URL, its invite link, and who is in it. Owners create the team's projects and can open any of them.

**Member**:
The team role of everyone in a team who isn't an owner.

**Invite link**:
A team's shareable link that lets whoever opens it join the team as a member. It works for an hour.
_Avoid_: Invite code, join link

### Projects

**Project**:
A set of components that some of a team's members build together.
_Avoid_: Workspace, library, repository

**Lead**:
A project role that manages the project: its name and description, who is in it and with which role, and deleting it. A project can have several.

**Developer**:
The project role of those who build a project's components.
_Avoid_: Editor, which is the screen

**Invitation**:
An emailed offer to join a project, which also adds the person to the project's team if they aren't in it yet. It stays pending until accepted, and a lead can revoke it.
_Avoid_: Invite link, which is a team's

### Components

**Component**:
A reusable piece of interface, built from a graph, that renders as a React component. It belongs to one project and is shared by everyone in it.
_Avoid_: Widget, block

**Prop**:
A value that a component accepts from whoever uses it, with a name, a socket type, an optional default and a description.
_Avoid_: Parameter, attribute, argument

**Preview**:
The live rendering of the open component, at a chosen screen size.
_Avoid_: Live Preview, render

**Screen size**:
A named width that the preview renders at, such as Desktop 1280 or Mobile 390. Each component has its own.
_Avoid_: Breakpoint, viewport, device

### Graph

**Graph**:
The nodes and wires that define one component.
_Avoid_: Node graph, node tree, canvas

**Editor**:
The screen where a project's components are built: the components list, the canvas, the preview and the properties panel.

**Canvas**:
The area of the editor where a component's graph is laid out and edited.

**Node**:
One step of a graph. It takes values in through its inputs and passes results on through its outputs.
_Avoid_: Block, box

**Node type**:
The kind of a node, such as Element, Switch or Template. It decides the node's sockets and properties.
_Avoid_: Node class, node kind

**Category**:
A group of node types in the Add node menu, such as Logic, Text or Dates.

**Socket**:
A point on a node where a wire attaches: either an input or an output, with one socket type.
_Avoid_: Port, pin, handle

**Input**:
A socket that a node receives a value through. With nothing wired to it, it uses a value typed in on the node.

**Output**:
A socket that a node passes a result through. One output can feed any number of inputs.

**Wire**:
A connection from one output to one input.
_Avoid_: Link, edge, connection

**Socket group**:
A numbered, reorderable list of inputs on a node that grows a row at a time, such as an Element's Children.
_Avoid_: Multi-input, dynamic sockets

**Add socket**:
The last socket of a node whose inputs can grow, such as Join or Merge. Wiring into it, or clicking it, adds one more input.

**Property**:
A setting of a node that is set in the properties panel rather than on the node, and that can't take a wire.
_Avoid_: Option, attribute, parameter

**Expose**:
To turn a property into an input, so that it shows on the node and can take a wire. Unexposing turns it back into a property.

**Component Input**:
The node that brings a component's props into its graph.

**Component Output**:
The node that decides what a component renders: whatever is wired into its Render input.

### Socket types

**Socket type**:
What a socket accepts or gives: Boolean, Number, Text, Choice, Object, Date, Element, Slot, Nothing or Any.
_Avoid_: Value type, data type

**Subtype**:
A narrower kind within a socket type, such as Integer for Number, or Link for Text.

**Choice**:
A value that is one of a fixed set of options, such as an HTML tag or a size.
_Avoid_: Enum, select

**Object**:
A value made of named fields, each with its own socket type.
_Avoid_: Record, map, dictionary

**Element**:
Rendered markup, such as an HTML or SVG element with its children.
_Avoid_: JSX, DOM node

**Slot**:
The socket type of the place where a component renders: Component Output's Render input, which takes an Element.

**Nothing**:
The value that means there is no value.
_Avoid_: Null, undefined, empty

**Any**:
The socket type of an input that accepts any type until something is wired into it, and from then on takes the wired type.
_Avoid_: Generic, wildcard

## Relationships

- An **Account** can be in many **Teams**, and a **Team** has at least one **Owner**
- A **Team** has many **Projects**, and each **Project** belongs to one **Team**
- An **Owner** creates a **Project** and is its first **Lead**. A **Project** has one or more **Leads** and any number of **Developers**
- A **Project** has many **Components**, and each **Component** has one **Graph** and its own **Screen sizes**
- A **Graph** has exactly one **Component Input**, which carries the component's **Props**, and exactly one **Component Output**
- Every **Node** has one **Node type**, and every **Node type** is in one **Category**
- A **Wire** runs from one **Output** to one **Input**, and an **Input** takes at most one **Wire**
- A **Wire** connects sockets of the same **Socket type**. An **Any** input takes the type of whatever is wired into it, and a **Slot** takes an **Element**
