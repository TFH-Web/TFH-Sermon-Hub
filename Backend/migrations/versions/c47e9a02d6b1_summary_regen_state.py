"""Summary regeneration state on sermons

Revision ID: c47e9a02d6b1
Revises: a3d91c7e5b20
Create Date: 2026-10-21 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c47e9a02d6b1'
down_revision = 'a3d91c7e5b20'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sermon', schema=None) as batch_op:
        batch_op.add_column(sa.Column('summary_regen_state', sa.Enum('IDLE', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', name='summaryregenstate', create_constraint=True), server_default='IDLE', nullable=False))
        batch_op.add_column(sa.Column('summary_regen_error', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('summary_regen_run_id', sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column('summary_regen_requested_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('summary_regen_started_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('summary_regen_finished_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('sermon', schema=None) as batch_op:
        batch_op.drop_constraint('summaryregenstate', type_='check')
        batch_op.drop_column('summary_regen_finished_at')
        batch_op.drop_column('summary_regen_started_at')
        batch_op.drop_column('summary_regen_requested_at')
        batch_op.drop_column('summary_regen_run_id')
        batch_op.drop_column('summary_regen_error')
        batch_op.drop_column('summary_regen_state')