"""Réinitialise la base de données et importe les vraies données d'entretien
depuis point_entretien_des_cars.csv (à la racine du projet)."""
import csv
import os
from datetime import date, datetime, timedelta

from app.core.database import SessionLocal, engine, Base
from app import models, schemas, crud
from app.services import alerts

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "point_entretien_des_cars.csv")


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Variable d'environnement requise: {name}")
    return value


def parse_date(value: str, fallback: date) -> date:
    value = (value or "").strip()
    if not value:
        return fallback
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return fallback


def parse_decimal(value: str) -> float | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def create_real_data():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    company = crud.create_company(
        db,
        schemas.CompanyCreate(name="FlottAuto", slug="flottauto", currency="XOF"),
    )

    crud.create_user(
        db,
        schemas.UserCreate(
            email="admin@flottauto.com",
            password=required_env("FLOTTAUTO_ADMIN_PASSWORD"),
            first_name="Admin",
            last_name="FlottAuto",
            role=models.Role.ADMIN,
        ),
        company_id=company.id,
    )

    crud.create_user(
        db,
        schemas.UserCreate(
            email="manager@flottauto.com",
            password=required_env("FLOTTAUTO_MANAGER_PASSWORD"),
            first_name="Manager",
            last_name="FlottAuto",
            role=models.Role.MANAGER,
        ),
        company_id=company.id,
    )

    # Vehicles: one per sheet number found in the CSV
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)

    registrations = sorted({row["Vehicule"].strip() for row in rows if row["Vehicule"].strip()})

    vehicles_by_reg: dict[str, models.Vehicle] = {}
    for reg in registrations:
        vehicle = crud.create_vehicle(
            db,
            schemas.VehicleCreate(
                registration=reg,
                brand="Car",
                model=f"N°{reg}",
                vehicle_type=models.VehicleType.BUS,
                energy=models.EnergyType.DIESEL,
                status=models.VehicleStatus.AVAILABLE,
                mileage=0,
            ),
            company_id=company.id,
        )
        vehicles_by_reg[reg] = vehicle

    # Work orders: one per CSV row, grouped under the last known date per vehicle
    last_date: dict[str, date] = {}
    created_count = 0
    for row in rows:
        reg = row["Vehicule"].strip()
        if not reg:
            continue
        title = (row.get("Reparation") or "").strip()
        if not title:
            continue

        current_date = parse_date(row.get("Date", ""), last_date.get(reg, date.today()))
        last_date[reg] = current_date

        montant = parse_decimal(row.get("Montant", ""))
        reglement = parse_decimal(row.get("Reglement", ""))
        rap = parse_decimal(row.get("RAP", ""))
        npc = parse_decimal(row.get("NPC", ""))

        vehicle = vehicles_by_reg[reg]
        wo = crud.create_work_order(
            db,
            schemas.WorkOrderCreate(
                vehicle_id=vehicle.id,
                type=models.WorkOrderType.CURATIVE,
                title=title,
                description=None,
                mileage_at_creation=None,
                external_garage=None,
            ),
            company_id=company.id,
        )
        crud.update_work_order(
            db,
            wo,
            schemas.WorkOrderUpdate(
                status=models.WorkOrderStatus.VALIDATED,
                started_at=datetime.combine(current_date, datetime.min.time()),
                completed_at=datetime.combine(current_date, datetime.min.time()),
                total_cost=montant,
                amount_paid=reglement,
                remaining_due=rap,
                not_covered=npc,
            ),
        )
        created_count += 1

    alerts.refresh_alerts(db, company.id)

    db.commit()
    db.close()
    print(f"Import terminé : {len(vehicles_by_reg)} véhicules, {created_count} ordres de travail.")


if __name__ == "__main__":
    create_real_data()
