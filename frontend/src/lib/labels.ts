import type { EnergyType, FuelType, TollPaymentMethod, VehicleStatus, VehicleType, WorkOrder } from "@/types";

/** Ton sémantique d'un statut : pilote la couleur de StatusBadge, jamais utilisé seul sans libellé. */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type StatusDef = { label: string; tone: Tone };

export const vehicleStatus: Record<VehicleStatus, StatusDef> = {
  available: { label: "Disponible", tone: "success" },
  in_mission: { label: "En mission", tone: "info" },
  in_maintenance: { label: "En maintenance", tone: "warning" },
  out_of_service: { label: "Hors service", tone: "danger" },
};

export const workOrderStatus: Record<WorkOrder["status"], StatusDef> = {
  opened: { label: "Ouvert", tone: "neutral" },
  diagnosed: { label: "Diagnostiqué", tone: "info" },
  in_progress: { label: "En cours", tone: "warning" },
  done: { label: "Terminé", tone: "success" },
  validated: { label: "Validé", tone: "success" },
};

export const workOrderType: Record<WorkOrder["type"], string> = {
  preventive: "Préventif",
  curative: "Curatif",
};

export const alertSeverity: Record<string, StatusDef> = {
  critical: { label: "Critique", tone: "danger" },
  warning: { label: "Attention", tone: "warning" },
  info: { label: "Info", tone: "info" },
};

export const vehicleTypeLabels: Record<VehicleType, string> = {
  car: "Voiture",
  van: "Utilitaire",
  truck: "Camion",
  bus: "Bus",
  motorcycle: "Moto",
  other: "Autre",
};

export const energyLabels: Record<EnergyType, string> = {
  diesel: "Diesel",
  petrol: "Essence",
  electric: "Électrique",
  hybrid: "Hybride",
  lpg: "GPL",
  other: "Autre",
};

export const fuelLabels: Record<FuelType, string> = {
  diesel: "Diesel",
  petrol: "Essence",
  other: "Autre",
};

export const tollMethodLabels: Record<TollPaymentMethod, string> = {
  cash: "Espèces",
  card: "Carte",
  badge: "Badge / Télépéage",
  other: "Autre",
};

export const documentTypeLabels: Record<string, string> = {
  registration_card: "Carte grise",
  insurance: "Assurance",
  technical_control: "Contrôle technique",
  vignette: "Vignette",
  transport_authorization: "Autorisation de transport",
  license: "Permis",
  id_card: "Pièce d'identité",
  medical: "Visite médicale",
  other: "Autre",
};
