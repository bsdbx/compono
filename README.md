# Compono

See [PROPOSAL.md](PROPOSAL.md) for what we are building.

## Setup

Run this once after cloning. On Windows, run it in Git Bash, which comes with [Git for Windows](https://gitforwindows.org/).

```sh
./install.sh
```

After that, the Git hooks keep `backend/.venv` and `frontend/node_modules` up to date when you pull. On Windows, also turn on Developer Mode, which the pre-commit hook needs.

Run the backend:

```sh
cd backend
uv run compono
```

Run its tests, while the database runs:

```sh
cd backend
uv run pytest
```

Run the DB with Docker:

```sh
docker compose up -d --wait
```

After a migration, apply it and document the database again into [docs/database](docs/database/README.md).

```sh
cd backend
uv run alembic upgrade head
cd ..
docker compose run --rm tbls
```

Run the frontend with:

```sh
cd frontend
pnpm dev
```

When the API changes, update the small, typed client in `frontend/src/api/client.ts` and its models in `frontend/src/api/types.ts`. There is no client generation step. Check the frontend with:

```sh
cd frontend
pnpm typecheck
pnpm test
pnpm build
```

We suggest using [Visual Studio Code] for development of this project.

## Deployment

[Vercel](https://vercel.com) deploys `main` to production at <https://compono-app.vercel.app>. Frontend at `/`, backend at `/api`. PostgreSQL DB is hosted via [Neon](https://neon.com).

Vercel serves `frontend/dist` as static assets. The frontend service falls back to `index.html` for client routes, including direct links to components; the `/api` rewrite still goes to FastAPI first. `pnpm start` previews a production frontend build locally; `pnpm dev` proxies `/api` to the backend on port 8000.

## Development & Contribution

To see the current development roadmap(or take part in it): [Compono Project](https://github.com/users/bsdbx/projects/2)\
To see the milestones of the project: [Compono Milestones](https://github.com/bsdbx/compono/milestones)

### Tasks

To work with the tasks: `./tasks.sh`. Run `./tasks.sh --help` to see the usage.

> [!WARNING]
> This project is a University project. Any contribution is disallowed for the time being. Contributing will be possible once the initial project is completed

[Visual Studio Code]: https://code.visualstudio.com/
