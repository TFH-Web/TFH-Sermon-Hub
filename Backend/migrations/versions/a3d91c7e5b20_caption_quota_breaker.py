"""Shared YouTube caption quota breaker migration

Revision ID: a3d91c7e5b20
Revises: 6e74e4e52cc6
Create Date: 2026-10-19 16:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a3d91c7e5b20"
down_revision = "6e74e4e52cc6"
branch_labels = None
depends_on = None


def upgrade():
    # Single row table created, starts empty
    op.create_table(
        'caption_quota',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('blocked_until', sa.DateTime(), nullable=True),
        sa.Column('opened_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade():
    # Drops the breaker, transcripts are not touched
    op.drop_table('caption_quota')