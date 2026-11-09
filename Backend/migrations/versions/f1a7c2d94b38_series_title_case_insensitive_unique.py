"""Make series titles unique regardless of capitalization.

The unique constraint on series.title is case-sensitive, so two simultaneous
requests creating "Grace" and "grace" could both pass the app-level check and
both be saved. This index lets the database reject the second one.

Revision ID: f1a7c2d94b38
Revises: e602c47a1025
"""
import sqlalchemy as sa
from alembic import op

revision = "f1a7c2d94b38"
down_revision = "e602c47a1025"
branch_labels = None
depends_on = None


def upgrade():
    # The index cannot be built over existing case-variant duplicates, so name them instead of failing obscurely.
    duplicates = op.get_bind().execute(
        sa.text(
            "SELECT lower(title) FROM series GROUP BY lower(title) HAVING count(*) > 1"
        )
    ).scalars().all()
    if duplicates:
        raise RuntimeError(
            "Cannot make series titles case-insensitively unique. Merge these duplicate series first: "
            + ", ".join(sorted(duplicates))
        )

    op.create_index(
        "uq_series_title_lower", "series", [sa.text("lower(title)")], unique=True
    )


def downgrade():
    op.drop_index("uq_series_title_lower", table_name="series")
