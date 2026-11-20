"""user extra roles (several roles per user)

Revision ID: c1f5a9e3b7d4
Revises: b3c9e7a1d5f2
"""
from alembic import op
import sqlalchemy as sa

revision = 'c1f5a9e3b7d4'
down_revision = 'b3c9e7a1d5f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('extra_roles', sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.drop_column('extra_roles')
