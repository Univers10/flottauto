import os
import random
from datetime import date, timedelta

from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app import models, schemas, crud
from app.services import alerts


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Variable d'environnement requise: {name}")
    return value


def create_demo_data():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    # Company
    company = crud.create_company(
        db,
        schemas.CompanyCreate(name="FlottAuto Démonstration", slug="demo-flottauto", currency="EUR"),
    )

    # Admin user
    crud.create_user(
        db,
        schemas.UserCreate(
            email="admin@flottauto.com",
            password=required_env("FLOTTAUTO_ADMIN_PASSWORD"),
            first_name="Alice",
            last_name="Durand",
            role=models.Role.ADMIN,
        ),
        company_id=company.id,
    )

    # Manager
    crud.create_user(
        db,
        schemas.UserCreate(
            email="manager@flottauto.com",
            password=required_env("FLOTTAUTO_MANAGER_PASSWORD"),
            first_name="Bob",
            last_name="Martin",
            role=models.Role.MANAGER,
        ),
        company_id=company.id,
    )

    # Vehicles
    brands = [
        ("Renault", "Master", "diesel"),
        ("Peugeot", "Boxer", "diesel"),
        ("Mercedes", "Sprinter", "diesel"),
        ("Volkswagen", "Transporter", "diesel"),
        ("Iveco", "Daily", "diesel"),
        ("Renault", "Zoe", "electric"),
        ("Peugeot", "Expert", "diesel"),
        ("Ford", "Transit", "diesel"),
    ]

    vehicles = []
    for i in range(8):
        brand, model, energy = brands[i]
        year = 2019 + (i % 4)
        vehicle = crud.create_vehicle(
            db,
            schemas.VehicleCreate(
                registration=f"AA-{100 + i}-ZZ",
                vin=f"VF1ABCDEFGH{i:06d}",
                brand=brand,
                model=model,
                year=year,
                vehicle_type=random.choice(
                    [models.VehicleType.VAN, models.VehicleType.TRUCK, models.VehicleType.CAR]
                ),
                energy=energy,
                first_registration_date=date(year, 1, 15),
                mileage=random.randint(20000, 120000),
                status=models.VehicleStatus.AVAILABLE,
                purchase_price=random.randint(15000, 45000),
            ),
            company_id=company.id,
        )
        vehicles.append(vehicle)

        # Documents
        expiry = date.today() + timedelta(days=random.randint(-10, 120))
        crud.create_document(
            db,
            schemas.DocumentCreate(
                vehicle_id=vehicle.id,
                name="Carte grise",
                document_type="registration_card",
                expiry_date=expiry,
                reminder_days=30,
            ),
            company_id=company.id,
        )
        crud.create_document(
            db,
            schemas.DocumentCreate(
                vehicle_id=vehicle.id,
                name="Assurance",
                document_type="insurance",
                expiry_date=expiry + timedelta(days=random.randint(5, 60)),
                reminder_days=30,
            ),
            company_id=company.id,
        )

    # Drivers
    drivers = []
    first_names = ["Pierre", "Marie", "Jean", "Sophie", "Lucas", "Emma"]
    last_names = ["Bernard", "Petit", "Robert", "Richard", "Moreau", "Leroy"]
    for i in range(6):
        driver = crud.create_driver(
            db,
            schemas.DriverCreate(
                first_name=first_names[i],
                last_name=last_names[i],
                email=f"{first_names[i].lower()}.{last_names[i].lower()}@demo.com",
                license_number=f"LIC-{1000 + i}",
                license_categories="B, C",
                license_expiry=date.today() + timedelta(days=random.randint(-5, 90)),
            ),
            company_id=company.id,
        )
        drivers.append(driver)

    # Maintenance plans
    crud.create_maintenance_plan(
        db,
        schemas.MaintenancePlanCreate(
            name="Révision tous les 20 000 km",
            interval_km=20000,
            interval_months=12,
        ),
        company_id=company.id,
    )
    crud.create_maintenance_plan(
        db,
        schemas.MaintenancePlanCreate(
            name="Contrôle technique annuel",
            interval_months=12,
        ),
        company_id=company.id,
    )

    # Work orders
    statuses = [
        models.WorkOrderStatus.OPENED,
        models.WorkOrderStatus.IN_PROGRESS,
        models.WorkOrderStatus.DIAGNOSED,
        models.WorkOrderStatus.DONE,
    ]
    for i in range(5):
        vehicle = vehicles[i]
        wo = crud.create_work_order(
            db,
            schemas.WorkOrderCreate(
                vehicle_id=vehicle.id,
                type=models.WorkOrderType.CURATIVE if i % 2 == 0 else models.WorkOrderType.PREVENTIVE,
                title=f"Entretien {i + 1}",
                description="Entretien régulier",
                mileage_at_creation=vehicle.mileage,
                external_garage="Garage Partenaire" if i % 2 == 0 else None,
            ),
            company_id=company.id,
        )
        # Update status for variety and set costs
        update_payload: dict = {"total_cost": random.randint(150, 3500)}
        if i < 4:
            update_payload["status"] = statuses[i]
        crud.update_work_order(
            db,
            wo,
            schemas.WorkOrderUpdate(**update_payload),
        )

    # Refresh automated alerts
    alerts.refresh_alerts(db, company.id)

    db.commit()
    db.close()
    print("Demo data seeded successfully.")


if __name__ == "__main__":
    create_demo_data()
