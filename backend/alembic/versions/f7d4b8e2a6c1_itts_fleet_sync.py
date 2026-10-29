"""itts fleet sync: numéro de parc, places, ville des gares

Revision ID: f7d4b8e2a6c1
Revises: e6c2a9d4f1b3
Create Date: 2026-10-29 14:00:00.000000

"""
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7d4b8e2a6c1'
down_revision = 'e6c2a9d4f1b3'
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    vehicles = _columns('vehicles')
    if 'fleet_number' not in vehicles:
        op.add_column('vehicles', sa.Column('fleet_number', sa.String(length=20), nullable=True))
        op.create_index(op.f('ix_vehicles_fleet_number'), 'vehicles', ['fleet_number'], unique=False)
    if 'seats' not in vehicles:
        op.add_column('vehicles', sa.Column('seats', sa.Integer(), nullable=True))
    if 'city' not in _columns('stations'):
        op.add_column('stations', sa.Column('city', sa.String(length=100), nullable=True))

    # Numéro de parc déduit de l'existant : immatriculation « 530 » ou modèle « N°575 ».
    bind = op.get_bind()
    rows = bind.execute(sa.text('SELECT id, registration, model FROM vehicles WHERE fleet_number IS NULL')).fetchall()
    for vid, registration, model in rows:
        number = None
        if re.fullmatch(r'\d{1,6}', (registration or '').strip()):
            number = registration.strip()
        else:
            match = re.search(r'N°\s*(\d{1,6})', model or '')
            number = match.group(1) if match else None
        if number:
            bind.execute(sa.text('UPDATE vehicles SET fleet_number = :n WHERE id = :id'), {'n': number, 'id': vid})


def downgrade() -> None:
    op.drop_column('stations', 'city')
    op.drop_column('vehicles', 'seats')
    op.drop_index(op.f('ix_vehicles_fleet_number'), table_name='vehicles')
    op.drop_column('vehicles', 'fleet_number')
