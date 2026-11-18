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

- **React 19**, built as static files with **Vite**. React 19 is also the one React version that the Preview and exported code use. **React Router** handles browser navigation.
- Existing local components use **Radix** for accessible dialogs, menus and toasts, and **Tailwind CSS 4** for styling. Button variants are plain class maps; the small `cn` utility merges Tailwind overrides.
- **lucide-react** for icons. The exact Inter and JetBrains Mono font files are served locally, with no build-time font downloads.
- **React Flow** for the canvas.
- React state and the existing local draft/history modules for editor state, autosave, undo and redo.
- **TanStack Query** to load and save data from the backend.
- A small typed client uses the browser's **fetch** API. Models and query helpers are ordinary checked TypeScript; there is no SDK generator, generated OpenAPI snapshot or runtime schema library.
- React state and plain validation functions for forms. The API remains authoritative for validation.
- Existing browser and React controls for socket rows; native `Intl` for formatting.
- Graph evaluation and JSX generation stay in the existing FastAPI endpoints.
- **Vitest** and **Testing Library** for fast unit and component tests.

On 18.11.2026, the frontend stack was simplified at the product owner's request. The existing UI, behavior and API contracts remain the reference. React Flow, Radix, TanStack Query and Lucide were explicitly retained because replacing their canvas, accessibility, cache and icon behavior with custom implementations would add maintenance and regression risk. Next.js, React Compiler, React Hook Form, Zod, the shadcn CLI and API code generation were removed. Small local CSS rules preserve the existing transitions.

### Backend

- **FastAPI**, with **Pydantic 2** for data and **pydantic-settings** for configuration.
- **SQLAlchemy 2** with typed models, the **psycopg 3** driver, and **Alembic** for migrations.
- A component's graph is stored as one JSONB document. Pydantic checks its structure. The existing Python node definitions evaluate graphs and generate JSX; the frontend draws and edits them.
- Authentication is our own: passwords hashed with **pwdlib** and Argon2, and **sessions stored in PostgreSQL** behind an HttpOnly cookie. Sessions can be revoked, which "signed out from another device" needs. FastAPI Users is not used, since its maintainers plan to replace it.
- Authorization is one module of rules for the team roles (Owner, Member) and the project roles (Lead, Developer), tested on its own.
- **pytest** and **httpx** for tests, against a real PostgreSQL database.
- **tbls** to generate the database documentation and ER diagram from the migrated schema, checked in CI.

### Hosting

- **Vercel** hosts both the frontend and the backend: FastAPI runs as a Vercel Function, on the same domain as the frontend.
- **Neon** hosts PostgreSQL. The backend connects through Neon's connection pooler.
- During development, PostgreSQL runs locally in Docker Compose.

### Design to code

- The screens in `.hidden/compono-alpha-screens-v2.zip` are the visual reference.
- The local components and `frontend/src/app/globals.css` hold the markup and design tokens directly. No design synchronization tools or generated theme are required.

### Not decided yet

- Further Preview and node-framework decisions are recorded in `0003-nodes-and-preview.md`.
- Code formatting and syntax highlighting.
- Email, and signing in with Google or GitHub. Neither is in the alpha.
- Error monitoring.

## Consequences

Two languages mean two toolchains. Everyone needs Node.js and pnpm next to uv, so `install.sh` has to install them too.

The technical consequences:

- **Serverless backend**: Vercel Functions start cold, have a time limit per request, and can't run background work. The alpha needs none of that, and if it ever does, FastAPI can move to a container with little change. PostgreSQL connections go through Neon's pooler, which doesn't support prepared statements, so psycopg must not use them.
- **Node logic exists once**: the existing FastAPI endpoints describe node types, evaluate graphs and generate JSX. The frontend calls those endpoints for the canvas, Preview and Code tab.
- **The API client is maintained with the backend**: endpoint or model changes update its TypeScript declarations and relevant behavior tests. CI checks types, tests and the static production build.
- **Strict typing on both sides**: FastAPI and SQLAlchemy produce `Any` in places, so some backend modules will need their own, relaxed mypy rules, as the README describes.
- **The database documentation needs a database**: tbls reads a migrated PostgreSQL, so CI generates it against the test database, and locally it runs against the one in Docker Compose.
- **Static hosting needs an index fallback**: Vercel routes `/api` to the backend first and lets the frontend service serve `index.html` for browser routes. The frontend needs no Node.js server in production.
