export type Role =
  | "super_admin"
  | "admin"
  | "manager"
  | "driver"
  | "mechanic"
  | "accountant"
  | "reader"
  | "station_manager"
  | "operations_supervisor"
  | "conveyor";

export interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: Role;
  is_active: boolean;
  company_id: number | null;
  station_id: number | null;
  created_at: string;
}

export interface Station {
  id: number;
  company_id: number;
  name: string;
  code: string;
  itts_station_id: string | null;
  active: boolean;
  created_at: string;
}

/** Valeurs de calcul de l'exploitation (FCFA, %, jours, km). */
export interface OperationsSettings {
  diesel_price_per_liter: number;
  driver_daily_ration: number;
  conveyor_daily_ration: number;
  broker_commission_pct: string;
  line_revenue_per_bus_day: number;
  immobilization_daily_rate: number;
  document_warning_days: number;
  oil_change_warning_km: number;
  updated_at: string;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  currency: string;
  logo_url: string | null;
}

export type VehicleStatus =
  | "available"
  | "in_mission"
  | "in_maintenance"
  | "out_of_service";

export type VehicleType =
  | "car"
  | "van"
  | "truck"
  | "bus"
  | "motorcycle"
  | "other";

export type EnergyType =
  | "diesel"
  | "petrol"
  | "electric"
  | "hybrid"
  | "lpg"
  | "other";

export interface Vehicle {
  id: number;
  company_id: number;
  driver_id: number | null;
  registration: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number | null;
  vehicle_type: VehicleType;
  energy: EnergyType;
  first_registration_date: string | null;
  mileage: number;
  status: VehicleStatus;
  purchase_price: string | null;
  notes: string | null;
  photo_url: string | null;
  last_oil_change_km: number | null;
  oil_change_interval_km: number;
  /** Km restants avant la vidange (négatif si dépassée), null sans relevé. */
  oil_change_due_in_km: number | null;
  fuel_tank_liters: number | null;
  fuel_consumption_l_100km: string | null;
  itts_bus_id: string | null;
  created_at: string;
  updated_at: string;
}

export type StaffType = "driver" | "conveyor";

export interface Driver {
  id: number;
  company_id: number;
  user_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  license_categories: string | null;
  license_expiry: string | null;
  medical_check_date: string | null;
  medical_visit_expiry: string | null;
  staff_type: StaffType;
  itts_staff_id: string | null;
  has_pin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: number;
  company_id: number;
  vehicle_id: number | null;
  driver_id: number | null;
  name: string;
  document_type: string;
  file_url: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  reminder_days: number;
  created_at: string;
}

export interface MaintenancePlan {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  interval_km: number | null;
  interval_months: number | null;
  is_active: boolean;
  created_at: string;
}

export interface WorkOrderPhoto {
  id: number;
  company_id: number;
  work_order_id: number;
  file_url: string;
  caption: string | null;
  created_at: string;
}

export interface WorkOrder {
  id: number;
  company_id: number;
  vehicle_id: number;
  type: "preventive" | "curative";
  status: "opened" | "diagnosed" | "in_progress" | "done" | "validated";
  title: string;
  description: string | null;
  started_at: string | null;
  completed_at: string | null;
  mileage_at_creation: number | null;
  total_cost: string | null;
  external_garage: string | null;
  created_by_id: number | null;
  created_by: Pick<User, "id" | "email" | "first_name" | "last_name"> | null;
  created_at: string;
  updated_at: string;
  photos?: WorkOrderPhoto[];
}

export interface AlertItem {
  id: number;
  company_id: number;
  vehicle_id: number | null;
  driver_id: number | null;
  alert_type: string;
  severity: string;
  title: string;
  message: string | null;
  is_read: boolean;
  due_date: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_vehicles: number;
  available_vehicles: number;
  in_maintenance_vehicles: number;
  active_drivers: number;
  open_work_orders: number;
  critical_alerts: number;
  upcoming_document_expirations: number;
  upcoming_maintenance: number;
  average_fleet_age_years: number | null;
  cost_this_month: string | null;
}

export type TollPaymentMethod = "cash" | "card" | "badge" | "other";

export interface TollExpense {
  id: number;
  company_id: number;
  vehicle_id: number;
  driver_id: number | null;
  toll_name: string;
  amount: string;
  payment_method: TollPaymentMethod;
  expense_date: string;
  mileage: number | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
}

