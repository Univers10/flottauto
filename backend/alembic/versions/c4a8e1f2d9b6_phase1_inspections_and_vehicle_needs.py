"""phase1 inspections and vehicle needs

Revision ID: c4a8e1f2d9b6
Revises: b7e2d4c91f30
Create Date: 2026-10-28 08:27:38.234700

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4a8e1f2d9b6'
down_revision = 'b7e2d4c91f30'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('inspections',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('company_id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('station_id', sa.Integer(), nullable=True),
    sa.Column('kind', sa.Enum('DEPARTURE', 'ARRIVAL', name='inspectionkind', native_enum=False, length=32), nullable=False),
    sa.Column('status', sa.Enum('DRAFT', 'VALIDATED', name='inspectionstatus', native_enum=False, length=32), nullable=False),
    sa.Column('number', sa.String(length=64), nullable=False),
    sa.Column('route_label', sa.String(length=255), nullable=True),
    sa.Column('scheduled_departure_at', sa.DateTime(), nullable=True),
    sa.Column('driver_id', sa.Integer(), nullable=True),
    sa.Column('conveyor_id', sa.Integer(), nullable=True),
    sa.Column('mileage', sa.Integer(), nullable=True),
    sa.Column('fuel_level', sa.Enum('EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL', name='fuellevel', native_enum=False, length=32), nullable=True),
    sa.Column('fuel_liters', sa.Integer(), nullable=True),
    sa.Column('observations', sa.Text(), nullable=True),
    sa.Column('departure_inspection_id', sa.Integer(), nullable=True),
    sa.Column('arrived_at', sa.DateTime(), nullable=True),
    sa.Column('validated_at', sa.DateTime(), nullable=True),
    sa.Column('score', sa.Integer(), nullable=True),
    sa.Column('verdict', sa.String(length=32), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.ForeignKeyConstraint(['conveyor_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['departure_inspection_id'], ['inspections.id'], ),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('company_id', 'number', name='uq_inspections_company_number')
    )
    op.create_index(op.f('ix_inspections_company_id'), 'inspections', ['company_id'], unique=False)
    op.create_index(op.f('ix_inspections_id'), 'inspections', ['id'], unique=False)
    op.create_index(op.f('ix_inspections_vehicle_id'), 'inspections', ['vehicle_id'], unique=False)
    op.create_table('inspection_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('inspection_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('section', sa.String(length=32), nullable=False),
    sa.Column('code', sa.String(length=64), nullable=False),
    sa.Column('label', sa.String(length=255), nullable=False),
    sa.Column('status', sa.Enum('OK', 'RESERVE', 'KO', 'NA', name='itemstatus', native_enum=False, length=32), nullable=True),
    sa.Column('note', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inspection_items_inspection_id'), 'inspection_items', ['inspection_id'], unique=False)
    op.create_table('inspection_photos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('inspection_id', sa.Integer(), nullable=False),
    sa.Column('slot', sa.String(length=32), nullable=False),
    sa.Column('file_key', sa.String(length=500), nullable=False),
    sa.Column('captured_at', sa.DateTime(), nullable=True),
    sa.Column('is_fresh', sa.Boolean(), nullable=False),
    sa.Column('damage', sa.Boolean(), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inspection_photos_inspection_id'), 'inspection_photos', ['inspection_id'], unique=False)
    op.create_table('inspection_signatures',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('inspection_id', sa.Integer(), nullable=False),
    sa.Column('role', sa.Enum('STATION_MANAGER', 'DRIVER', 'CONVEYOR', name='signaturerole', native_enum=False, length=32), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('driver_id', sa.Integer(), nullable=True),
    sa.Column('signer_name', sa.String(length=255), nullable=False),
    sa.Column('collected_by_id', sa.Integer(), nullable=False),
    sa.Column('signed_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['collected_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inspection_signatures_inspection_id'), 'inspection_signatures', ['inspection_id'], unique=False)
    op.create_table('pin_attempts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('company_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('driver_id', sa.Integer(), nullable=False),
    sa.Column('inspection_id', sa.Integer(), nullable=True),
    sa.Column('success', sa.Boolean(), nullable=False),
    sa.Column('ip', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pin_attempts_company_id'), 'pin_attempts', ['company_id'], unique=False)
    op.create_index(op.f('ix_pin_attempts_created_at'), 'pin_attempts', ['created_at'], unique=False)
    op.create_index(op.f('ix_pin_attempts_user_id'), 'pin_attempts', ['user_id'], unique=False)
    op.create_table('vehicle_needs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('company_id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('details', sa.Text(), nullable=True),
    sa.Column('priority', sa.Enum('BEFORE_DEPARTURE', 'THIS_WEEK', 'TO_QUOTE', name='needpriority', native_enum=False, length=32), nullable=False),
    sa.Column('origin', sa.Enum('DEPARTURE_INSPECTION', 'ARRIVAL_INSPECTION', 'ODOMETER', 'DOCUMENT', 'MANUAL', name='needorigin', native_enum=False, length=32), nullable=False),
    sa.Column('origin_label', sa.String(length=255), nullable=True),
    sa.Column('inspection_id', sa.Integer(), nullable=True),
    sa.Column('estimated_cost', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('OPEN', 'VALIDATION_REQUESTED', 'VALIDATED', 'SCHEDULED', 'DONE', 'CANCELLED', name='needstatus', native_enum=False, length=32), nullable=False),
    sa.Column('status_note', sa.String(length=255), nullable=True),
    sa.Column('work_order_id', sa.Integer(), nullable=True),
    sa.Column('validated_by_id', sa.Integer(), nullable=True),
    sa.Column('validated_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspections.id'], ),
    sa.ForeignKeyConstraint(['validated_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.ForeignKeyConstraint(['work_order_id'], ['work_orders.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vehicle_needs_company_id'), 'vehicle_needs', ['company_id'], unique=False)
    op.create_index(op.f('ix_vehicle_needs_id'), 'vehicle_needs', ['id'], unique=False)
    op.create_index(op.f('ix_vehicle_needs_vehicle_id'), 'vehicle_needs', ['vehicle_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_vehicle_needs_vehicle_id'), table_name='vehicle_needs')
    op.drop_index(op.f('ix_vehicle_needs_id'), table_name='vehicle_needs')
    op.drop_index(op.f('ix_vehicle_needs_company_id'), table_name='vehicle_needs')
    op.drop_table('vehicle_needs')
    op.drop_index(op.f('ix_pin_attempts_user_id'), table_name='pin_attempts')
    op.drop_index(op.f('ix_pin_attempts_created_at'), table_name='pin_attempts')
    op.drop_index(op.f('ix_pin_attempts_company_id'), table_name='pin_attempts')
    op.drop_table('pin_attempts')
    op.drop_index(op.f('ix_inspection_signatures_inspection_id'), table_name='inspection_signatures')
    op.drop_table('inspection_signatures')
    op.drop_index(op.f('ix_inspection_photos_inspection_id'), table_name='inspection_photos')
    op.drop_table('inspection_photos')
    op.drop_index(op.f('ix_inspection_items_inspection_id'), table_name='inspection_items')
    op.drop_table('inspection_items')
    op.drop_index(op.f('ix_inspections_vehicle_id'), table_name='inspections')
    op.drop_index(op.f('ix_inspections_id'), table_name='inspections')
    op.drop_index(op.f('ix_inspections_company_id'), table_name='inspections')
    op.drop_table('inspections')
