"""add work order photos

Revision ID: d2ffc09051da
Revises: 70667d3763be
Create Date: 2026-08-05 07:54:35.203816

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd2ffc09051da'
down_revision = '70667d3763be'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_order_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("file_url", sa.String(length=500), nullable=False),
        sa.Column("caption", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_work_order_photos_id", "work_order_photos", ["id"], unique=False)


def downgrade() -> None:
    op.drop_table("work_order_photos")
