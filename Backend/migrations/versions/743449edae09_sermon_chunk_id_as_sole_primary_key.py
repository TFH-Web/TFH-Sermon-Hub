"""sermon chunk id as sole primary key

Revision ID: 743449edae09
Revises: 029a9b496183
Create Date: 2026-10-11 17:54:16.110461

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '743449edae09'
down_revision = '029a9b496183'
branch_labels = None
depends_on = None

# SQLite only assigns an id on insert when id alone is an INTEGER primary key.
# The old (id, sermon_id) key left id NOT NULL with nothing to fill it, so every chunk insert failed.


def sermon_chunk(*primary_key: str) -> sa.Table:
    """Return the full sermon_chunk table keyed on the given columns.

    Batch mode rebuilds the table from this instead of reflecting it, because a reflected
    primary key column cannot be turned back into a plain column.
    sermon_id stays a foreign key to sermon with ON DELETE CASCADE either way.
    """
    return sa.Table(
        'sermon_chunk',
        sa.MetaData(),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('start', sa.Float(), nullable=False),
        sa.Column('end', sa.Float(), nullable=False),
        sa.Column('sermon_id', sa.Integer(), nullable=False),
        sa.Column('hash', sa.CHAR(length=32), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('stale', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint(*primary_key, name='pk_sermon_chunk'),
        sa.UniqueConstraint('hash', name='unique_chunk_hash'),
        sa.ForeignKeyConstraint(
            ['sermon_id'], ['sermon.id'], onupdate='CASCADE', ondelete='CASCADE'
        ),
    )


def upgrade():
    with op.batch_alter_table(
        'sermon_chunk', recreate='always', copy_from=sermon_chunk('id')
    ):
        pass


def downgrade():
    with op.batch_alter_table(
        'sermon_chunk', recreate='always', copy_from=sermon_chunk('id', 'sermon_id')
    ):
        pass
