"""Text that requests send."""

from typing import Annotated, Final

from pydantic import AfterValidator


def refuse_nul(text: str) -> str:
    """Refuses text with a NUL character, which PostgreSQL can neither store nor look up."""
    if "\x00" in text:
        raise ValueError("can't have a NUL character")

    return text


# In the Annotated of every text that reaches the database, so that a NUL answers 422, not 500
NO_NUL: Final = AfterValidator(refuse_nul)

# Text from a URL's path, like a team's URL
type PathText = Annotated[str, NO_NUL]
