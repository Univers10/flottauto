import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Date,
    DateTime,
    Numeric,
    ForeignKey,
    Enum,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.core.database import Base


class Role(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    DRIVER = "driver"
    MECHANIC = "mechanic"
    ACCOUNTANT = "accountant"
    READER = "reader"
    STATION_MANAGER = "station_manager"  # chef de gare
    OPERATIONS_SUPERVISOR = "operations_supervisor"  # superviseur des opérations
    CONVEYOR = "conveyor"  # convoyeur


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "available"
    IN_MISSION = "in_mission"
    IN_MAINTENANCE = "in_maintenance"
    OUT_OF_SERVICE = "out_of_service"


class VehicleType(str, enum.Enum):
    CAR = "car"
    VAN = "van"
    TRUCK = "truck"
    BUS = "bus"
    MOTORCYCLE = "motorcycle"
    OTHER = "other"


class EnergyType(str, enum.Enum):
    DIESEL = "diesel"
    PETROL = "petrol"
    ELECTRIC = "electric"
    HYBRID = "hybrid"
    LPG = "lpg"
    OTHER = "other"


class WorkOrderStatus(str, enum.Enum):
    OPENED = "opened"
    DIAGNOSED = "diagnosed"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    VALIDATED = "validated"


class WorkOrderType(str, enum.Enum):
    PREVENTIVE = "preventive"
    CURATIVE = "curative"


class AlertType(str, enum.Enum):
    DOCUMENT_EXPIRY = "document_expiry"
    MAINTENANCE_DUE = "maintenance_due"
    BUDGET_OVERRUN = "budget_overrun"
    IMMOBILIZED = "immobilized"
    LICENSE_EXPIRY = "license_expiry"
    DEPARTURE_BLOCKED = "departure_blocked"
    DEPARTURE_WARNING = "departure_warning"


class TollPaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    BADGE = "badge"
    OTHER = "other"


class FuelType(str, enum.Enum):
    DIESEL = "diesel"
    PETROL = "petrol"
    OTHER = "other"


class StaffType(str, enum.Enum):
    DRIVER = "driver"  # chauffeur
    CONVEYOR = "conveyor"  # convoyeur


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    users = relationship("User", back_populates="company", lazy="dynamic")
    vehicles = relationship("Vehicle", back_populates="company", lazy="dynamic")
    drivers = relationship("Driver", back_populates="company", lazy="dynamic")
    maintenance_plans = relationship("MaintenancePlan", back_populates="company", lazy="dynamic")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.READER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_invited: Mapped[bool] = mapped_column(Boolean, default=False)
    invitation_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    station_id: Mapped[int | None] = mapped_column(ForeignKey("stations.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    company = relationship("Company", back_populates="users")
    station = relationship("Station")


class CompanySettings(Base):
    """Valeurs de calcul de l'exploitation (rentabilité des convois, seuils d'alerte), une ligne par société."""

    __tablename__ = "company_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, unique=True)
    diesel_price_per_liter: Mapped[int] = mapped_column(Integer, default=715)
    driver_daily_ration: Mapped[int] = mapped_column(Integer, default=10000)
    conveyor_daily_ration: Mapped[int] = mapped_column(Integer, default=5000)
    broker_commission_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=5)
    line_revenue_per_bus_day: Mapped[int] = mapped_column(Integer, default=147342)
    immobilization_daily_rate: Mapped[int] = mapped_column(Integer, default=100000)
    document_warning_days: Mapped[int] = mapped_column(Integer, default=30)
    oil_change_warning_km: Mapped[int] = mapped_column(Integer, default=2000)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Station(Base):
    """Gare d'exploitation (Abobo, Yopougon, Odienné…), recopiée depuis ITTS Gestion quand le pont est actif."""

    __tablename__ = "stations"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_stations_company_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    itts_station_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    registration: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    vin: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vehicle_type: Mapped[VehicleType] = mapped_column(Enum(VehicleType), default=VehicleType.CAR)
    energy: Mapped[EnergyType] = mapped_column(Enum(EnergyType), default=EnergyType.DIESEL)
    first_registration_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    mileage: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[VehicleStatus] = mapped_column(Enum(VehicleStatus), default=VehicleStatus.AVAILABLE)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_oil_change_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    oil_change_interval_km: Mapped[int] = mapped_column(Integer, default=10000, server_default="10000")
    fuel_tank_liters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fuel_consumption_l_100km: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    itts_bus_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    @property
    def oil_change_due_in_km(self) -> int | None:
        """Km restants avant la prochaine vidange (négatif si dépassée), None sans relevé."""
        if self.last_oil_change_km is None:
            return None
        return self.last_oil_change_km + (self.oil_change_interval_km or 10000) - (self.mileage or 0)

    company = relationship("Company", back_populates="vehicles")
    driver = relationship("Driver", back_populates="vehicles")
    documents = relationship("Document", back_populates="vehicle", lazy="dynamic")
    work_orders = relationship("WorkOrder", back_populates="vehicle", lazy="dynamic")
    fuel_expenses = relationship("FuelExpense", back_populates="vehicle", lazy="dynamic")


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, unique=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    license_categories: Mapped[str | None] = mapped_column(String(255), nullable=True)
    license_expiry: Mapped[Date | None] = mapped_column(Date, nullable=True)
    medical_check_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    medical_visit_expiry: Mapped[Date | None] = mapped_column(Date, nullable=True)
    staff_type: Mapped[StaffType] = mapped_column(Enum(StaffType), default=StaffType.DRIVER, server_default="DRIVER")
    itts_staff_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pin_failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    @property
    def has_pin(self) -> bool:
        return bool(self.pin_hash)

    company = relationship("Company", back_populates="drivers")
    vehicles = relationship("Vehicle", back_populates="driver")
    documents = relationship("Document", back_populates="driver", lazy="dynamic")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    issue_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    reminder_days: Mapped[int] = mapped_column(Integer, default=30)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle", back_populates="documents")
    driver = relationship("Driver", back_populates="documents")


class MaintenancePlan(Base):
    __tablename__ = "maintenance_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    interval_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    company = relationship("Company", back_populates="maintenance_plans")


class WorkOrderPhoto(Base):
    __tablename__ = "work_order_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    work_order = relationship("WorkOrder", back_populates="photos")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    type: Mapped[WorkOrderType] = mapped_column(Enum(WorkOrderType), default=WorkOrderType.CURATIVE)
    status: Mapped[WorkOrderStatus] = mapped_column(Enum(WorkOrderStatus), default=WorkOrderStatus.OPENED)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    mileage_at_creation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_cost: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    amount_paid: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    remaining_due: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    not_covered: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    external_garage: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    vehicle = relationship("Vehicle", back_populates="work_orders")
    created_by = relationship("User")
    photos = relationship("WorkOrderPhoto", back_populates="work_order", cascade="all, delete-orphan")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    alert_type: Mapped[AlertType] = mapped_column(Enum(AlertType), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="info")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle")
    driver = relationship("Driver")


class TollExpense(Base):
    __tablename__ = "toll_expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    toll_name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[TollPaymentMethod] = mapped_column(Enum(TollPaymentMethod), default=TollPaymentMethod.CASH)
    expense_date: Mapped[Date] = mapped_column(Date, nullable=False)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle")
    driver = relationship("Driver")


class FuelExpense(Base):
    __tablename__ = "fuel_expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    fuel_type: Mapped[FuelType] = mapped_column(Enum(FuelType), default=FuelType.DIESEL)
    liters: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_liter: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    full_tank: Mapped[bool] = mapped_column(Boolean, default=False)
    station_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refuel_date: Mapped[Date] = mapped_column(Date, nullable=False)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    vehicle = relationship("Vehicle")
    driver = relationship("Driver")


# ───────────────────────── Exploitation : états des lieux et besoins ─────────────────────────

class InspectionKind(str, enum.Enum):
    DEPARTURE = "departure"
    ARRIVAL = "arrival"


class InspectionStatus(str, enum.Enum):
    DRAFT = "draft"
    VALIDATED = "validated"


class ItemStatus(str, enum.Enum):
    OK = "ok"
    RESERVE = "reserve"
    KO = "ko"
    NA = "na"


class FuelLevel(str, enum.Enum):
    EMPTY = "empty"
    QUARTER = "quarter"
    HALF = "half"
    THREE_QUARTERS = "three_quarters"
    FULL = "full"


class SignatureRole(str, enum.Enum):
    STATION_MANAGER = "station_manager"
    DRIVER = "driver"
    CONVEYOR = "conveyor"


class NeedPriority(str, enum.Enum):
    BEFORE_DEPARTURE = "before_departure"
    THIS_WEEK = "this_week"
    TO_QUOTE = "to_quote"


class NeedOrigin(str, enum.Enum):
    DEPARTURE_INSPECTION = "departure_inspection"
    ARRIVAL_INSPECTION = "arrival_inspection"
    ODOMETER = "odometer"
    DOCUMENT = "document"
    MANUAL = "manual"


class NeedStatus(str, enum.Enum):
    OPEN = "open"
    VALIDATION_REQUESTED = "validation_requested"
    VALIDATED = "validated"
    SCHEDULED = "scheduled"
    DONE = "done"
    CANCELLED = "cancelled"


def _str_enum(enum_cls):
    """Énumération stockée en texte (pas de type natif PostgreSQL à migrer)."""
    return Enum(enum_cls, native_enum=False, length=32, validate_strings=True)


class Inspection(Base):
    """État des lieux d'un car, au départ ou à l'arrivée (bilan de fin de journée)."""

    __tablename__ = "inspections"
    __table_args__ = (UniqueConstraint("company_id", "number", name="uq_inspections_company_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False, index=True)
    station_id: Mapped[int | None] = mapped_column(ForeignKey("stations.id"), nullable=True)
    kind: Mapped[InspectionKind] = mapped_column(_str_enum(InspectionKind), nullable=False)
    status: Mapped[InspectionStatus] = mapped_column(_str_enum(InspectionStatus), default=InspectionStatus.DRAFT, nullable=False)
    number: Mapped[str] = mapped_column(String(64), nullable=False)
    route_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scheduled_departure_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    conveyor_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fuel_level: Mapped[FuelLevel | None] = mapped_column(_str_enum(FuelLevel), nullable=True)
    fuel_liters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    observations: Mapped[str | None] = mapped_column(Text, nullable=True)
    departure_inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Note et verdict figés à la validation (indépendants des évolutions du barème).
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    vehicle = relationship("Vehicle")
    station = relationship("Station")
    driver = relationship("Driver", foreign_keys=[driver_id])
    conveyor = relationship("Driver", foreign_keys=[conveyor_id])
    created_by = relationship("User")
    departure_inspection = relationship("Inspection", remote_side=[id])
    items = relationship("InspectionItem", cascade="all, delete-orphan", order_by="InspectionItem.position")
    photos = relationship("InspectionPhoto", cascade="all, delete-orphan")
    signatures = relationship("InspectionSignature", cascade="all, delete-orphan")


class InspectionItem(Base):
    __tablename__ = "inspection_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(String(32), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ItemStatus | None] = mapped_column(_str_enum(ItemStatus), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class InspectionPhoto(Base):
    __tablename__ = "inspection_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), nullable=False, index=True)
    slot: Mapped[str] = mapped_column(String(32), nullable=False)
    file_key: Mapped[str] = mapped_column(String(500), nullable=False)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_fresh: Mapped[bool] = mapped_column(Boolean, default=True)
    damage: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class InspectionSignature(Base):
    __tablename__ = "inspection_signatures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), nullable=False, index=True)
    role: Mapped[SignatureRole] = mapped_column(_str_enum(SignatureRole), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    signer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    collected_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    signed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class VehicleNeed(Base):
    """Besoin d'un car (réparation, entretien, achat) ; validé, il devient une intervention."""

    __tablename__ = "vehicle_needs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[NeedPriority] = mapped_column(_str_enum(NeedPriority), nullable=False)
    origin: Mapped[NeedOrigin] = mapped_column(_str_enum(NeedOrigin), default=NeedOrigin.MANUAL, nullable=False)
    origin_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), nullable=True)
    estimated_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[NeedStatus] = mapped_column(_str_enum(NeedStatus), default=NeedStatus.OPEN, nullable=False)
    status_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id"), nullable=True)
    validated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    vehicle = relationship("Vehicle")


class PinAttempt(Base):
    """Journal des essais de PIN de signature (audit et limitation par compte qui recueille la signature)."""

    __tablename__ = "pin_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"), nullable=False)
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), index=True)


