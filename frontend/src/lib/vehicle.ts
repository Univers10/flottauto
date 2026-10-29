import type { Vehicle } from "@/types";

/** Nom d'usage d'un car : son numéro de parc (« N°530 »), commun avec ITTS Gestion ; à défaut l'immatriculation. */
export function vehicleName(vehicle: Pick<Vehicle, "fleet_number" | "registration"> | null | undefined): string {
  if (!vehicle) return "—";
  return vehicle.fleet_number ? `N°${vehicle.fleet_number}` : vehicle.registration;
}

/** « N°530 · AA-575-FZ » quand le numéro de parc et l'immatriculation diffèrent. */
export function vehicleFullName(vehicle: Pick<Vehicle, "fleet_number" | "registration"> | null | undefined): string {
  if (!vehicle) return "—";
  if (!vehicle.fleet_number || vehicle.fleet_number === vehicle.registration) return vehicleName(vehicle);
  return `N°${vehicle.fleet_number} · ${vehicle.registration}`;
}
