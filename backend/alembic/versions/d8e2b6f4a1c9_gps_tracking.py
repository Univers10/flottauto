"""gps tracking (devices, positions, relay key)

Revision ID: d8e2b6f4a1c9
Revises: c1f5a9e3b7d4
"""
from alembic import op
import sqlalchemy as sa

revision = 'd8e2b6f4a1c9'
down_revision = 'c1f5a9e3b7d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    with op.batch_alter_table('company_settings') as batch:
        batch.add_column(sa.Column('gps_relay_key_hash', sa.String(length=64), nullable=True))
    if 'gps_devices' not in tables:
        op.create_table(
            'gps_devices',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
            sa.Column('vehicle_id', sa.Integer(), sa.ForeignKey('vehicles.id'), nullable=False, unique=True),
            sa.Column('imei', sa.String(length=32), nullable=True, unique=True),
            sa.Column('model', sa.String(length=100), nullable=True),
            sa.Column('key_hash', sa.String(length=64), nullable=False, unique=True),
            sa.Column('active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('last_seen_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_gps_devices_id', 'gps_devices', ['id'])
        op.create_index('ix_gps_devices_company_id', 'gps_devices', ['company_id'])
    if 'gps_positions' not in tables:
        op.create_table(
            'gps_positions',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
            sa.Column('vehicle_id', sa.Integer(), sa.ForeignKey('vehicles.id'), nullable=False),
            sa.Column('device_id', sa.Integer(), sa.ForeignKey('gps_devices.id', ondelete='CASCADE'), nullable=False),
            sa.Column('recorded_at', sa.DateTime(), nullable=False),
            sa.Column('lat', sa.Float(), nullable=False),
            sa.Column('lng', sa.Float(), nullable=False),
            sa.Column('speed_kmh', sa.Float(), nullable=True),
            sa.Column('heading', sa.Integer(), nullable=True),
            sa.Column('odometer_km', sa.Float(), nullable=True),
            sa.Column('ignition', sa.Boolean(), nullable=True),
            sa.Column('fuel_level_pct', sa.Float(), nullable=True),
            sa.Column('fuel_used_l', sa.Float(), nullable=True),
            sa.Column('received_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('device_id', 'recorded_at', name='uq_gps_positions_device_time'),
        )
        op.create_index('ix_gps_positions_vehicle_time', 'gps_positions', ['vehicle_id', 'recorded_at'])


def downgrade() -> None:
    op.drop_table('gps_positions')
    op.drop_table('gps_devices')
    with op.batch_alter_table('company_settings') as batch:
        batch.drop_column('gps_relay_key_hash')
