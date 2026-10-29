"""interventions : circuit devis → validation → facture → clôture, lignes, justificatifs

Revision ID: b3c9e7a1d5f2
Revises: a8e5c3f9d2b7
Create Date: 2026-10-29 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3c9e7a1d5f2'
down_revision = 'a8e5c3f9d2b7'
branch_labels = None
depends_on = None


def _enum(*values: str) -> sa.Enum:
    return sa.Enum(*values, native_enum=False, length=32)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Types d'alerte stockés par NOM dans le type natif « alerttype ».
        op.execute("ALTER TYPE alerttype ADD VALUE IF NOT EXISTS 'INVOICE_MISSING'")

    if not sa.inspect(bind).has_table('work_order_lines'):
        op.create_table('work_order_lines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('work_order_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('label', sa.String(length=255), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('unit_price', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('invoice_amount', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['work_order_id'], ['work_orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_work_order_lines_id'), 'work_order_lines', ['id'], unique=False)
        op.create_index(op.f('ix_work_order_lines_work_order_id'), 'work_order_lines', ['work_order_id'], unique=False)

    with op.batch_alter_table('work_order_photos') as batch:
        batch.add_column(sa.Column('kind', _enum('INVOICE', 'NEW_PART', 'OLD_PART', 'APPROVAL_CAPTURE'), nullable=True))

    with op.batch_alter_table('work_orders') as batch:
        batch.add_column(sa.Column('location', sa.String(length=255), nullable=True))
        batch.add_column(sa.Column('garage_phone', sa.String(length=50), nullable=True))
        batch.add_column(sa.Column('reported_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('quote_sent_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('approved_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('approved_by_id', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('approver_name', sa.String(length=150), nullable=True))
        batch.add_column(sa.Column('approval_channel', _enum('IN_APP', 'WHATSAPP'), nullable=True))
        batch.add_column(sa.Column('approved_amount', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('invoice_submitted_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('invoice_total', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('payment_method', _enum('WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'CASH'), nullable=True))
        batch.add_column(sa.Column('payment_reference', sa.String(length=100), nullable=True))
        batch.add_column(sa.Column('closed_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('closed_by_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_work_orders_approved_by_id', 'users', ['approved_by_id'], ['id'])
        batch.create_foreign_key('fk_work_orders_closed_by_id', 'users', ['closed_by_id'], ['id'])

    op.execute("UPDATE work_orders SET reported_at = created_at WHERE reported_at IS NULL")


def downgrade() -> None:
    # La valeur ajoutée à « alerttype » reste (PostgreSQL ne sait pas la retirer sans recréer le type).
    with op.batch_alter_table('work_orders') as batch:
        batch.drop_constraint('fk_work_orders_closed_by_id', type_='foreignkey')
        batch.drop_constraint('fk_work_orders_approved_by_id', type_='foreignkey')
        for col in ('closed_by_id', 'closed_at', 'payment_reference', 'payment_method', 'invoice_total',
                    'invoice_submitted_at', 'approved_amount', 'approval_channel', 'approver_name',
                    'approved_by_id', 'approved_at', 'quote_sent_at', 'reported_at', 'garage_phone', 'location'):
            batch.drop_column(col)
    with op.batch_alter_table('work_order_photos') as batch:
        batch.drop_column('kind')
    op.drop_index(op.f('ix_work_order_lines_work_order_id'), table_name='work_order_lines')
    op.drop_index(op.f('ix_work_order_lines_id'), table_name='work_order_lines')
    op.drop_table('work_order_lines')
