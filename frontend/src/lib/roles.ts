import type { Role } from "@/types";

export const roleLabels: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  driver: "Conducteur",
  mechanic: "Maintenancier",
  accountant: "Comptable",
  reader: "Lecteur",
  station_manager: "Chef de gare",
  operations_supervisor: "Superviseur des opérations",
  conveyor: "Convoyeur",
};

// Sections accessibles par rôle restreint ; les autres rôles voient tout.
const restrictedSections: Partial<Record<Role, string[]>> = {
  mechanic: ["/maintenance", "/alerts", "/settings"],
  // Le convoyeur signe les états des lieux (phase 1) ; pour l'instant, seulement ses réglages.
  conveyor: ["/settings"],
};

export function canAccess(role: Role, pathname: string): boolean {
  const sections = restrictedSections[role];
  if (!sections) return true;
  return sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}

export function homePathFor(role: Role): string {
  if (role === "mechanic") return "/maintenance";
  if (role === "conveyor") return "/settings";
  return "/dashboard";
}

export function canManageUsers(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

/** Gares et valeurs de calcul de l'exploitation. */
export function canEditOperationsSettings(role: Role): boolean {
  return role === "admin" || role === "super_admin" || role === "operations_supervisor";
}

/** Définir le PIN de signature d'un chauffeur ou d'un convoyeur. */
export function canManagePins(role: Role): boolean {
  return canEditOperationsSettings(role) || role === "station_manager";
}

export function canDeleteWorkOrders(role: Role): boolean {
  return role === "admin" || role === "super_admin" || role === "manager" || role === "operations_supervisor";
}
