export type Role =
  | "super_admin"
  | "admin"
  | "manager"
  | "driver"
  | "mechanic"
  | "accountant"
  | "reader";

export interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: Role;
  is_active: boolean;
  company_id: number | null;
  created_at: string;
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
  created_at: string;
  updated_at: string;
}

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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
