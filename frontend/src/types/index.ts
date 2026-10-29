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
  convoy_consumption_l_100km: number;
  convoy_number_prefix: string;
  legal_name: string | null;
  legal_details: string | null;
  legal_representative: string | null;
  contract_city: string | null;
  hotline: string | null;
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
  /** Numéro de parc peint sur le car (ex. « 530 »), commun avec ITTS Gestion. */
  fleet_number: string | null;
  seats: number | null;
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
  kind?: ProofKind | null;
  created_at: string;
}

export type ProofKind = "invoice" | "new_part" | "old_part" | "approval_capture";
export type ApprovalChannel = "in_app" | "whatsapp";
export type InterventionAction = "quote" | "approve" | "done" | "invoice" | "close";
export type InterventionFlag = "needs_reapproval" | "not_approved" | "invoice_missing" | "invoice_late" | "old_part_missing";
export type ExpenseStatus = "pending" | "reimbursable" | "not_reimbursed" | "frozen";

export interface WorkOrderLine {
  id: number;
  label: string;
  quantity: number;
  unit_price: number;
  quote_amount: number;
  invoice_amount: number | null;
}

export interface WorkOrderLineInput {
  label: string;
  quantity: number;
  unit_price: number;
  invoice_amount: number | null;
}

export interface InterventionStep {
  key: "reported" | "quote" | "approve" | "done" | "invoice" | "close";
  label: string;
  done: boolean;
  current: boolean;
  at: string | null;
  detail: string | null;
}

