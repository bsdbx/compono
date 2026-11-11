"""Database tables."""

import re
import secrets
import unicodedata
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Final
from uuid import UUID

from anyascii import anyascii
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    MetaData,
    String,
    UniqueConstraint,
    column,
    func,
    text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, MappedAsDataclass, mapped_column

# Reserved team names, likely not all are used, this just includes generic ones, which should not be used as team names
RESERVED_TEAM_NAMES: Final[tuple[str, ...]] = (
    "about",
    "account",
    "admin",
    "api",
    "app",
    "assets",
    "auth",
    "blog",
    "contact",
    "dashboard",
    "docs",
    "help",
    "home",
    "invite",
    "join",
    "legal",
    "library",
    "login",
    "logout",
    "new",
    "pricing",
    "privacy",
    "projects",
    "security",
    "settings",
    "share",
    "sign-in",
    "sign-out",
    "sign-up",
    "signin",
    "signout",
    "signup",
    "static",
    "status",
    "support",
    "team",
    "teams",
    "terms",
    "www",
)

# TEAM_URLS + reserved PROJECT_URlS
RESERVED_PROJECT_URLS: Final[tuple[str, ...]] = (
    "members",
    "new",
    "settings",
)


PROJECT_URL_MAX_LENGTH: Final = 60

COMPONENT_NAME_MAX_LENGTH: Final = 64

# An invite link is valid for an hour, a reset is not implemented in alpha
INVITE_LINK_LIFETIME = timedelta(hours=1)


class TeamRole(StrEnum):
    """What an account can do in a team."""

    OWNER = "OWNER"
    MEMBER = "MEMBER"


class ProjectRole(StrEnum):
    """What an account can do in a project."""

    LEAD = "LEAD"
    DEVELOPER = "DEVELOPER"


metadata = MetaData(
    naming_convention={
        "pk": "pk_%(table_name)s",
        "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_N_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    }
)


class Base(MappedAsDataclass, DeclarativeBase):
    """The base of every table. Tables are dataclasses, for mypy integrity"""

    metadata = metadata


def new_invite_token() -> str:
    """An invite link token."""
    return secrets.token_urlsafe(16)


def invite_link_expiry() -> datetime:
    """An invite link token expiry."""
    return datetime.now(UTC) + INVITE_LINK_LIFETIME


def make_url_from_project_name(project_name: str) -> str:
    """A url from a project name (e.g. Маркетинг сайт 2! -> marketing-sayt-2)"""
    letters_and_digits = "".join(
        char if unicodedata.category(char)[0] in "LMN" else " " for char in project_name
    )
    ascii_name = anyascii(letters_and_digits).lower()
    url = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return url[:PROJECT_URL_MAX_LENGTH].rstrip("-")


def default_screen_sizes() -> list[dict[str, object]]:
    """The screen sizes a new component starts with."""
    return [
        {"name": "Desktop", "width": 1280},
        {"name": "Tablet", "width": 768},
        {"name": "Mobile", "width": 390},
    ]


class Account(Base):
    """A user identity, identified by email."""

    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("btrim(name) <> ''", name="name_not_blank"),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        server_default=text("uuidv7()"),
        init=False,
    )

    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    password_hash: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )


class Session(Base):
    """One signed-in browser of an account."""

    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("octet_length(token_hash) = 32", name="token_hash_sha256"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        server_default=text("uuidv7()"),
        init=False,
    )

    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"),
        index=True,
    )

    token_hash: Mapped[bytes] = mapped_column(unique=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
    )


class Team(Base):
    """A team of users."""

    __tablename__ = "teams"
    __table_args__ = (
        CheckConstraint("btrim(name) <> ''", name="name_not_blank"),
        CheckConstraint("url ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="url_format"),
        CheckConstraint("char_length(url) BETWEEN 3 AND 39", name="url_length"),
        CheckConstraint(
            column("url", String).not_in(RESERVED_TEAM_NAMES),
            name="url_not_reserved",
        ),
        CheckConstraint("char_length(invite_token) >= 22", name="invite_token_length"),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        server_default=text("uuidv7()"),
        init=False,
    )

    name: Mapped[str]
    # No need to store the full URL + domain is not stable
    url: Mapped[str] = mapped_column(unique=True)

    invite_token: Mapped[str] = mapped_column(
        unique=True,
        default_factory=new_invite_token,
        init=False,
    )

    invite_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default_factory=invite_link_expiry,
        init=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )


