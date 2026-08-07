from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models


def compute_dashboard_stats(db: Session, company_id: int) -> dict:
    total_vehicles = db.query(models.Vehicle).filter(models.Vehicle.company_id == company_id).count()
    available_vehicles = (
        db.query(models.Vehicle)
        .filter(
            models.Vehicle.company_id == company_id,
            models.Vehicle.status == models.VehicleStatus.AVAILABLE,
        )
        .count()
    )
    in_maintenance_vehicles = (
        db.query(models.Vehicle)
        .filter(
            models.Vehicle.company_id == company_id,
            models.Vehicle.status == models.VehicleStatus.IN_MAINTENANCE,
        )
        .count()
    )
    active_drivers = (
        db.query(models.Driver)
        .filter(models.Driver.company_id == company_id, models.Driver.is_active == True)
        .count()
    )
    open_work_orders = (
        db.query(models.WorkOrder)
        .filter(
            models.WorkOrder.company_id == company_id,
            models.WorkOrder.status != models.WorkOrderStatus.VALIDATED,
        )
        .count()
    )
    critical_alerts = (
        db.query(models.Alert)
        .filter(
            models.Alert.company_id == company_id,
            models.Alert.is_read == False,
            models.Alert.severity.in_(["critical", "warning"]),
        )
        .count()
    )

    today = date.today()
    reminder_window = today + timedelta(days=30)
    upcoming_document_expirations = (
        db.query(models.Document)
        .filter(
            models.Document.company_id == company_id,
            models.Document.expiry_date.isnot(None),
            models.Document.expiry_date <= reminder_window,
        )
        .count()
    )

    upcoming_maintenance = (
        db.query(models.WorkOrder)
        .filter(
            models.WorkOrder.company_id == company_id,
            models.WorkOrder.type == models.WorkOrderType.PREVENTIVE,
            models.WorkOrder.status != models.WorkOrderStatus.VALIDATED,
        )
        .count()
    )

    avg_age = None
    if total_vehicles:
        avg_age_result = (
            db.query(func.avg(models.Vehicle.year))
            .filter(models.Vehicle.company_id == company_id, models.Vehicle.year.isnot(None))
            .scalar()
        )
        if avg_age_result:
            avg_age = round(datetime.now().year - float(avg_age_result), 1)

    # Monthly maintenance cost from work orders
    first_day_of_month = today.replace(day=1)
    cost_result = (
        db.query(func.sum(models.WorkOrder.total_cost))
        .filter(
            models.WorkOrder.company_id == company_id,
            models.WorkOrder.completed_at.isnot(None),
            models.WorkOrder.completed_at >= first_day_of_month,
        )
        .scalar()
    )
    cost_this_month: Decimal | None = Decimal(cost_result) if cost_result else Decimal("0")

    return {
        "total_vehicles": total_vehicles,
        "available_vehicles": available_vehicles,
        "in_maintenance_vehicles": in_maintenance_vehicles,
        "active_drivers": active_drivers,
        "open_work_orders": open_work_orders,
        "critical_alerts": critical_alerts,
        "upcoming_document_expirations": upcoming_document_expirations,
        "upcoming_maintenance": upcoming_maintenance,
        "average_fleet_age_years": avg_age,
        "cost_this_month": cost_this_month,
    }
