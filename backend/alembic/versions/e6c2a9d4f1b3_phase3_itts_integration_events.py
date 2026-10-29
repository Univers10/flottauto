"""phase3 itts integration events

Revision ID: e6c2a9d4f1b3
Revises: d5b9f3a7c2e8
Create Date: 2026-10-28 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e6c2a9d4f1b3'
down_revision = 'd5b9f3a7c2e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table('integration_events'):
        return  # déjà créée par create_all au démarrage
    op.create_table('integration_events',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('company_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('itts_departure_id', sa.String(length=64), nullable=True),
    sa.Column('itts_bus_id', sa.String(length=64), nullable=True),
    sa.Column('bus_plate', sa.String(length=50), nullable=True),
    sa.Column('payload', sa.Text(), nullable=False),
    sa.Column('occurred_at', sa.DateTime(), nullable=True),
    sa.Column('error', sa.String(length=500), nullable=True),
    sa.Column('received_at', sa.DateTime(), nullable=True),
    sa.Column('processed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_integration_events_company_id'), 'integration_events', ['company_id'], unique=False)
    op.create_index(op.f('ix_integration_events_status'), 'integration_events', ['status'], unique=False)
    op.create_index(op.f('ix_integration_events_itts_departure_id'), 'integration_events', ['itts_departure_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_integration_events_itts_departure_id'), table_name='integration_events')
    op.drop_index(op.f('ix_integration_events_status'), table_name='integration_events')
    op.drop_index(op.f('ix_integration_events_company_id'), table_name='integration_events')
    op.drop_table('integration_events')
