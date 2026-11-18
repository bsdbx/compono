"""Allow numbered component names.

Revision ID: 24d2195e22af
Revises: 96c35c0be0fa
"""

# Alembic's operations take arguments typed with Any
# mypy: disallow-any-expr=False

from alembic import op

revision: str = "24d2195e22af"
down_revision: str | None = "96c35c0be0fa"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_components_name_format"), "components", type_="check")
    op.create_check_constraint(
        op.f("ck_components_name_format"),
        "components",
        r"name ~ '^[A-Z][A-Za-z0-9]*(\.[0-9]{3,})?$'",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_components_name_format"), "components", type_="check")
    op.create_check_constraint(
        op.f("ck_components_name_format"),
        "components",
        r"name ~ '^[A-Z][A-Za-z0-9]*$'",
    )
