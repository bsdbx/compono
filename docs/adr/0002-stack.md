# 2. Stack

- Status: Accepted
- Date: 11.10.2026

## Context

`0001-scope.md` sets what the stack has to deliver: a web app for desktop browsers on a public URL, a Preview that holds 60 fps with 200 nodes, saving at most every 15 seconds, and code that is generated from every component.

The course requires FastAPI, PostgreSQL, authentication and authorization, and several roles. The backend is already set up in Python 3.14 with uv, and is type-checked with mypy in its strictest mode.

The alpha has no email: no password reset, and no invitations sent by email.

## Decision

### Repository and tooling

- The frontend lives in `frontend/`, next to `backend/`, in the same repository.
- Node.js 26 LTS and **pnpm**, with both versions pinned in the repository.
- **Biome** to lint and format TypeScript, JSON and CSS.
- TypeScript in `strict` mode, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- The pre-commit hook and CI run Biome, the TypeScript compiler and the frontend's tests.

### Frontend

- **Next.js 16** with the App Router, and **React 19**. React 19 is also the one React version that the Preview and exported code use.
- The **React Compiler** is on.
- **shadcn/ui**, on Radix, for components, and **Tailwind CSS 4** for styling.
- **lucide-react** for icons, and **next/font** for Inter and JetBrains Mono.
- **React Flow** for the canvas.
- **Zustand** for the editor's state, and **zundo** for undo and redo.
- **TanStack Query** to load and save data from the backend.
- The API client is **generated** from the backend's OpenAPI description with **@hey-api/openapi-ts**.
- **React Hook Form** and **Zod 4** for forms and validation.
- **dnd-kit** to reorder the rows of a socket group.
- **date-fns** and **@date-fns/tz** for the Date nodes, and `Intl` for number formatting, plurals and relative time.
- **@babel/types** and **@babel/generator** to generate code.
- **Vitest** and **Testing Library** for unit and component tests, and **Playwright** for end-to-end tests of the main flows.

### Backend

- **FastAPI**, with **Pydantic 2** for data and **pydantic-settings** for configuration.
- **SQLAlchemy 2** with typed models, the **psycopg 3** driver, and **Alembic** for migrations.
- A component's graph is stored as one JSONB document. Pydantic checks its structure. What its nodes mean is known only to the frontend.
- Authentication is our own: passwords hashed with **pwdlib** and Argon2, and **sessions stored in PostgreSQL** behind an HttpOnly cookie. Sessions can be revoked, which "signed out from another device" needs. FastAPI Users is not used, since its maintainers plan to replace it.
- Authorization is one module of rules for the team roles (Owner, Member) and the project roles (Lead, Developer), tested on its own.
- **pytest** and **httpx** for tests, against a real PostgreSQL database.
- **tbls** to generate the database documentation and ER diagram from the migrated schema, checked in CI.

### Hosting

- **Vercel** hosts both the frontend and the backend: FastAPI runs as a Vercel Function, on the same domain as the frontend.
- **Neon** hosts PostgreSQL. The backend connects through Neon's connection pooler.
- During development, PostgreSQL runs locally in Docker Compose.

### Design to code

- The design is ported from the HTML screens into Figma with **Figwright**.
- **GitFig** syncs the Figma file's variables and styles to JSON files in this repository.
- A Python script in the repository turns those JSON files into the Tailwind CSS 4 theme, and CI runs it whenever they change. Figma variables are named after shadcn/ui's theme variables, such as `background`, `primary` and `border`.

### Not decided yet

- How the Preview renders a component. That needs its own decision, together with the node framework.
- Viewing and editing code: the Code tab, formatting and syntax highlighting.
- Email, and signing in with Google or GitHub. Neither is in the alpha.
- Error monitoring.

## Consequences

Two languages mean two toolchains. Everyone needs Node.js and pnpm next to uv, so `install.sh` has to install them too.

The technical consequences:

- **Serverless backend**: Vercel Functions start cold, have a time limit per request, and can't run background work. The alpha needs none of that, and if it ever does, FastAPI can move to a container with little change. PostgreSQL connections go through Neon's pooler, which doesn't support prepared statements, so psycopg must not use them.
- **Node logic exists once**: only the frontend can evaluate a graph. If the backend ever has to render a component, for example for share links, it will need to run JavaScript.
- **The API client is generated**: after a backend change, the client must be generated again. CI should fail when it's out of date.
- **Strict typing on both sides**: FastAPI and SQLAlchemy produce `Any` in places, so some backend modules will need their own, relaxed mypy rules, as the README describes.
- **The database documentation needs a database**: tbls reads a migrated PostgreSQL, so CI generates it against the test database, and locally it runs against the one in Docker Compose.
- **The performance target rests on React Flow**: a benchmark with 200 nodes should run early, before the editor is built on top of it.
- **The design pipeline depends on two community tools**, Figwright and GitFig, which have to be checked before they are installed. Figma's API for variables is only available on the Enterprise plan, which is why the script reads the JSON in the repository rather than the Figma file. Without a paid Figma plan, GitFig syncs one mode per collection, which is enough for the dark theme.
