"""Make chunk hashes unique per sermon instead of across all sermons.

Revision ID: 6e74e4e52cc6
Revises: 743449edae09
Create Date: 2026-10-11 23:15:31.169994

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '6e74e4e52cc6'
down_revision = '743449edae09'
branch_labels = None
depends_on = None

# Two sermons can share identical chunk text. With a global unique hash the second
# sermon's insert hit the conflict and silently got no chunk.


def upgrade():
    with op.batch_alter_table('sermon_chunk') as batch_op:
        batch_op.drop_constraint('unique_chunk_hash', type_='unique')
        batch_op.create_unique_constraint(
            'unique_sermon_chunk_hash', ['sermon_id', 'hash']
        )


def downgrade():
    # This fails if two sermons already share a chunk hash, since the old constraint forbids that.
    with op.batch_alter_table('sermon_chunk') as batch_op:
        batch_op.drop_constraint('unique_sermon_chunk_hash', type_='unique')
        batch_op.create_unique_constraint('unique_chunk_hash', ['hash'])
