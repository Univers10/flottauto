"""add driver_id to vehicles

Revision ID: 70667d3763be
Revises: 
Create Date: 2026-08-05 04:20:30.668658

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '70667d3763be'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("driver_id", sa.Integer(), sa.ForeignKey("drivers.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicles", "driver_id")
