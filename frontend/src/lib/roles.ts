import type { Role } from "@/types";

export const roleLabels: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  driver: "Conducteur",
  mechanic: "Maintenancier",
  accountant: "Comptable",
  reader: "Lecteur",
};

// Sections accessibles aux maintenanciers ; les autres rôles voient tout.
const mechanicSections = ["/maintenance", "/alerts", "/settings"];

export function canAccess(role: Role, pathname: string): boolean {
  if (role !== "mechanic") return true;
  return mechanicSections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}

export function homePathFor(role: Role): string {
  return role === "mechanic" ? "/maintenance" : "/dashboard";
}

export function canManageUsers(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

export function canDeleteWorkOrders(role: Role): boolean {
  return role === "admin" || role === "super_admin" || role === "manager";
}
