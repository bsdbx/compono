# Compono

## Objective

Build a handy tool for frontend developers who do not enjoy coding but love designing. The tool itself is a no-code, procedural, node-based platform to build and preview **[React]** components. The purpose is to minimize the struggle of writing repetitive boilerplate code and maximize the actual design process.

## Details

### 1. Team Members

- Bohdan Rak
- Anastasia Koshovenko
- Yevhenii Pron

### 2. Project Title

Compono

### 3. The Problem or User Need

Building UI components in **[React]** involves a lot of repetitive boilerplate: setting up props, wiring styles, nesting children and repeating the same structure across components multiple times. For developers who prefer design, this coding work takes time and attention away from what they actually want to accomplish: shaping how the component looks and behaves.

In a team, the problem grows. Every member builds components in their own way, and there is no simple, visual way to review a component before it becomes part of the shared set of components the team relies on.

### 4. Target Users

- Front-end developers who do not like coding and would rather focus on design.
- Small front-end teams that build and maintain a shared set of components together, including the team lead, who oversees that work, and the reviewers, who review developers' components.

### 5. Why the System Is Useful

- **Less time and mental effort on boilerplate:** components are assembled visually from nodes instead of being written by hand.
- **Immediate feedback:** every change is visible right away in a real-time preview.
- **Reuse:** components that are already built become nodes for building new, more complex ones.
- **Quality control for teams:** components reach the shared team library only after a review, similar to a pull request, so the library stays consistent.
- **Easy sharing:** a component can be shown to anyone through a link, without that person needing an account.

### 6. Product / System Concept

**Compono** is a node-based tool to build and visualize [**React**] components. Users combine nodes (other, often smaller components) to build more complex and nested components, without needing to know or write any code.

Each team has a shared **team library** of components. Every component author works in their own **personal workspace**. When a component is ready, the author submits it as a **merge request**, much like a pull request. A reviewer inspects the request, previews the component and then either merges it into the team library or sends it back with feedback. Once merged, the component is available to the whole team as a node for building new components.

Any component can also be shared through a
**public view link**: whoever has the link can preview the component, the same way documents are usually shared.

### 7. Key Functional Requirements

1. **Canvas Area**: A place where users can add, connect and remove nodes.
2. **Properties Area**: A place where users can manually set the parameters of the selected node using handy controls.
3. **Live Preview Area**: A place where users can preview the component they are building in **real time**: every change on the canvas or in the properties area is reflected in the preview without a manual refresh.
4. **Nodes**: A framework for the **Compono** developers to define, implement and automatically register new node types, each with a list of input and output *Sockets, Properties,* a *Category* and a *UI*. Nodes are the user's main utility for creating components.
5. **Sockets**: A way for users to differentiate between data types. A utility for the **Compono** developers to define implicit socket conversions between different socket types (e.g. *Int -> Float*). Examples of socket types: `FloatSocket`, `IntSocket`, `StyleSocket`, `ChildrenSocket` etc.
6. **Properties**: A way for users to change different aspects of a node. Different types of properties serve different purposes. Examples of types: `FloatProperty`, `IntegerProperty`, `VectorProperty`, `BooleanProperty`, `PointerProperty` (e.g. pointing to an external datablock).
7. **User Accounts**: Users can sign up, log in and log out. All work except viewing a shared link requires an account.
8. **Teams**: A team lead can create a team, invite members to it and assign each member to a role (see *User Roles*).
9. **Personal Workspace**: Each component author has their own workspace with draft components. Drafts are not visible in the team library and can be edited only by their author (and the team lead).
10. **Team Library**: A persistent, shared library of the team's merged components. Any member can drag and drop a component from the library onto the canvas to use it as a node in a new component.
11. **Merge Request**: An author can submit a draft as a merge request, either as a new component or as a change to an existing library component. Every merge request has a status: `Open`, `Pending`, `Merged` or `Closed`. The author can update an open request after receiving feedback and resubmit it.
12. **Review**: A reviewer can open a merge request, inspect its node graph in read-only mode, try the component in the live preview, and leave comments on the request. The reviewer then either merges the request into the team library or requests changes with written feedback, which the author sees.
13. **Share Links**: A user can generate a public link to a component. Anyone who opens the link can view the component's live preview without logging in, but cannot edit it. The user who created the link can revoke it, after which it stops working.
14. **Code Export**: A user can export a component as **[React]** code (a `.jsx` file) that renders the same as the live preview.

### 8. User Roles

One person can hold more than one role; for example, two authors in a small team can review each other's work.

#### Team Lead

- Has access to everything in the team.
- Creates the team, invites and removes members, and assigns or changes their roles.
- Can do everything a *Component Author* and a *Reviewer* can do.
- Can manage the team library directly, e.g. delete or rename merged components.

#### Component Author

- Works in their own personal workspace: creates, edits and deletes their draft components.
- Uses components from the team library as nodes in new components.
- Submits drafts as merge requests, reads the reviewer's feedback, updates the request and resubmits it.
- Generates and revokes share links for their own components and exports them as code.

#### Reviewer

- Sees all open merge requests in the team.
- Opens a request in read-only mode, inspects its node graph and tries it in the live preview.
- Leaves comments, then merges the request into the team library or requests changes with feedback.
- Cannot edit another author's component directly.

#### Link Viewer

- Anyone with a share link; no account required.
- Can view the shared component's live preview.
- Cannot edit, comment, or see anything else in the team's workspace or library.

### 9. Initial Distribution of Responsibilities

**Bohdan Rak**: Build and test the core of the application.

**Yevhenii Pron**: Build and test the backend of the application.

**Anastasia Koshovenko**: Build, test and document front-end of the application. Use the core API to build nodes.

[React]: https://github.com/react/react
