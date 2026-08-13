from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.models import Role, VehicleStatus, VehicleType, EnergyType, WorkOrderType, WorkOrderStatus, AlertType, TollPaymentMethod


# Common
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)


# Company
class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=255)
    currency: str = "EUR"


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    currency: str
    logo_url: str | None


# User
class UserBase(BaseModel):
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    role: Role = Role.ADMIN


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Role
    is_active: bool
    company_id: int | None
    created_at: datetime


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# Vehicle
class VehicleCreate(BaseModel):
    registration: str = Field(..., min_length=1, max_length=50)
    vin: str | None = Field(None, max_length=50)
    driver_id: int | None = None
    brand: str = Field(..., min_length=1, max_length=100)
    model: str = Field(..., min_length=1, max_length=100)
    year: int | None = Field(None, ge=1900, le=2100)
    vehicle_type: VehicleType = VehicleType.CAR
    energy: EnergyType = EnergyType.DIESEL
    first_registration_date: date | None = None
    mileage: int = 0
    status: VehicleStatus = VehicleStatus.AVAILABLE
    purchase_price: Decimal | None = None
    notes: str | None = None
    photo_url: str | None = None


class VehicleUpdate(VehicleCreate):
    registration: str | None = Field(None, min_length=1, max_length=50)
    brand: str | None = Field(None, min_length=1, max_length=100)
    model: str | None = Field(None, min_length=1, max_length=100)


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    driver_id: int | None
    registration: str
    vin: str | None
    brand: str
    model: str
    year: int | None
    vehicle_type: VehicleType
    energy: EnergyType
    first_registration_date: date | None
    mileage: int
    status: VehicleStatus
    purchase_price: Decimal | None
    notes: str | None
    photo_url: str | None
    created_at: datetime
    updated_at: datetime


class VehicleListParams(PaginationParams):
    status: VehicleStatus | None = None
    q: str | None = None


# Driver
class DriverCreate(BaseModel):
    user_id: int | None = None
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    license_number: str | None = Field(None, max_length=100)
    license_categories: str | None = Field(None, max_length=255)
    license_expiry: date | None = None
    medical_check_date: date | None = None


class DriverUpdate(BaseModel):
    user_id: int | None = None
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    license_number: str | None = Field(None, max_length=100)
    license_categories: str | None = Field(None, max_length=255)
    license_expiry: date | None = None
    medical_check_date: date | None = None
    is_active: bool | None = None


class DriverRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    user_id: int | None
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    license_number: str | None
    license_categories: str | None
    license_expiry: date | None
    medical_check_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# Document
class DocumentCreate(BaseModel):
    vehicle_id: int | None = None
    driver_id: int | None = None
    name: str = Field(..., min_length=1, max_length=255)
    document_type: str = Field(..., min_length=1, max_length=100)
    file_url: str | None = Field(None, max_length=500)
    issue_date: date | None = None
    expiry_date: date | None = None
    reminder_days: int = 30


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    vehicle_id: int | None
    driver_id: int | None
    name: str
    document_type: str
    file_url: str | None
    issue_date: date | None
    expiry_date: date | None
    reminder_days: int
    created_at: datetime


# MaintenancePlan
class MaintenancePlanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    interval_km: int | None = None
    interval_months: int | None = None


class MaintenancePlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    description: str | None
    interval_km: int | None
    interval_months: int | None
    is_active: bool
    created_at: datetime


# WorkOrder
class WorkOrderCreate(BaseModel):
    vehicle_id: int
    type: WorkOrderType = WorkOrderType.CURATIVE
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    mileage_at_creation: int | None = None
    external_garage: str | None = Field(None, max_length=255)


class WorkOrderUpdate(BaseModel):
    status: WorkOrderStatus | None = None
    title: str | None = Field(None, min_length=1, max_length=255)
    type: WorkOrderType | None = None
    description: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    total_cost: Decimal | None = None
    amount_paid: Decimal | None = None
    remaining_due: Decimal | None = None
    not_covered: Decimal | None = None
    external_garage: str | None = Field(None, max_length=255)


class WorkOrderPhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    work_order_id: int
    file_url: str
    caption: str | None
    created_at: datetime


class WorkOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    vehicle_id: int
    type: WorkOrderType
    status: WorkOrderStatus
    title: str
    description: str | None
    started_at: datetime | None
    completed_at: datetime | None
    mileage_at_creation: int | None
    total_cost: Decimal | None
    amount_paid: Decimal | None
    remaining_due: Decimal | None
    not_covered: Decimal | None
    external_garage: str | None
    created_at: datetime
    updated_at: datetime
    photos: list[WorkOrderPhotoRead] = []


# Alert
class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    vehicle_id: int | None
    driver_id: int | None
    alert_type: AlertType
    severity: str
    title: str
    message: str | None
    is_read: bool
    due_date: date | None
    created_at: datetime


# Toll expense
class TollExpenseCreate(BaseModel):
    vehicle_id: int
    driver_id: int | None = None
    toll_name: str = Field(..., min_length=1, max_length=255)
    amount: Decimal = Field(..., gt=0)
    payment_method: TollPaymentMethod = TollPaymentMethod.CASH
    expense_date: date
    mileage: int | None = None
    notes: str | None = None


class TollExpenseUpdate(BaseModel):
    vehicle_id: int | None = None
    driver_id: int | None = None
    toll_name: str | None = Field(None, min_length=1, max_length=255)
    amount: Decimal | None = Field(None, gt=0)
    payment_method: TollPaymentMethod | None = None
    expense_date: date | None = None
    mileage: int | None = None
    notes: str | None = None


class TollExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    vehicle_id: int
    driver_id: int | None
    toll_name: str
    amount: Decimal
    payment_method: TollPaymentMethod
    expense_date: date
    mileage: int | None
    receipt_url: str | None
    notes: str | None
    created_at: datetime


# Dashboard
class DashboardStats(BaseModel):
    total_vehicles: int
    available_vehicles: int
    in_maintenance_vehicles: int
    active_drivers: int
    open_work_orders: int
    critical_alerts: int
    upcoming_document_expirations: int
    upcoming_maintenance: int
    average_fleet_age_years: float | None
    cost_this_month: Decimal | None
