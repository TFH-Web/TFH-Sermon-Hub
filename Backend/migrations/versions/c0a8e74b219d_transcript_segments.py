# Store caption segments for timestamped chunking and retries.
from alembic import op
import sqlalchemy as sa

revision = "c0a8e74b219d"
down_revision = "9ec1bf424e99"
branch_labels = None
depends_on = None


def upgrade():
    """Add nullable timed caption segments without changing existing transcript text."""
    with op.batch_alter_table("sermon") as batch_op:
        batch_op.add_column(sa.Column("transcript_segments", sa.JSON(), nullable=True))


def downgrade():
    """Remove stored caption times; keep transcript text and sermon relationships."""
    with op.batch_alter_table("sermon") as batch_op:
        batch_op.drop_column("transcript_segments")
