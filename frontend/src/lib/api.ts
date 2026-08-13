import { redirect } from "next/navigation";
import { AlertItem, DashboardStats, Document, Driver, TollExpense, User, Vehicle, WorkOrder } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
export const createUser = (body: Partial<User>) => api.post<User>("/auth/users", body);

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
export const uploadVehicleDocument = (vehicleId: number, formData: FormData) => uploadFile<Document>(`/vehicles/${vehicleId}/documents/upload`, formData);
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