class DepartureStatus(str, enum.Enum):
    PLANNED = "planned"
    AUTHORIZED = "authorized"
    DEPARTED = "departed"
    CANCELLED = "cancelled"


class Departure(Base):
    """Départ d'un car (ligne ou convoi). Reçu d'ITTS Gestion quand le pont est actif (itts_departure_id)."""

    __tablename__ = "departures"
    __table_args__ = (
        UniqueConstraint("company_id", "exit_pass_number", name="uq_departures_company_exit_pass"),
        UniqueConstraint("company_id", "itts_departure_id", name="uq_departures_company_itts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False, index=True)
    station_id: Mapped[int | None] = mapped_column(ForeignKey("stations.id"), nullable=True)
    route_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    distance_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    conveyor_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), nullable=True)
    itts_departure_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[DepartureStatus] = mapped_column(_str_enum(DepartureStatus), default=DepartureStatus.PLANNED, nullable=False)
    exit_pass_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    exit_pass_issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    exit_pass_valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    exit_pass_issued_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    exit_pass_status: Mapped[str | None] = mapped_column(String(16), nullable=True)  # green / orange au moment de l'émission
    departed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    vehicle = relationship("Vehicle")
    station = relationship("Station")
    driver = relationship("Driver", foreign_keys=[driver_id])
    conveyor = relationship("Driver", foreign_keys=[conveyor_id])
    inspection = relationship("Inspection")