export type FuelType = "diesel" | "petrol" | "other";

export interface FuelExpense {
  id: number;
  company_id: number;
  vehicle_id: number;
  driver_id: number | null;
  fuel_type: FuelType;
  liters: string;
  price_per_liter: string | null;
  amount: string;
  full_tank: boolean;
  station_name: string | null;
  refuel_date: string;
  mileage: number | null;
  notes: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ───────────────────────── États des lieux ─────────────────────────
export type InspectionKind = "departure" | "arrival";
export type InspectionStatus = "draft" | "validated";
export type ItemStatus = "ok" | "reserve" | "ko" | "na";
export type FuelLevel = "empty" | "quarter" | "half" | "three_quarters" | "full";
export type SignatureRole = "station_manager" | "driver" | "conveyor";
export type InspectionVerdict = "fit" | "fit_with_reserves" | "unfit";
export type PhotoSlot = "front" | "rear" | "left" | "right" | "dashboard" | "interior_front" | "interior_rear" | "hold";

export interface InspectionItem {
  section: "hygiene" | "mechanical" | "equipment" | "technology" | "arrival";
  code: string;
  label: string;
  status: ItemStatus | null;
  note: string | null;
}

export interface InspectionPhoto {
  id: number;
  slot: PhotoSlot;
  captured_at: string | null;
  is_fresh: boolean;
  damage: boolean;
  uploaded_at: string;
}

export interface InspectionSignature {
  role: SignatureRole;
  signer_name: string;
  signed_at: string;
}

export interface PersonSummary {
  id: number;
  first_name: string;
  last_name: string;
}

export interface Inspection {
  id: number;
  company_id: number;
  vehicle_id: number;
  station_id: number | null;
  kind: InspectionKind;
  status: InspectionStatus;
  number: string;
  route_label: string | null;
  scheduled_departure_at: string | null;
  driver_id: number | null;
  conveyor_id: number | null;
  driver: PersonSummary | null;
  conveyor: PersonSummary | null;
  mileage: number | null;
  fuel_level: FuelLevel | null;
  fuel_liters: number | null;
  observations: string | null;
  departure_inspection_id: number | null;
  arrived_at: string | null;
  validated_at: string | null;
  created_by: Pick<User, "id" | "email" | "first_name" | "last_name"> | null;
  created_at: string;
  updated_at: string;
  items: InspectionItem[];
  photos: InspectionPhoto[];
  signatures: InspectionSignature[];
  score: number | null;
  verdict: InspectionVerdict | null;
  missing_photos: PhotoSlot[];
  ready_to_sign: boolean;
  km_of_day: number | null;
  report_delay_minutes: number | null;
  report_late: boolean | null;
}

export interface InspectionListItem {
  id: number;
  vehicle_id: number;
  station_id: number | null;
  kind: InspectionKind;
  status: InspectionStatus;
  number: string;
  route_label: string | null;
  scheduled_departure_at: string | null;
  mileage: number | null;
  created_at: string;
  validated_at: string | null;
  score: number | null;
  verdict: InspectionVerdict | null;
  photos_count: number;
  signatures_count: number;
}

export interface DayReport {
  km_of_day: number | null;
  fuel_level: FuelLevel | null;
  fuel_liters: number | null;
  day_expenses: { fuel: number; tolls: number; total: number };
  deadlines: {
    oil_change_due_in_km: number | null;
    documents: { type: string; expiry_date: string | null; days_left: number | null }[];
  };
  needs: VehicleNeed[];
  needs_total: number;
}

// ───────────────────────── Besoins des cars ─────────────────────────
export type NeedPriority = "before_departure" | "this_week" | "to_quote";
export type NeedOrigin = "departure_inspection" | "arrival_inspection" | "odometer" | "document" | "manual";
export type NeedStatus = "open" | "validation_requested" | "validated" | "scheduled" | "done" | "cancelled";

export interface VehicleNeed {
  id: number;
  vehicle_id: number;
  title: string;
  details: string | null;
  priority: NeedPriority;
  origin: NeedOrigin;
  origin_label: string | null;
  inspection_id: number | null;
  estimated_cost: number | null;
  status: NeedStatus;
  status_note: string | null;
  work_order_id: number | null;
  created_at: string;
  updated_at: string;
}
