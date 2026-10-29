"""convois : fiche, tronçons, paiements, réglages du contrat

Revision ID: a8e5c3f9d2b7
Revises: f7d4b8e2a6c1
Create Date: 2026-10-29 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a8e5c3f9d2b7'
down_revision = 'f7d4b8e2a6c1'
branch_labels = None
depends_on = None


def _enum(*values: str) -> sa.Enum:
    return sa.Enum(*values, native_enum=False, length=32)


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _columns(table: str) -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_table('convoys'):
        op.create_table(
            'convoys',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
            sa.Column('number', sa.String(length=64), nullable=False),
            sa.Column('status', _enum('DRAFT', 'CONFIRMED', 'DONE', 'CANCELLED'), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('purpose', _enum('PILGRIMAGE', 'FUNERAL', 'WEDDING', 'TOURISM', 'CORPORATE', 'SPORT', 'OTHER'), nullable=False),
            sa.Column('client_name', sa.String(length=255), nullable=True),
            sa.Column('client_phone', sa.String(length=50), nullable=True),
            sa.Column('broker_name', sa.String(length=255), nullable=True),
            sa.Column('broker_phone', sa.String(length=50), nullable=True),
            sa.Column('commission_pct', sa.Numeric(5, 2), nullable=True),
            sa.Column('departure_at', sa.DateTime(), nullable=True),
            sa.Column('return_date', sa.Date(), nullable=True),
            sa.Column('meeting_point', sa.String(length=255), nullable=True),
            sa.Column('station_id', sa.Integer(), sa.ForeignKey('stations.id'), nullable=True),
            sa.Column('seats_sold', sa.Integer(), nullable=False),
            sa.Column('seats_boarded', sa.Integer(), nullable=True),
            sa.Column('billed_days', sa.Integer(), nullable=False),
            sa.Column('daily_rate', sa.Integer(), nullable=True),
            sa.Column('tolls_estimate', sa.Integer(), nullable=False),
            sa.Column('vehicle_id', sa.Integer(), sa.ForeignKey('vehicles.id'), nullable=True),
            sa.Column('backup_vehicle_id', sa.Integer(), sa.ForeignKey('vehicles.id'), nullable=True),
            sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
            sa.Column('relief_driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
            sa.Column('conveyor_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('contract_generated_at', sa.DateTime(), nullable=True),
            sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'number', name='uq_convoys_company_number'),
        )
        op.create_index(op.f('ix_convoys_id'), 'convoys', ['id'], unique=False)
        op.create_index(op.f('ix_convoys_company_id'), 'convoys', ['company_id'], unique=False)
    if not _has_table('convoy_segments'):
        op.create_table(
            'convoy_segments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('convoy_id', sa.Integer(), sa.ForeignKey('convoys.id', ondelete='CASCADE'), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False),
            sa.Column('from_label', sa.String(length=120), nullable=False),
            sa.Column('to_label', sa.String(length=120), nullable=False),
            sa.Column('km', sa.Integer(), nullable=False),
            sa.Column('price_per_seat', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_convoy_segments_id'), 'convoy_segments', ['id'], unique=False)
        op.create_index(op.f('ix_convoy_segments_convoy_id'), 'convoy_segments', ['convoy_id'], unique=False)
    if not _has_table('convoy_payments'):
        op.create_table(
            'convoy_payments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('convoy_id', sa.Integer(), sa.ForeignKey('convoys.id', ondelete='CASCADE'), nullable=False),
            sa.Column('amount', sa.Integer(), nullable=False),
            sa.Column('method', _enum('WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'CASH'), nullable=False),
            sa.Column('reference', sa.String(length=100), nullable=True),
            sa.Column('paid_at', sa.DateTime(), nullable=True),
            sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_convoy_payments_id'), 'convoy_payments', ['id'], unique=False)
        op.create_index(op.f('ix_convoy_payments_convoy_id'), 'convoy_payments', ['convoy_id'], unique=False)

    if 'convoy_id' not in _columns('departures'):
        with op.batch_alter_table('departures') as batch:
            batch.add_column(sa.Column('convoy_id', sa.Integer(), nullable=True))
            batch.create_foreign_key('fk_departures_convoy_id', 'convoys', ['convoy_id'], ['id'])
        op.create_index(op.f('ix_departures_convoy_id'), 'departures', ['convoy_id'], unique=False)

    settings = _columns('company_settings')
    new_settings = [
        sa.Column('convoy_consumption_l_100km', sa.Integer(), nullable=False, server_default='33'),
        sa.Column('convoy_number_prefix', sa.String(length=20), nullable=False, server_default='CV'),
        sa.Column('legal_name', sa.String(length=255), nullable=True),
        sa.Column('legal_details', sa.Text(), nullable=True),
        sa.Column('legal_representative', sa.String(length=255), nullable=True),
        sa.Column('contract_city', sa.String(length=100), nullable=True),
        sa.Column('hotline', sa.String(length=50), nullable=True),
    ]
    for column in new_settings:
        if column.name not in settings:
            op.add_column('company_settings', column)


def downgrade() -> None:
    for name in ('hotline', 'contract_city', 'legal_representative', 'legal_details', 'legal_name',
                 'convoy_number_prefix', 'convoy_consumption_l_100km'):
        op.drop_column('company_settings', name)
    op.drop_index(op.f('ix_departures_convoy_id'), table_name='departures')
    with op.batch_alter_table('departures') as batch:
        batch.drop_constraint('fk_departures_convoy_id', type_='foreignkey')
        batch.drop_column('convoy_id')
    op.drop_table('convoy_payments')
    op.drop_table('convoy_segments')
    op.drop_table('convoys')
