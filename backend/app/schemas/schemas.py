from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.models import Role, VehicleStatus, VehicleType, EnergyType, WorkOrderType, WorkOrderStatus, AlertType, TollPaymentMethod, FuelType, StaffType
from app.models.models import FuelLevel, InspectionKind, InspectionStatus, ItemStatus, NeedOrigin, NeedPriority, NeedStatus, SignatureRole


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
    station_id: int | None = None


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=8)
    station_id: int | None = None


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Role
    is_active: bool
    company_id: int | None
    station_id: int | None = None
    created_at: datetime


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# Réglages de calcul de l'exploitation
class OperationsSettingsUpdate(BaseModel):
    diesel_price_per_liter: int | None = Field(None, ge=1, le=100000)
    driver_daily_ration: int | None = Field(None, ge=0, le=1000000)
    conveyor_daily_ration: int | None = Field(None, ge=0, le=1000000)
    broker_commission_pct: Decimal | None = Field(None, ge=0, le=100)
    line_revenue_per_bus_day: int | None = Field(None, ge=0, le=100000000)
    immobilization_daily_rate: int | None = Field(None, ge=0, le=100000000)
    document_warning_days: int | None = Field(None, ge=1, le=365)
    oil_change_warning_km: int | None = Field(None, ge=0, le=100000)


class OperationsSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    diesel_price_per_liter: int
    driver_daily_ration: int
    conveyor_daily_ration: int
    broker_commission_pct: Decimal
    line_revenue_per_bus_day: int
    immobilization_daily_rate: int
    document_warning_days: int
    oil_change_warning_km: int
    updated_at: datetime


# Station
class StationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=2, max_length=255)
    code: str = Field(..., min_length=2, max_length=20)
    itts_station_id: str | None = Field(None, max_length=64)


class StationUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Annotés sans « | None » : un null explicite est refusé (422), l'absence reste permise.
    name: str = Field(None, min_length=2, max_length=255)
    code: str = Field(None, min_length=2, max_length=20)
    itts_station_id: str | None = Field(None, max_length=64)
    active: bool = None


class StationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    itts_station_id: str | None
    active: bool
    created_at: datetime


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
    last_oil_change_km: int | None = Field(None, ge=0)
    oil_change_interval_km: int = Field(10000, ge=500, le=100000)
    fuel_tank_liters: int | None = Field(None, ge=0, le=2000)
    fuel_consumption_l_100km: Decimal | None = Field(None, ge=0, le=200)
    itts_bus_id: str | None = Field(None, max_length=64)


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
    last_oil_change_km: int | None = None
    oil_change_interval_km: int = 10000
    oil_change_due_in_km: int | None = None
    fuel_tank_liters: int | None = None
    fuel_consumption_l_100km: Decimal | None = None
    itts_bus_id: str | None = None
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
    medical_visit_expiry: date | None = None
    staff_type: StaffType = StaffType.DRIVER
    itts_staff_id: str | None = Field(None, max_length=64)


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
    medical_visit_expiry: date | None = None
    staff_type: StaffType = None  # null explicite refusé
    itts_staff_id: str | None = Field(None, max_length=64)
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
    medical_visit_expiry: date | None = None
    staff_type: StaffType = StaffType.DRIVER
    itts_staff_id: str | None = None
    has_pin: bool = False
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PinSet(BaseModel):
    pin: str = Field(..., pattern=r"^[0-9]{4,6}$")


class PinCheck(BaseModel):
    pin: str = Field(..., min_length=1, max_length=6)


class PinCheckResult(BaseModel):
    valid: bool


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


class DocumentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    document_type: str | None = Field(None, min_length=1, max_length=100)
    file_url: str | None = Field(None, max_length=500)
    issue_date: date | None = None
    expiry_date: date | None = None
    reminder_days: int | None = None


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
    created_by_id: int | None = None
    created_by: UserSummary | None = None
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


# Fuel expense
class FuelExpenseCreate(BaseModel):
    vehicle_id: int
    driver_id: int | None = None
    fuel_type: FuelType = FuelType.DIESEL
    liters: Decimal = Field(..., gt=0)
    price_per_liter: Decimal | None = Field(None, gt=0)
    amount: Decimal | None = Field(None, gt=0)
    full_tank: bool = False
    station_name: str | None = Field(None, max_length=255)
    refuel_date: date
    mileage: int | None = None
    notes: str | None = None


