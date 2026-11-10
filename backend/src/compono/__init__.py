"""Compono's backend."""


def main() -> None:
    """Runs the API."""

    import uvicorn

    uvicorn.run("compono.app:app", port=8000, reload=True, reload_dirs=["src"])
