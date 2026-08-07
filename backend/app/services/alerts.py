from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models, crud


def generate_document_expiry_alerts(db: Session, company_id: int) -> int:
    today = date.today()
    window = today + timedelta(days=30)
    documents = (
        db.query(models.Document)
        .filter(
            models.Document.company_id == company_id,
            models.Document.expiry_date.isnot(None),
            models.Document.expiry_date <= window,
        )
        .all()
    )

    created = 0
    for doc in documents:
        existing = (
            db.query(models.Alert)
            .filter(
                models.Alert.company_id == company_id,
                models.Alert.alert_type == models.AlertType.DOCUMENT_EXPIRY,
                models.Alert.vehicle_id == doc.vehicle_id,
                models.Alert.driver_id == doc.driver_id,
            )
            .first()
        )
        if existing:
            continue

        title = f"Document expirant : {doc.name}"
        message = f"Expire le {doc.expiry_date.isoformat()}"
        severity = "critical" if doc.expiry_date <= today else "warning"

        crud.create_alert(
            db,
            {
                "company_id": company_id,
                "vehicle_id": doc.vehicle_id,
                "driver_id": doc.driver_id,
                "alert_type": models.AlertType.DOCUMENT_EXPIRY,
                "severity": severity,
                "title": title,
                "message": message,
                "due_date": doc.expiry_date,
            },
        )
        created += 1
    return created


def generate_maintenance_due_alerts(db: Session, company_id: int) -> int:
    open_preventive = (
        db.query(models.WorkOrder)
        .filter(
            models.WorkOrder.company_id == company_id,
            models.WorkOrder.type == models.WorkOrderType.PREVENTIVE,
            models.WorkOrder.status != models.WorkOrderStatus.VALIDATED,
        )
        .all()
    )

    created = 0
    for wo in open_preventive:
        existing = (
            db.query(models.Alert)
            .filter(
                models.Alert.company_id == company_id,
                models.Alert.alert_type == models.AlertType.MAINTENANCE_DUE,
                models.Alert.vehicle_id == wo.vehicle_id,
            )
            .first()
        )
        if existing:
            continue

        crud.create_alert(
            db,
            {
                "company_id": company_id,
                "vehicle_id": wo.vehicle_id,
                "alert_type": models.AlertType.MAINTENANCE_DUE,
                "severity": "warning",
                "title": f"Maintenance préventive à venir : {wo.title}",
                "message": wo.description,
            },
        )
        created += 1
    return created


def generate_license_expiry_alerts(db: Session, company_id: int) -> int:
    today = date.today()
    window = today + timedelta(days=30)
    drivers = (
        db.query(models.Driver)
        .filter(
            models.Driver.company_id == company_id,
            models.Driver.license_expiry.isnot(None),
            models.Driver.license_expiry <= window,
        )
        .all()
    )

    created = 0
    for driver in drivers:
        existing = (
            db.query(models.Alert)
            .filter(
                models.Alert.company_id == company_id,
                models.Alert.alert_type == models.AlertType.LICENSE_EXPIRY,
                models.Alert.driver_id == driver.id,
            )
            .first()
        )
        if existing:
            continue

        severity = "critical" if driver.license_expiry <= today else "warning"
        crud.create_alert(
            db,
            {
                "company_id": company_id,
                "driver_id": driver.id,
                "alert_type": models.AlertType.LICENSE_EXPIRY,
                "severity": severity,
                "title": f"Permis expirant : {driver.first_name} {driver.last_name}",
                "message": f"Expire le {driver.license_expiry.isoformat()}",
                "due_date": driver.license_expiry,
            },
        )
        created += 1
    return created


def refresh_alerts(db: Session, company_id: int) -> int:
    total = 0
    total += generate_document_expiry_alerts(db, company_id)
    total += generate_maintenance_due_alerts(db, company_id)
    total += generate_license_expiry_alerts(db, company_id)
    return total
