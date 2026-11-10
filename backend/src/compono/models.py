"""Database tables"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, MappedAsDataclass

metadata = MetaData(
    naming_convention={
        "pk": "pk_%(table_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "ix": "ix_%(column_0_label)s",
    }
)


class Base(MappedAsDataclass, DeclarativeBase):
    """The base of every table. Tables are dataclasses, for mypy integrity"""

    metadata = metadata