class FuelExpenseUpdate(BaseModel):
    vehicle_id: int | None = None
    driver_id: int | None = None
    fuel_type: FuelType | None = None
    liters: Decimal | None = Field(None, gt=0)
    price_per_liter: Decimal | None = Field(None, gt=0)
    amount: Decimal | None = Field(None, gt=0)
    full_tank: bool | None = None
    station_name: str | None = Field(None, max_length=255)
    refuel_date: date | None = None
    mileage: int | None = None
    notes: str | None = None


class FuelExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    vehicle_id: int
    driver_id: int | None
    fuel_type: FuelType
    liters: Decimal
    price_per_liter: Decimal | None
    amount: Decimal
    full_tank: bool
    station_name: str | None
    refuel_date: date
    mileage: int | None
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


# ───────────────────────── États des lieux ─────────────────────────
class InspectionCreate(BaseModel):
    vehicle_id: int
    kind: InspectionKind
    station_id: int | None = None
    route_label: str | None = Field(None, max_length=255)
    scheduled_departure_at: datetime | None = None
    driver_id: int | None = None
    conveyor_id: int | None = None


class InspectionUpdate(BaseModel):
    station_id: int | None = None
    route_label: str | None = Field(None, max_length=255)
    scheduled_departure_at: datetime | None = None
    driver_id: int | None = None
    conveyor_id: int | None = None
    mileage: int | None = Field(None, ge=0, le=5_000_000)
    fuel_level: FuelLevel | None = None
    fuel_liters: int | None = Field(None, ge=0, le=2000)
    observations: str | None = Field(None, max_length=5000)


class InspectionItemSet(BaseModel):
    code: str = Field(..., max_length=64)
    status: ItemStatus | None = None
    note: str | None = Field(None, max_length=500)


class InspectionItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    section: str
    code: str
    label: str
    status: ItemStatus | None
    note: str | None


class InspectionPhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slot: str
    captured_at: datetime | None
    is_fresh: bool
    damage: bool
    uploaded_at: datetime


class InspectionSignatureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    role: SignatureRole
    signer_name: str
    signed_at: datetime


class SignatureCreate(BaseModel):
    role: SignatureRole
    pin: str | None = Field(None, pattern=r"^[0-9]{4,6}$")


class PersonSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str


class InspectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    vehicle_id: int
    station_id: int | None
    kind: InspectionKind
    status: InspectionStatus
    number: str
    route_label: str | None
    scheduled_departure_at: datetime | None
    driver_id: int | None
    conveyor_id: int | None
    driver: PersonSummary | None = None
    conveyor: PersonSummary | None = None
    mileage: int | None
    fuel_level: FuelLevel | None
    fuel_liters: int | None
    observations: str | None
    departure_inspection_id: int | None
    arrived_at: datetime | None
    validated_at: datetime | None
    created_by: UserSummary | None = None
    created_at: datetime
    updated_at: datetime
    items: list[InspectionItemRead] = []
    photos: list[InspectionPhotoRead] = []
    signatures: list[InspectionSignatureRead] = []
    # Calculés par le service
    score: int | None = None
    verdict: str | None = None
    missing_photos: list[str] = []
    ready_to_sign: bool = False
    km_of_day: int | None = None
    report_delay_minutes: int | None = None
    report_late: bool | None = None


class InspectionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    station_id: int | None
    kind: InspectionKind
    status: InspectionStatus
    number: str
    route_label: str | None
    scheduled_departure_at: datetime | None
    mileage: int | None
    created_at: datetime
    validated_at: datetime | None
    score: int | None = None
    verdict: str | None = None
    photos_count: int = 0
    signatures_count: int = 0


# ───────────────────────── Besoins des cars ─────────────────────────
class VehicleNeedCreate(BaseModel):
    vehicle_id: int
    title: str = Field(..., min_length=2, max_length=255)
    details: str | None = Field(None, max_length=2000)
    priority: NeedPriority
    estimated_cost: int | None = Field(None, ge=0, le=1_000_000_000)


class VehicleNeedUpdate(BaseModel):
    title: str = Field(None, min_length=2, max_length=255)
    details: str | None = Field(None, max_length=2000)
    priority: NeedPriority = None
    estimated_cost: int | None = Field(None, ge=0, le=1_000_000_000)
    status: NeedStatus = None
    status_note: str | None = Field(None, max_length=255)


class VehicleNeedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    title: str
    details: str | None
    priority: NeedPriority
    origin: NeedOrigin
    origin_label: str | None
    inspection_id: int | None
    estimated_cost: int | None
    status: NeedStatus
    status_note: str | None
    work_order_id: int | None
    created_at: datetime
    updated_at: datetime


class VehicleNeedList(BaseModel):
    items: list[VehicleNeedRead]
    total_estimated: int
