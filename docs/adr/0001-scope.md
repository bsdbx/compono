# 1. Scope

- Status: Accepted
- Date: 10.21.2026

## Context

We are building a node-based editor for **React** components. The goal is to make a product that benefits front-end developers who don't like writing code, but are passionate about designing and building.

For an in-depth product description, see `PROPOSAL.md`.

The final deadline is 15.12.2026, the date of the final submission. To make it convenient, we have decided to split our work into milestones (`M0`-`M7`) to have a sense of time and understand what we can or cannot implement in that time frame.

As the task requires, the team consists of 2 people: Bohdan Rak and Anastasia Koshovenko. The project is set to be maintained afterwards, so contributions will be happily accepted.

The course states that the app must follow the mandatory stack: FastAPI, PostgreSQL, authentication and authorization, several roles and a non-trivial backend. It also states that there must be at least two roles with genuinely different capabilities, not only "user" and "admin who can see everything".

An MVP must feature all of the functional requirements listed in `PROPOSAL.md`. Without them, the project should not be considered completed. In an emergency, we must adjust the requirements such that the app is still functional, though likely not as feature-complete.

## Decision

### In scope

All functional requirements listed in `PROPOSAL.md`.

Live Preview supports simple interactivity: hover styles and click interactions, such as switching a component between its states.

### Out of scope

Anything that is outside of `PROPOSAL.md` should be considered out of scope, unless explicitly changed.

Some concrete out-of-scope requirements include:

- Desktop app
- Phone layout
- Working offline
- Embedding preview on other sites
- Animations
- Supporting several React versions

The list may go on and on, but we consider those concrete, as their implementation would require more time and resources than we have.

### Non-functional requirements

It is worth stating the non-functional requirements, so that anybody can refer to them while designing the parts of the app they describe.

- Live Preview must give at least 60 fps with 200 nodes. It does not mean that 201 nodes may drop to 30 fps: the application must be optimized for an arbitrary number of nodes, degrading gradually to about 30 fps with 400 nodes. Navigating the canvas must stay smooth with even more nodes visible on the screen, say 300.
- The app is a web application for desktop browsers, developed and tested on the latest desktop Chrome.
- The app runs on a public URL, hosted on a hosting service. It needs an internet connection: there is no offline mode.
- Work is saved automatically. At most 15 seconds of work can be lost. This means an autosave at least every 15 seconds. This, however, should be tested to understand whether we can get to a shorter window without much overhead.
- A share link opens in any browser without an account, and shows only the component's Live Preview, with its hover and click interactions. The component's code may be visible to viewers; that is something crucial to think about after the submission.
- Export produces `.jsx` files for one fixed React version, the same one the Live Preview uses.
- Security follows the standard practices for web applications. Security will be thought about in more depth during development.

## Consequences

The main drawback of a university project with a set deadline is that there are a lot of features that cannot be implemented, or would rather be implemented later, due to the limited time. This, however, forces the project to be minimal, working and functional.

Apart from the philosophy, there are other, more technical consequences:

- **Interactivity has to be designed in from the start**: Hover and click states mean a component is more than a static picture. The node model needs a notion of states and of what switches between them, and the export has to turn that into real React state and click handlers.
- **The performance target rules out simple designs**: Holding 60 fps at 200 nodes, and degrading gradually after that, means an edit can't recompute the whole graph; only what the edit affects can be recomputed. It also means we need a benchmark graph and a way to measure frame rate from `M2` onwards, or the target cannot be checked.
- **Share links are the app's public surface**: They are the one part anyone can reach without an account. So share tokens must be impossible to guess and revocable, and users should understand that a shared component is effectively public, code included.
- **Hosting is narrowed down**: The course requires FastAPI and PostgreSQL, so the hosting service must run a Python app and a Postgres database, which rules out purely static hosts.