export interface Intervention extends WorkOrder {
  location: string | null;
  garage_phone: string | null;
  reported_at: string | null;
  reported_by_label: string | null;
  quote_sent_at: string | null;
  approved_at: string | null;
  approver_label: string | null;
  approval_channel: ApprovalChannel | null;
  approved_amount: number | null;
  invoice_submitted_at: string | null;
  invoice_total: number | null;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  closed_at: string | null;
  closed_by_label: string | null;
  vehicle_label: string;
  lines: WorkOrderLine[];
  quote_total: number;
  gap: number | null;
  legacy: boolean;
  steps: InterventionStep[];
  next_action: InterventionAction | null;
  proofs: Record<ProofKind, boolean>;
  flags: InterventionFlag[];
  expense_status: ExpenseStatus;
  blockers: string[];
  impact: { total_cost: number; this_month: number; component: string | null; component_count_12m: number; warning: string | null } | null;
  price_compared: number;
  price_flags: { label: string; unit_price: number; usual_price: number }[];
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

// ───────────────────────── Départs et autorisation ─────────────────────────
export type DepartureStatus = "planned" | "authorized" | "departed" | "cancelled";
export type ChecklistItemStatus = "ok" | "warning" | "blocked" | "pending";
export type DepartureLight = "green" | "orange" | "red";

export interface ChecklistItem {
  code: string;
  label: string;
  status: ChecklistItemStatus;
  detail: string | null;
}

export interface DepartureChecklist {
  status: DepartureLight;
  blocking_reason: string | null;
  groups: { key: "papers" | "crew" | "vehicle" | "operations" | "convoy"; label: string; items: ChecklistItem[] }[];
}

export interface Departure {
  id: number;
  vehicle_id: number;
  station_id: number | null;
  route_label: string | null;
  scheduled_at: string;
  distance_km: number | null;
  driver_id: number | null;
  conveyor_id: number | null;
  driver: PersonSummary | null;
  conveyor: PersonSummary | null;
  inspection_id: number | null;
  itts_departure_id: string | null;
  convoy_id: number | null;
  status: DepartureStatus;
  exit_pass_number: string | null;
  exit_pass_issued_at: string | null;
  exit_pass_valid_until: string | null;
  departed_at: string | null;
  created_at: string;
  /** Absente pour un départ parti ou annulé. */
  checklist: DepartureChecklist | null;
}

export interface ExitPass {
  number: string;
  valid_until: string;
  issued_at: string;
  status: "green" | "orange";
  token: string;
  verify_url: string;
  qr_svg: string;
}

export interface ExitPassVerification {
  valid: boolean;
  reason: string | null;
  number: string | null;
  registration: string | null;
  route_label: string | null;
  valid_until: string | null;
}

export interface ReplacementProposal {
  vehicle: { id: number; registration: string; brand: string; model: string };
  last_score: number | null;
  oil_change_due_in_km: number | null;
  documents_status: "ok" | "warning";
}

// Pont ITTS Gestion
export interface IttsEventLog {
  id: string;
  type: "departure.upserted" | "departure.cancelled" | "departure.departed" | "fleet.snapshot";
  status: "received" | "processed" | "pending_mapping" | "error";
  itts_departure_id: string | null;
  bus_plate: string | null;
  received_at: string;
  error: string | null;
}

export interface IttsPendingMapping {
  itts_bus_id: string;
  plate: string | null;
  events: number;
}

export interface IttsBridgeStatus {
  enabled: boolean;
  last_event_at: string | null;
  events: IttsEventLog[];
  pending_mappings: IttsPendingMapping[];
  last_snapshot_at: string | null;
  synced: { vehicles: number; stations: number; staff: number };
}

/* ───────────────────────── Convois ───────────────────────── */

export type ConvoyStatus = "draft" | "confirmed" | "done" | "cancelled";
export type ConvoyPurpose = "pilgrimage" | "funeral" | "wedding" | "tourism" | "corporate" | "sport" | "other";
export type PaymentMethod = "wave" | "orange_money" | "mtn" | "moov" | "cash";

export interface ConvoySegment {
  id?: number;
  position?: number;
  from_label: string;
  to_label: string;
  km: number;
  price_per_seat: number;
}

export interface ConvoyPayment {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paid_at: string;
  recorded_by_name: string | null;
}

export interface ConvoyLine {
  label: string;
  detail: string | null;
  amount: number;
}

export interface ConvoyAccount {
  km: number;
  days: number;
  price_per_seat: number;
  revenue_lines: ConvoyLine[];
  charge_lines: ConvoyLine[];
  revenue: number;
  charges: number;
  margin: number;
  margin_pct: number | null;
  revenue_per_day: number | null;
  line_revenue_per_day: number;
  line_ratio: number | null;
  margin_per_km: number | null;
  margin_per_day: number | null;
  break_even_seats: number | null;
  fuel_share_pct: number | null;
  floor_price: number;
  verdict: "profitable" | "weak" | "loss" | "incomplete";
  verdict_label: string;
  verdict_detail: string;
  paid: number;
  balance: number;
  alerts: string[];
}

export interface Convoy {
  id: number;
  number: string;
  status: ConvoyStatus;
  title: string;
  purpose: ConvoyPurpose;
  client_name: string | null;
  client_phone: string | null;
  broker_name: string | null;
  broker_phone: string | null;
  commission_pct: string | null;
  departure_at: string | null;
  return_date: string | null;
  meeting_point: string | null;
  station_id: number | null;
  seats_sold: number;
  seats_boarded: number | null;
  billed_days: number;
  daily_rate: number | null;
  tolls_estimate: number;
  vehicle_id: number | null;
  backup_vehicle_id: number | null;
  driver_id: number | null;
  relief_driver_id: number | null;
  conveyor_id: number | null;
  notes: string | null;
  contract_generated_at: string | null;
  created_at: string;
  segments: ConvoySegment[];
  payments: ConvoyPayment[];
  account: ConvoyAccount | null;
  vehicle_documents: ChecklistItem[];
  departure_id: number | null;
  vehicle_label: string | null;
  crew_labels: Partial<Record<"driver" | "relief_driver" | "conveyor" | "backup_vehicle" | "station", string>>;
}

export type ConvoyInput = Partial<Omit<Convoy, "id" | "number" | "status" | "segments" | "payments" | "account" | "vehicle_documents"
  | "departure_id" | "vehicle_label" | "crew_labels" | "contract_generated_at" | "created_at">> & { segments?: ConvoySegment[] };

// ───────────────────────── Rapports ─────────────────────────
export interface ReportVehicleRow {
  vehicle_id: number;
  label: string;
  registration: string;
  km: number;
  fuel: number;
  fuel_liters: number;
  tolls: number;
  maintenance: number;
  interventions: number;
  departures: number;
  convoys: number;
  convoy_revenue: number;
  needs_to_plan: number;
  total_cost: number;
  cost_per_km: number | null;
}

export interface ReportSummary {
  start: string;
  end: string;
  label: string;
  totals: {
    fuel: number;
    tolls: number;
    maintenance: number;
    expenses: number;
    km: number;
    departures: number;
    departures_departed: number;
    exit_passes: number;
    convoys: number;
    convoy_revenue: number;
    convoy_margin: number;
    convoy_balance_due: number;
    needs_to_plan: number;
    needs_count: number;
    needs_before_departure: number;
  };
  compliance: {
    departure_inspections: number;
    arrival_inspections: number;
    blocked_alerts: number;
    warning_alerts: number;
    invoice_missing_alerts: number;
  };
  interventions: { open: number; awaiting_invoice: number; closed: number };
  vehicles: ReportVehicleRow[];
  watch: { id: number; title: string; vehicle_label: string; amount: number; expense_status: ExpenseStatus; reasons: string[] }[];
  repeated: { vehicle_label: string; component: string; count: number }[];
  convoy_list: {
    id: number;
    number: string;
    title: string;
    departure_at: string | null;
    vehicle_label: string | null;
    revenue: number;
    charges: number;
    margin: number;
    verdict: "profitable" | "weak" | "loss" | "incomplete";
    verdict_label: string;
    balance: number;
  }[];
  deadlines: { vehicle_label: string; document: string; expiry_date: string; days_left: number }[];
}
