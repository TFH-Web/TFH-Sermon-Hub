"""Merge summary origin and dev migration histories.

Revision ID: c6f028a7d913
Revises: 071280c204c4, 958b50d14869
"""

revision = "c6f028a7d913"
down_revision = ("071280c204c4", "958b50d14869")
branch_labels = None
depends_on = None


def upgrade():
    # Both parent migrations own their schema changes.
    pass


def downgrade():
    pass
