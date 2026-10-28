"""phase2 departures and exit passes

Revision ID: d5b9f3a7c2e8
Revises: c4a8e1f2d9b6
Create Date: 2026-10-28 09:10:55.983572

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd5b9f3a7c2e8'
down_revision = 'c4a8e1f2d9b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # Types d'alerte stockés par NOM dans le type natif « alerttype ».
        for value in ("DEPARTURE_BLOCKED", "DEPARTURE_WARNING"):
            op.execute(f"ALTER TYPE alerttype ADD VALUE IF NOT EXISTS '{value}'")
    if sa.inspect(op.get_bind()).has_table('departures'):
        return  # déjà créée par create_all au démarrage
    op.create_table('departures',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('company_id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('station_id', sa.Integer(), nullable=True),
    sa.Column('route_label', sa.String(length=255), nullable=True),
    sa.Column('scheduled_at', sa.DateTime(), nullable=False),
    sa.Column('distance_km', sa.Integer(), nullable=True),
    sa.Column('driver_id', sa.Integer(), nullable=True),
    sa.Column('conveyor_id', sa.Integer(), nullable=True),
    sa.Column('inspection_id', sa.Integer(), nullable=True),
    sa.Column('itts_departure_id', sa.String(length=64), nullable=True),
    sa.Column('status', sa.Enum('PLANNED', 'AUTHORIZED', 'DEPARTED', 'CANCELLED', name='departurestatus', native_enum=False, length=32), nullable=False),
    sa.Column('exit_pass_number', sa.String(length=64), nullable=True),
    sa.Column('exit_pass_issued_at', sa.DateTime(), nullable=True),
    sa.Column('exit_pass_valid_until', sa.DateTime(), nullable=True),
    sa.Column('exit_pass_issued_by_id', sa.Integer(), nullable=True),
    sa.Column('exit_pass_status', sa.String(length=16), nullable=True),
    sa.Column('departed_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.ForeignKeyConstraint(['conveyor_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['exit_pass_issued_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('company_id', 'exit_pass_number', name='uq_departures_company_exit_pass'),
    sa.UniqueConstraint('company_id', 'itts_departure_id', name='uq_departures_company_itts')
    )
    op.create_index(op.f('ix_departures_company_id'), 'departures', ['company_id'], unique=False)
    op.create_index(op.f('ix_departures_id'), 'departures', ['id'], unique=False)
    op.create_index(op.f('ix_departures_scheduled_at'), 'departures', ['scheduled_at'], unique=False)
    op.create_index(op.f('ix_departures_vehicle_id'), 'departures', ['vehicle_id'], unique=False)


def downgrade() -> None:
    # Les valeurs ajoutées à « alerttype » restent (PostgreSQL ne sait pas les retirer sans recréer le type).
    op.drop_index(op.f('ix_departures_vehicle_id'), table_name='departures')
    op.drop_index(op.f('ix_departures_scheduled_at'), table_name='departures')
    op.drop_index(op.f('ix_departures_id'), table_name='departures')
    op.drop_index(op.f('ix_departures_company_id'), table_name='departures')
    op.drop_table('departures')
