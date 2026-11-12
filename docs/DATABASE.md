# Database

This page explains why the database looks the way it does. For every table, column and constraint as they are now, see [the generated reference](database/README.md). The tables are defined in [models.py](../backend/src/compono/models.py).

## Tables

| Table | One row is |
| ----- | ---------- |
| `accounts` | An account |
| `sessions` | One signed-in browser of an account |
| `teams` | A team, with its team URL and invite link |
| `team_members` | An account in a team, with its team role |
| `projects` | A team's project |
| `project_members` | A team member in a project, with their project role |
| `components` | A component, with its graph and screen sizes |

## Rules live in the database too

Each constraint is named after its table and its rule, such as `ck_teams_url_not_reserved`. When the database refuses something, the error says which rule it broke, and the API turns that into a message.

Every `id` is a UUIDv7 that PostgreSQL 18 generates with `uuidv7()`.

## Accounts and sessions

- **Name**: not blank.
- **Email** is unique and stored in lowercase, so one address is one account however it's typed. The API lowercases it before saving.
- **Password**: only its Argon2 hash is stored. The hash includes its own salt.
- **Session**: the browser's cookie holds a random token, and the database stores only the token's SHA-256 hash. A leaked copy of the database can't sign anyone in. The hash needs no salt: the token is 128 random bits, so there is nothing to guess or look up, unlike a password.
- **Signing out**, on this browser or another, sets `revoked_at`. A session also stops working at `expires_at`.
- **Deleting an account** deletes its sessions, but the database refuses it while the account is in a team. The account has to leave its teams first, so that a team doesn't silently lose an owner.

## Teams

- **Name**: not blank.
- **Team URL**: 3 to 39 lowercase letters, digits and single hyphens, such as `acme` or `acme-design`, and unique across Compono.
- **Reserved team URLs**: a team URL takes the same place in an address as Compono's own pages, such as `/settings` or `/sign-in`. So the database refuses the words in `RESERVED_TEAM_NAMES`, which also covers pages we may add later.
- **Invite link**: its token is stored as it is, not hashed, because owners see the link again to copy it. It's at least 22 characters, which is 128 random bits, and works for an hour, as `INVITE_LINK_LIFETIME` sets. The alpha has no way to reset it.
- **Team roles**, Owner and Member, are stored as text that a constraint limits to those values, rather than as a PostgreSQL enum type. Adding a role is then an ordinary migration, and undoing that migration leaves nothing behind.

A team always has at least one owner. The API keeps this rule, not the database: a constraint sees one row at a time, while this rule is about all the owners of a team. The API checks it in the same transaction as the change, with the owners' rows locked, so two owners can't both leave at once.

A project needs no such rule. Its team's owners manage it as its leads do, so even a project whose last lead has left the team still has someone to manage it.

## Projects

- **Project URL**: made from the project's name, so that it reads like the name in any alphabet. `Маркетинг сайт 2!` becomes `marketing-sayt-2`. Everything that isn't a letter or digit becomes a hyphen, and it's cut at 60 characters. The API sets it whenever the name changes, with `make_url_from_project_name`.
- **Unique within the team**: since the URL comes from the name, two names that give the same URL can't both be in one team, and the API answers that the name is taken. A name also needs at least one letter or digit, or there is no URL.
- **Reserved project URLs**: `members`, `new` and `settings`, the team's own pages that sit where a project URL would.
- **Name**: not blank, at most 100 characters, without control characters such as line breaks. **Description**: at most 500 characters.
- **`edited_at`**: the API moves it on every change inside the project, such as a saved component, to sort projects by when they were last worked on.

## Project members

A project member must be in the project's team. Two foreign keys make sure of it:

- `(project_id, team_id)` points at `projects(id, team_id)`, so `team_id` is the project's team.
- `(team_id, account_id)` points at `team_members`, so the account is in that team.

So `project_members` stores `team_id` even though the project already knows it. Leaving a team takes the account out of all the team's projects, and deleting a project takes everyone out of it.

## Components

- **Name**: a capital letter, then letters and digits, such as `PricingCard`, at most 64 characters. It becomes the component's name in the exported code, where React treats a lowercase name as an HTML tag.
- **Unique within the project, ignoring case**: `Button` and `button` would export to `Button.jsx` and `button.jsx`, which are the same file on Windows and macOS.
- **Graph**: one JSONB document, which must be an object. Vercel limits a request to 4.5 MB, so the API limits a graph to 1 MB. It also refuses what JSONB can't store: a NUL character, NaN and Infinity. [ADR 0003](adr/0003-nodes-and-preview.md) sets the graph's structure, and the API will check it with Pydantic, as [ADR 0002](adr/0002-stack.md) decides.
- **Screen sizes**: a JSONB list that is never empty. A new component starts with Desktop 1280, Tablet 768 and Mobile 390. The API allows up to 10, each with its own name and a width from 200 to 3840 pixels.
- **Version**: starts at 1 and goes up by one with every save, so that saving never overwrites someone else's work. A save sends the version it started from and only succeeds if that's still the current one. Otherwise someone else saved first, and the API answers with a conflict.

## Changing the database

1. Change the models in `models.py`.
2. Generate a migration with `uv run alembic revision --autogenerate -m "Summary"` in `backend/`, and read what it generated.
3. Write by hand what autogenerate can't see: a changed condition of an existing constraint, such as a reserved word, a role or a length. In the migration, drop the constraint and create it again. The backend's tests fail until the migration matches the models.
4. Apply it with `uv run alembic upgrade head`, run the tests, and document the database again with `docker compose run --rm tbls`. CI checks that the docs match.

Never edit a migration that is already pushed: the preview deployment has already applied it to the preview database. Change the database with a new migration instead.
