import { redirect } from "next/navigation";
import { Departure, IttsBridgeStatus, ExitPass, ExitPassVerification, ReplacementProposal, DayReport, Inspection, InspectionKind, InspectionListItem, InspectionPhoto, ItemStatus, NeedPriority, PhotoSlot, SignatureRole, VehicleNeed, OperationsSettings, Station, AlertItem, DashboardStats, Document, Driver, FuelExpense, TollExpense, User, Vehicle, WorkOrder } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";

/** URL absolue d'un fichier servi par le backend (/uploads/...). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_URL.replace(/\/api\/v1\/?$/, "")}${path}`;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("flottauto_token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("flottauto_token", token);
  }
}

export function removeToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("flottauto_token");
  }
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
    redirect("/");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Login failed");
  }

  return response.json();
}

// Auth
export const getMe = () => api.get<User>("/auth/me");

// Users
export const listUsers = () => api.get<User[]>("/auth/users");
export const createUser = (body: Partial<User> & { password: string }) => api.post<User>("/auth/users", body);
export const updateUser = (id: number, body: Partial<Pick<User, "first_name" | "last_name" | "role" | "is_active">> & { password?: string }) =>
  api.put<User>(`/auth/users/${id}`, body);

export function uploadFile<T>(path: string, formData: FormData) {
  return request<T>(path, { method: "POST", body: formData });
}

// Vehicles
export const listVehicles = (params?: { status?: string; q?: string; page?: number; size?: number }) => {
  const search = new URLSearchParams();
  if (params?.status) search.append("status", params.status);
  if (params?.q) search.append("q", params.q);
  if (params?.page) search.append("page", String(params.page));
  if (params?.size) search.append("size", String(params.size));
  const qs = search.toString();
  return api.get<{ items: Vehicle[]; total: number; page: number; size: number }>(`/vehicles${qs ? `?${qs}` : ""}`);
};
export const getVehicle = (id: number) => api.get<Vehicle>(`/vehicles/${id}`);
export const createVehicle = (body: Partial<Vehicle>) => api.post<Vehicle>("/vehicles", body);
export const updateVehicle = (id: number, body: Partial<Vehicle>) => api.put<Vehicle>(`/vehicles/${id}`, body);
export const listVehicleDocuments = (vehicleId: number) => api.get<Document[]>(`/vehicles/${vehicleId}/documents`);
export const createVehicleDocument = (vehicleId: number, body: Partial<Document>) => api.post<Document>(`/vehicles/${vehicleId}/documents`, body);
export const uploadVehicleDocument = (vehicleId: number, formData: FormData) => uploadFile<Document[]>(`/vehicles/${vehicleId}/documents/upload`, formData);
export const updateVehicleDocument = (vehicleId: number, documentId: number, body: Partial<Document>) =>
  api.put<Document>(`/vehicles/${vehicleId}/documents/${documentId}`, body);
export const deleteVehicleDocument = (vehicleId: number, documentId: number) => api.delete(`/vehicles/${vehicleId}/documents/${documentId}`);
export const deleteVehicle = (id: number) => api.delete(`/vehicles/${id}`);
export const uploadVehiclePhoto = (vehicleId: number, formData: FormData) =>
  uploadFile<Vehicle>(`/vehicles/${vehicleId}/photo`, formData);
export const deleteVehiclePhoto = (vehicleId: number) => api.delete<Vehicle>(`/vehicles/${vehicleId}/photo`);

// Drivers
export const listDrivers = () => api.get<Driver[]>("/drivers");
export const getDriver = (id: number) => api.get<Driver>(`/drivers/${id}`);
export const createDriver = (body: Partial<Driver>) => api.post<Driver>("/drivers", body);
export const updateDriver = (id: number, body: Partial<Driver>) => api.put<Driver>(`/drivers/${id}`, body);
export const deleteDriver = (id: number) => api.delete(`/drivers/${id}`);
export const listDriverDocuments = (driverId: number) => api.get<Document[]>(`/drivers/${driverId}/documents`);
export const uploadDriverDocument = (driverId: number, formData: FormData) =>
  uploadFile<Document[]>(`/drivers/${driverId}/documents/upload`, formData);
export const updateDriverDocument = (driverId: number, documentId: number, body: Partial<Document>) =>
  api.put<Document>(`/drivers/${driverId}/documents/${documentId}`, body);
export const deleteDriverDocument = (driverId: number, documentId: number) =>
  api.delete(`/drivers/${driverId}/documents/${documentId}`);

// Work orders
export const listWorkOrders = () => api.get<WorkOrder[]>("/maintenance/work-orders");
export const createWorkOrder = (body: Partial<WorkOrder>) => api.post<WorkOrder>("/maintenance/work-orders", body);
export const updateWorkOrder = (id: number, body: Partial<WorkOrder>) =>
  api.put<WorkOrder>(`/maintenance/work-orders/${id}`, body);
export const deleteWorkOrder = (id: number) => api.delete(`/maintenance/work-orders/${id}`);
export const uploadWorkOrderPhoto = (workOrderId: number, formData: FormData) =>
  uploadFile<{ id: number; file_url: string; caption: string | null }>(`/maintenance/work-orders/${workOrderId}/photos`, formData);
export const deleteWorkOrderPhoto = (workOrderId: number, photoId: number) =>
  api.delete(`/maintenance/work-orders/${workOrderId}/photos/${photoId}`);

// Fuel expenses
export const listFuelExpenses = (params?: { vehicle_id?: number; driver_id?: number }) => {
  const query = new URLSearchParams();
  if (params?.vehicle_id) query.set("vehicle_id", String(params.vehicle_id));
  if (params?.driver_id) query.set("driver_id", String(params.driver_id));
  const qs = query.toString();
  return api.get<FuelExpense[]>(`/fuel${qs ? `?${qs}` : ""}`);
};
export const createFuelExpense = (body: Partial<FuelExpense>) => api.post<FuelExpense>("/fuel", body);
export const getFuelExpense = (id: number) => api.get<FuelExpense>(`/fuel/${id}`);
export const updateFuelExpense = (id: number, body: Partial<FuelExpense>) =>
  api.put<FuelExpense>(`/fuel/${id}`, body);
export const deleteFuelExpense = (id: number) => api.delete(`/fuel/${id}`);

// Alerts
export const listAlerts = (unreadOnly = false) =>
  api.get<AlertItem[]>(`/alerts?${unreadOnly ? "unread_only=true" : ""}`);
export const markAlertRead = (id: number) => api.post<AlertItem>(`/alerts/${id}/read`, {});
export const markAllAlertsRead = () => api.post<{ updated: number }>("/alerts/read-all", {});
export const refreshAlerts = () => api.post<{ created: number }>("/dashboard/refresh-alerts", {});

// Toll expenses
export const listTollExpenses = (params?: { vehicle_id?: number; driver_id?: number }) => {
  const query = new URLSearchParams();
  if (params?.vehicle_id) query.set("vehicle_id", String(params.vehicle_id));
  if (params?.driver_id) query.set("driver_id", String(params.driver_id));
  const qs = query.toString();
  return api.get<TollExpense[]>(`/tolls${qs ? `?${qs}` : ""}`);
};
export const createTollExpense = (body: Partial<TollExpense>) => api.post<TollExpense>("/tolls", body);
export const getTollExpense = (id: number) => api.get<TollExpense>(`/tolls/${id}`);
export const updateTollExpense = (id: number, body: Partial<TollExpense>) => api.put<TollExpense>(`/tolls/${id}`, body);
export const deleteTollExpense = (id: number) => api.delete(`/tolls/${id}`);

// Dashboard
export const getDashboardStats = () => api.get<DashboardStats>("/dashboard/stats");

// Gares
export const listStations = () => api.get<Station[]>("/stations");
export const createStation = (body: { name: string; code: string; itts_station_id?: string | null }) => api.post<Station>("/stations", body);
export const updateStation = (id: number, body: Partial<Pick<Station, "name" | "code" | "itts_station_id" | "active">>) =>
  api.put<Station>(`/stations/${id}`, body);

// Réglages de calcul de l'exploitation
export const getOperationsSettings = () => api.get<OperationsSettings>("/settings/operations");
export const updateOperationsSettings = (body: Partial<Omit<OperationsSettings, "updated_at">>) =>
  api.put<OperationsSettings>("/settings/operations", body);

// PIN de signature du personnel
export const setDriverPin = (id: number, pin: string) => api.put<Driver>(`/drivers/${id}/pin`, { pin });
export const verifyDriverPin = (id: number, pin: string) => api.post<{ valid: boolean }>(`/drivers/${id}/verify-pin`, { pin });

// États des lieux
export const listInspections = (params: { vehicle_id?: number; station_id?: number; kind?: string; status?: string; day?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  return api.get<InspectionListItem[]>(`/inspections${qs.toString() ? `?${qs}` : ""}`);
};
export const getInspection = (id: number) => api.get<Inspection>(`/inspections/${id}`);
export const createInspection = (body: {
  vehicle_id: number;
  kind: InspectionKind;
  departure_id?: number | null;
  station_id?: number | null;
  route_label?: string | null;
  scheduled_departure_at?: string | null;
  driver_id?: number | null;
  conveyor_id?: number | null;
}) => api.post<Inspection>("/inspections", body);
export const updateInspection = (id: number, body: Partial<Pick<Inspection, "station_id" | "route_label" | "scheduled_departure_at" | "driver_id" | "conveyor_id" | "mileage" | "fuel_level" | "fuel_liters" | "observations" | "arrived_at">>) =>
  request<Inspection>(`/inspections/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const setInspectionItems = (id: number, items: { code: string; status: ItemStatus | null; note?: string | null }[]) =>
  api.put<Inspection>(`/inspections/${id}/items`, items);
export function uploadInspectionPhoto(id: number, slot: PhotoSlot, file: File, meta: { capturedAt: Date; fresh: boolean; damage?: boolean }) {
  const form = new FormData();
  form.append("slot", slot);
  form.append("file", file);
  form.append("captured_at", meta.capturedAt.toISOString());
  form.append("is_fresh", String(meta.fresh));
  form.append("damage", String(Boolean(meta.damage)));
  return uploadFile<InspectionPhoto>(`/inspections/${id}/photos`, form);
}
export const signInspection = (id: number, role: SignatureRole, pin?: string) =>
  api.post<Inspection>(`/inspections/${id}/signatures`, { role, ...(pin ? { pin } : {}) });
export const validateInspection = (id: number) => api.post<Inspection>(`/inspections/${id}/validate`, {});
export const getDayReport = (id: number) => api.get<DayReport>(`/inspections/${id}/day-report`);
/** Photo privée : téléchargée avec le jeton (pas d'URL publique). Renvoie une URL blob à libérer. */
export async function fetchInspectionPhoto(inspectionId: number, photoId: number): Promise<string> {
  const token = getToken();
  const res = await fetch(`${API_URL}/inspections/${inspectionId}/photos/${photoId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Photo indisponible");
  return URL.createObjectURL(await res.blob());
}

// Besoins des cars
export const listNeeds = (params: { vehicle_id?: number; status?: string; priority?: string; open_only?: boolean } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== false).map(([k, v]) => [k, String(v)]));
  return api.get<{ items: VehicleNeed[]; total_estimated: number }>(`/needs${qs.toString() ? `?${qs}` : ""}`);
};
export const createNeed = (body: { vehicle_id: number; title: string; details?: string | null; priority: NeedPriority; estimated_cost?: number | null }) =>
  api.post<VehicleNeed>("/needs", body);
export const updateNeed = (id: number, body: Partial<Pick<VehicleNeed, "title" | "details" | "priority" | "estimated_cost" | "status" | "status_note">>) =>
  request<VehicleNeed>(`/needs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const createWorkOrderFromNeed = (id: number) => api.post<WorkOrder>(`/needs/${id}/work-order`, {});

// Départs et autorisation
export const listDepartures = (params: { day?: string; station_id?: number; status?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  return api.get<Departure[]>(`/departures${qs.toString() ? `?${qs}` : ""}`);
};
export const getDeparture = (id: number) => api.get<Departure>(`/departures/${id}`);
export const createDeparture = (body: {
  vehicle_id: number;
  scheduled_at: string;
  station_id?: number | null;
  route_label?: string | null;
  distance_km?: number | null;
  driver_id?: number | null;
  conveyor_id?: number | null;
}) => api.post<Departure>("/departures", body);
export const updateDeparture = (id: number, body: Partial<Pick<Departure, "scheduled_at" | "station_id" | "route_label" | "distance_km" | "driver_id" | "conveyor_id" | "inspection_id">>) =>
  request<Departure>(`/departures/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const cancelDeparture = (id: number) => api.post<Departure>(`/departures/${id}/cancel`, {});
export const markDeparted = (id: number) => api.post<Departure>(`/departures/${id}/depart`, {});
export const issueExitPass = (id: number) => api.post<Departure>(`/departures/${id}/exit-pass`, {});
export const getExitPass = (id: number) => api.get<ExitPass>(`/departures/${id}/exit-pass`);
export const notifySupervisor = (id: number) => api.post<void>(`/departures/${id}/notify`, {});
export const listReplacements = (id: number) => api.get<ReplacementProposal[]>(`/departures/${id}/replacements`);
export const replaceDepartureVehicle = (id: number, vehicle_id: number) => api.post<Departure>(`/departures/${id}/replace`, { vehicle_id });
/** Vérification publique du QR (sans connexion). */
export async function verifyExitPass(token: string): Promise<ExitPassVerification> {
  const res = await fetch(`${API_URL}/exit-passes/verify?token=${encodeURIComponent(token)}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Vérification impossible");
  return res.json();
}

// Pont ITTS Gestion (administration)
export const getIttsStatus = () => api.get<IttsBridgeStatus>("/integrations/itts/status");
export const mapIttsBus = (itts_bus_id: string, vehicle_id: number) =>
  api.post<{ replayed: number }>("/integrations/itts/bus-mappings", { itts_bus_id, vehicle_id });
