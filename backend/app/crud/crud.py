from datetime import datetime, timezone
from typing import TypeVar, Generic

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.core.security import get_password_hash

T = TypeVar("T")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Company

def create_company(db: Session, obj_in: schemas.CompanyCreate) -> models.Company:
    db_obj = models.Company(**obj_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_company_by_slug(db: Session, slug: str) -> models.Company | None:
    return db.query(models.Company).filter(models.Company.slug == slug).first()


# User

def create_user(db: Session, obj_in: schemas.UserCreate, company_id: int | None = None) -> models.User:
    data = obj_in.model_dump()
    password = data.pop("password")
    db_obj = models.User(
        **data,
        hashed_password=get_password_hash(password),
        company_id=company_id,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_user_by_email(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(func.lower(models.User.email) == func.lower(email)).first()


def get_user(db: Session, user_id: int) -> models.User | None:
    return db.query(models.User).filter(models.User.id == user_id).first()


def list_users_by_company(db: Session, company_id: int, skip: int = 0, limit: int = 100):
    return (
        db.query(models.User)
        .filter(models.User.company_id == company_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


# Vehicle

def create_vehicle(db: Session, obj_in: schemas.VehicleCreate, company_id: int) -> models.Vehicle:
    db_obj = models.Vehicle(**obj_in.model_dump(), company_id=company_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_vehicle(db: Session, vehicle_id: int, company_id: int) -> models.Vehicle | None:
    return (
        db.query(models.Vehicle)
        .filter(models.Vehicle.id == vehicle_id, models.Vehicle.company_id == company_id)
        .first()
    )


def list_vehicles(db: Session, company_id: int, params: schemas.VehicleListParams):
    query = db.query(models.Vehicle).filter(models.Vehicle.company_id == company_id)
    if params.status:
        query = query.filter(models.Vehicle.status == params.status)
    if params.q:
        term = f"%{params.q}%"
        query = query.filter(
            (models.Vehicle.registration.ilike(term))
            | (models.Vehicle.brand.ilike(term))
            | (models.Vehicle.model.ilike(term))
            | (models.Vehicle.vin.ilike(term))
        )
    total = query.count()
    items = query.order_by(models.Vehicle.created_at.desc()).offset((params.page - 1) * params.size).limit(params.size).all()
    return items, total


def update_vehicle(db: Session, db_obj: models.Vehicle, obj_in: schemas.VehicleUpdate) -> models.Vehicle:
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def delete_vehicle(db: Session, db_obj: models.Vehicle) -> None:
    db.delete(db_obj)
    db.commit()


# Driver

def create_driver(db: Session, obj_in: schemas.DriverCreate, company_id: int) -> models.Driver:
    db_obj = models.Driver(**obj_in.model_dump(), company_id=company_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_driver(db: Session, driver_id: int, company_id: int) -> models.Driver | None:
    return (
        db.query(models.Driver)
        .filter(models.Driver.id == driver_id, models.Driver.company_id == company_id)
        .first()
    )


def list_drivers(db: Session, company_id: int, skip: int = 0, limit: int = 100):
    return (
        db.query(models.Driver)
        .filter(models.Driver.company_id == company_id)
        .order_by(models.Driver.last_name)
        .offset(skip)
        .limit(limit)
        .all()
    )


def update_driver(db: Session, db_obj: models.Driver, obj_in: schemas.DriverUpdate) -> models.Driver:
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def delete_driver(db: Session, db_obj: models.Driver) -> None:
    db.delete(db_obj)
    db.commit()


# Document

def create_document(db: Session, obj_in: schemas.DocumentCreate, company_id: int) -> models.Document:
    db_obj = models.Document(**obj_in.model_dump(), company_id=company_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_document(db: Session, document_id: int, company_id: int) -> models.Document | None:
    return (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.company_id == company_id)
        .first()
    )


def list_documents(db: Session, company_id: int, vehicle_id: int | None = None, driver_id: int | None = None):
    query = db.query(models.Document).filter(models.Document.company_id == company_id)
    if vehicle_id:
        query = query.filter(models.Document.vehicle_id == vehicle_id)
    if driver_id:
        query = query.filter(models.Document.driver_id == driver_id)
    return query.order_by(models.Document.expiry_date).all()


def delete_document(db: Session, db_obj: models.Document) -> None:
    db.delete(db_obj)
    db.commit()


# MaintenancePlan

def create_maintenance_plan(db: Session, obj_in: schemas.MaintenancePlanCreate, company_id: int) -> models.MaintenancePlan:
    db_obj = models.MaintenancePlan(**obj_in.model_dump(), company_id=company_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def list_maintenance_plans(db: Session, company_id: int):
    return (
        db.query(models.MaintenancePlan)
        .filter(models.MaintenancePlan.company_id == company_id)
        .order_by(models.MaintenancePlan.name)
        .all()
    )


# WorkOrder

def create_work_order(db: Session, obj_in: schemas.WorkOrderCreate, company_id: int) -> models.WorkOrder:
    data = obj_in.model_dump()
    db_obj = models.WorkOrder(**data, company_id=company_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    # Set vehicle status to maintenance if curative or preventive
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == db_obj.vehicle_id).first()
    if vehicle and vehicle.status != models.VehicleStatus.OUT_OF_SERVICE:
        vehicle.status = models.VehicleStatus.IN_MAINTENANCE
        db.add(vehicle)
        db.commit()
    return db_obj


def get_work_order(db: Session, work_order_id: int, company_id: int) -> models.WorkOrder | None:
    return (
        db.query(models.WorkOrder)
        .filter(models.WorkOrder.id == work_order_id, models.WorkOrder.company_id == company_id)
        .options(joinedload(models.WorkOrder.photos))
        .first()
    )


def list_work_orders(db: Session, company_id: int, vehicle_id: int | None = None, status: str | None = None):
    query = db.query(models.WorkOrder).filter(models.WorkOrder.company_id == company_id)
    if vehicle_id:
        query = query.filter(models.WorkOrder.vehicle_id == vehicle_id)
    if status:
        query = query.filter(models.WorkOrder.status == status)
    return query.order_by(models.WorkOrder.created_at.desc()).all()


def update_work_order(db: Session, db_obj: models.WorkOrder, obj_in: schemas.WorkOrderUpdate) -> models.WorkOrder:
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)

    # Update vehicle status when work order is validated
    if db_obj.status == models.WorkOrderStatus.VALIDATED:
        vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == db_obj.vehicle_id).first()
        if vehicle:
            open_orders = (
                db.query(models.WorkOrder)
                .filter(
                    models.WorkOrder.vehicle_id == vehicle.id,
                    models.WorkOrder.status != models.WorkOrderStatus.VALIDATED,
                )
                .count()
            )
            if open_orders == 0 and vehicle.status == models.VehicleStatus.IN_MAINTENANCE:
                vehicle.status = models.VehicleStatus.AVAILABLE
                db.add(vehicle)
                db.commit()
    return db_obj


def delete_work_order(db: Session, db_obj: models.WorkOrder) -> None:
    db.delete(db_obj)
    db.commit()


def create_work_order_photo(db: Session, work_order_id: int, company_id: int, file_url: str, caption: str | None = None) -> models.WorkOrderPhoto:
    db_obj = models.WorkOrderPhoto(work_order_id=work_order_id, company_id=company_id, file_url=file_url, caption=caption)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_work_order_photo(db: Session, photo_id: int, company_id: int) -> models.WorkOrderPhoto | None:
    return (
        db.query(models.WorkOrderPhoto)
        .filter(models.WorkOrderPhoto.id == photo_id, models.WorkOrderPhoto.company_id == company_id)
        .first()
    )


def list_work_order_photos(db: Session, work_order_id: int, company_id: int) -> list[models.WorkOrderPhoto]:
    return (
        db.query(models.WorkOrderPhoto)
        .filter(models.WorkOrderPhoto.work_order_id == work_order_id, models.WorkOrderPhoto.company_id == company_id)
        .order_by(models.WorkOrderPhoto.created_at.desc())
        .all()
    )


def delete_work_order_photo(db: Session, db_obj: models.WorkOrderPhoto) -> None:
    db.delete(db_obj)
    db.commit()


# Alert

def create_alert(db: Session, obj_in: dict) -> models.Alert:
    db_obj = models.Alert(**obj_in)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def list_alerts(db: Session, company_id: int, unread_only: bool = False, limit: int = 100):
    query = db.query(models.Alert).filter(models.Alert.company_id == company_id)
    if unread_only:
        query = query.filter(models.Alert.is_read == False)
    return query.order_by(models.Alert.created_at.desc()).limit(limit).all()


def mark_alert_read(db: Session, alert_id: int, company_id: int) -> models.Alert | None:
    alert = (
        db.query(models.Alert)
        .filter(models.Alert.id == alert_id, models.Alert.company_id == company_id)
        .first()
    )
    if not alert:
        return None
    alert.is_read = True
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def mark_all_alerts_read(db: Session, company_id: int) -> int:
    updated = (
        db.query(models.Alert)
        .filter(models.Alert.company_id == company_id, models.Alert.is_read == False)
        .update({models.Alert.is_read: True})
    )
    db.commit()
    return updated


# Toll expense

def create_toll_expense(db: Session, obj_in: schemas.TollExpenseCreate, company_id: int) -> models.TollExpense:
    db_obj = models.TollExpense(**obj_in.model_dump(), company_id=company_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_toll_expense(db: Session, toll_id: int, company_id: int) -> models.TollExpense | None:
    return (
        db.query(models.TollExpense)
        .filter(models.TollExpense.id == toll_id, models.TollExpense.company_id == company_id)
        .first()
    )


def list_toll_expenses(
    db: Session,
    company_id: int,
    vehicle_id: int | None = None,
    driver_id: int | None = None,
):
    query = db.query(models.TollExpense).filter(models.TollExpense.company_id == company_id)
    if vehicle_id:
        query = query.filter(models.TollExpense.vehicle_id == vehicle_id)
    if driver_id:
        query = query.filter(models.TollExpense.driver_id == driver_id)
    return query.order_by(models.TollExpense.expense_date.desc()).all()


def update_toll_expense(db: Session, db_obj: models.TollExpense, obj_in: schemas.TollExpenseUpdate) -> models.TollExpense:
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def delete_toll_expense(db: Session, db_obj: models.TollExpense) -> None:
    db.delete(db_obj)
    db.commit()
