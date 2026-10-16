"""add created_by_id to work orders

Revision ID: a3c1f5e2b7d4
Revises: 782e9d96ab14
Create Date: 2026-10-16 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3c1f5e2b7d4'
down_revision = '782e9d96ab14'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('work_orders') as batch_op:
        batch_op.add_column(sa.Column('created_by_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_work_orders_created_by_id_users', 'users', ['created_by_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('work_orders') as batch_op:
        batch_op.drop_constraint('fk_work_orders_created_by_id_users', type_='foreignkey')
        batch_op.drop_column('created_by_id')
