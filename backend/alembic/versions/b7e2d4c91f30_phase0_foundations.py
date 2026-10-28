"""phase 0 foundations: operations roles, stations, staff PIN, vehicle oil change, company settings

Revision ID: b7e2d4c91f30
Revises: a3c1f5e2b7d4
Create Date: 2026-10-28 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7e2d4c91f30'
down_revision = 'a3c1f5e2b7d4'
branch_labels = None
depends_on = None

NEW_ROLES = ("STATION_MANAGER", "OPERATIONS_SUPERVISOR", "CONVEYOR")
staff_type = sa.Enum("DRIVER", "CONVEYOR", name="stafftype")


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        # SQLAlchemy stocke l'enum Role par NOM (majuscules) dans le type natif « role ».
        for value in NEW_ROLES:
            op.execute(f"ALTER TYPE role ADD VALUE IF NOT EXISTS '{value}'")
        staff_type.create(bind, checkfirst=True)

    op.create_table(
        "stations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("itts_station_id", sa.String(length=64), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "code", name="uq_stations_company_code"),
    )
    op.create_index(op.f("ix_stations_id"), "stations", ["id"], unique=False)
    op.create_index(op.f("ix_stations_company_id"), "stations", ["company_id"], unique=False)

    op.create_table(
        "company_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("diesel_price_per_liter", sa.Integer(), nullable=False, server_default="715"),
        sa.Column("driver_daily_ration", sa.Integer(), nullable=False, server_default="10000"),
        sa.Column("conveyor_daily_ration", sa.Integer(), nullable=False, server_default="5000"),
        sa.Column("broker_commission_pct", sa.Numeric(precision=5, scale=2), nullable=False, server_default="5"),
        sa.Column("line_revenue_per_bus_day", sa.Integer(), nullable=False, server_default="147342"),
        sa.Column("immobilization_daily_rate", sa.Integer(), nullable=False, server_default="100000"),
        sa.Column("document_warning_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("oil_change_warning_km", sa.Integer(), nullable=False, server_default="2000"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id"),
    )
    op.create_index(op.f("ix_company_settings_id"), "company_settings", ["id"], unique=False)

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("station_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_users_station_id_stations", "stations", ["station_id"], ["id"])

    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("last_oil_change_km", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("oil_change_interval_km", sa.Integer(), nullable=False, server_default="10000"))
        batch_op.add_column(sa.Column("fuel_tank_liters", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("fuel_consumption_l_100km", sa.Numeric(precision=5, scale=2), nullable=True))
        batch_op.add_column(sa.Column("itts_bus_id", sa.String(length=64), nullable=True))

    with op.batch_alter_table("drivers") as batch_op:
        batch_op.add_column(sa.Column("medical_visit_expiry", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("staff_type", staff_type, nullable=False, server_default="DRIVER"))
        batch_op.add_column(sa.Column("itts_staff_id", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("pin_hash", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("pin_failed_attempts", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("pin_locked_until", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("drivers") as batch_op:
        for col in ("pin_locked_until", "pin_failed_attempts", "pin_hash", "itts_staff_id", "staff_type", "medical_visit_expiry"):
            batch_op.drop_column(col)

    with op.batch_alter_table("vehicles") as batch_op:
        for col in ("itts_bus_id", "fuel_consumption_l_100km", "fuel_tank_liters", "oil_change_interval_km", "last_oil_change_km"):
            batch_op.drop_column(col)

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_station_id_stations", type_="foreignkey")
        batch_op.drop_column("station_id")

    op.drop_index(op.f("ix_company_settings_id"), table_name="company_settings")
    op.drop_table("company_settings")
    op.drop_index(op.f("ix_stations_company_id"), table_name="stations")
    op.drop_index(op.f("ix_stations_id"), table_name="stations")
    op.drop_table("stations")

    if bind.dialect.name == "postgresql":
        staff_type.drop(bind, checkfirst=True)
        # Les valeurs ajoutées à l'enum « role » ne peuvent pas être retirées sans recréer le type :
        # elles restent, sans effet si aucun compte ne les utilise.