class TeamMember(Base):
    """Member of the team."""

    __tablename__ = "team_members"

    team_id: Mapped[UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )

    role: Mapped[TeamRole] = mapped_column(
        SQLEnum(
            TeamRole,
            name="role",
            native_enum=False,
            create_constraint=True,
            length=20,
        )
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )


class Project(Base):
    """A set of components that some of a team's members build."""

    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("team_id", "url"),
        # Lets project members point at a project together with its team
        UniqueConstraint("id", "team_id"),
        CheckConstraint("btrim(name) <> ''", name="name_not_blank"),
        CheckConstraint("name !~ '[[:cntrl:]]'", name="name_no_control_characters"),
        CheckConstraint("char_length(name) <= 100", name="name_length"),
        CheckConstraint("char_length(description) <= 500", name="description_length"),
        CheckConstraint("url ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="url_format"),
        CheckConstraint(
            f"char_length(url) <= {PROJECT_URL_MAX_LENGTH}", name="url_length"
        ),
        CheckConstraint(
            column("url", String).not_in(RESERVED_PROJECT_URLS),
            name="url_not_reserved",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        server_default=text("uuidv7()"),
        init=False,
    )

    team_id: Mapped[UUID] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    name: Mapped[str]

    # Always `make_url_from_project_name(name)`, set by API
    url: Mapped[str]

    description: Mapped[str] = mapped_column(default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )

    # Moved by the API on every change inside the project
    edited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )


class ProjectMember(Base):
    """An account's membership of a project."""

    __tablename__ = "project_members"
    __table_args__ = (
        # `team_id` must be the project's own team
        ForeignKeyConstraint(
            ["project_id", "team_id"],
            ["projects.id", "projects.team_id"],
            ondelete="CASCADE",
        ),
        # The account must be a member of that team
        ForeignKeyConstraint(
            ["team_id", "account_id"],
            ["team_members.team_id", "team_members.account_id"],
            ondelete="CASCADE",
        ),
        # Someone's projects in a team, and the cascade when they leave the team
        Index(None, "team_id", "account_id"),
    )

    project_id: Mapped[UUID] = mapped_column(primary_key=True)
    account_id: Mapped[UUID] = mapped_column(primary_key=True)
    team_id: Mapped[UUID]

    role: Mapped[ProjectRole] = mapped_column(
        SQLEnum(
            ProjectRole,
            name="role",
            native_enum=False,
            create_constraint=True,
            length=20,
        )
    )

    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )


class Component(Base):
    """A reusable piece of interface, built from a graph, that renders as a React component."""

    __tablename__ = "components"
    __table_args__ = (
        Index(
            "uq_components_project_id_name",
            "project_id",
            text("lower(name)"),
            unique=True,
        ),
        CheckConstraint("name ~ '^[A-Z][A-Za-z0-9]*$'", name="name_format"),
        CheckConstraint(
            f"char_length(name) <= {COMPONENT_NAME_MAX_LENGTH}", name="name_length"
        ),
        CheckConstraint("jsonb_typeof(graph) = 'object'", name="graph_object"),
        CheckConstraint(
            "jsonb_typeof(screen_sizes) = 'array' AND screen_sizes <> '[]'",
            name="screen_sizes_not_empty",
        ),
        CheckConstraint("version >= 1", name="version_positive"),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        server_default=text("uuidv7()"),
        init=False,
    )

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE")
    )
    name: Mapped[str]

    graph: Mapped[dict[str, object]] = mapped_column(JSONB)
    screen_sizes: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB,
        default_factory=default_screen_sizes,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        init=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        init=False,
    )

    version: Mapped[int] = mapped_column(default=1, init=False)
