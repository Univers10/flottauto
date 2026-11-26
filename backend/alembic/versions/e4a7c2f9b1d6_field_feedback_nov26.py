"""field feedback: convoy charges, conveyor name, fine photos, contract share link, 40 L/100 km

Revision ID: e4a7c2f9b1d6
Revises: d8e2b6f4a1c9
"""
from alembic import op
import sqlalchemy as sa

revision = 'e4a7c2f9b1d6'
down_revision = 'd8e2b6f4a1c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    with op.batch_alter_table('convoys') as batch:
        batch.add_column(sa.Column('fuel_cost', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('driver_rations_cost', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('conveyor_rations_cost', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('share_token', sa.String(length=64), nullable=True))
        batch.create_unique_constraint('uq_convoys_share_token', ['share_token'])
    with op.batch_alter_table('inspections') as batch:
        batch.add_column(sa.Column('conveyor_name', sa.String(length=120), nullable=True))
    with op.batch_alter_table('departures') as batch:
        batch.add_column(sa.Column('conveyor_name', sa.String(length=120), nullable=True))
    # Les contraventions sont créées au démarrage de l'appli (create_all) : rien à faire si elles n'existent pas encore.
    if 'fines' in tables and 'fine_photos' not in tables:
        op.create_table(
            'fine_photos',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
            sa.Column('fine_id', sa.Integer(), sa.ForeignKey('fines.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('file_url', sa.String(length=500), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        # Photo unique d'avant : elle devient la première de la galerie.
        bind.execute(sa.text(
            "INSERT INTO fine_photos (company_id, fine_id, file_url, created_at) "
            "SELECT company_id, id, photo_url, created_at FROM fines WHERE photo_url IS NOT NULL"
        ))
    # Consommation de référence des cars ITTS : 40 L/100 km (ancienne valeur par défaut : 33).
    with op.batch_alter_table('company_settings') as batch:
        batch.alter_column('convoy_consumption_l_100km', server_default='40', existing_type=sa.Integer())
    bind.execute(sa.text("UPDATE company_settings SET convoy_consumption_l_100km = 40 WHERE convoy_consumption_l_100km = 33"))


def downgrade() -> None:
    with op.batch_alter_table('company_settings') as batch:
        batch.alter_column('convoy_consumption_l_100km', server_default='33', existing_type=sa.Integer())
    if 'fine_photos' in set(sa.inspect(op.get_bind()).get_table_names()):
        op.drop_table('fine_photos')
    with op.batch_alter_table('departures') as batch:
        batch.drop_column('conveyor_name')
    with op.batch_alter_table('inspections') as batch:
        batch.drop_column('conveyor_name')
    with op.batch_alter_table('convoys') as batch:
        batch.drop_constraint('uq_convoys_share_token', type_='unique')
        batch.drop_column('share_token')
        batch.drop_column('conveyor_rations_cost')
        batch.drop_column('driver_rations_cost')
        batch.drop_column('fuel_cost')
