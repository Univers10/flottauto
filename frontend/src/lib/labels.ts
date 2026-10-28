import type {
  ChecklistItemStatus,
  DepartureLight,
  DepartureStatus,
  EnergyType,
  FuelLevel,
  FuelType,
  InspectionKind,
  InspectionVerdict,
  ItemStatus,
  NeedOrigin,
  NeedPriority,
  NeedStatus,
  PhotoSlot,
  SignatureRole,
  StaffType,
  TollPaymentMethod,
  VehicleStatus,
  VehicleType,
  WorkOrder,
} from "@/types";

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
  transport_card: "Carte de transporteur",
  transport_authorization: "Autorisation de transport",
  license: "Permis",
  id_card: "Pièce d'identité",
  medical: "Visite médicale",
  other: "Autre",
};

export const staffTypeLabels: Record<StaffType, string> = {
  driver: "Chauffeur",
  conveyor: "Convoyeur",
};

/** Documents obligatoires d'un car pour l'autorisation de départ. */
export const requiredVehicleDocuments = ["insurance", "technical_control", "registration_card", "transport_card"] as const;

/** Types de justificatifs acceptés par le serveur (PDF, images, Word, Excel). */
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx";

// ───────────────────────── États des lieux ─────────────────────────
export const inspectionKindLabels: Record<InspectionKind, string> = {
  departure: "Départ",
  arrival: "Arrivée",
};

export const inspectionVerdict: Record<InspectionVerdict, StatusDef> = {
  fit: { label: "Apte", tone: "success" },
  fit_with_reserves: { label: "Apte avec réserves", tone: "warning" },
  unfit: { label: "Inapte", tone: "danger" },
};

export const itemStatus: Record<ItemStatus, StatusDef> = {
  ok: { label: "OK", tone: "success" },
  reserve: { label: "Réserve", tone: "warning" },
  ko: { label: "KO", tone: "danger" },
  na: { label: "Sans objet", tone: "neutral" },
};

export const inspectionSectionLabels: Record<string, string> = {
  hygiene: "Hygiène et confort",
  mechanical: "Mécanique et sécurité",
  equipment: "Pièces et outils de bord",
  technology: "Caméras et outils technologiques",
  arrival: "Contrôle d'arrivée",
};

/** Sections où un KO rend le car inapte au départ. */
export const blockingSections = ["mechanical", "equipment"];

export const photoSlotLabels: Record<PhotoSlot, string> = {
  front: "Face avant",
  rear: "Face arrière",
  left: "Côté gauche",
  right: "Côté droit",
  dashboard: "Compteur et jauge",
  interior_front: "Intérieur avant",
  interior_rear: "Intérieur arrière",
  hold: "Soute",
};

export const photoSlots = Object.keys(photoSlotLabels) as PhotoSlot[];

export const fuelLevelLabels: Record<FuelLevel, string> = {
  empty: "Réserve",
  quarter: "1/4",
  half: "1/2",
  three_quarters: "3/4",
  full: "Plein",
};

export const signatureRoleLabels: Record<SignatureRole, string> = {
  station_manager: "Chef de gare",
  driver: "Chauffeur",
  conveyor: "Convoyeur",
};

// ───────────────────────── Besoins ─────────────────────────
export const needPriority: Record<NeedPriority, StatusDef> = {
  before_departure: { label: "Avant le départ", tone: "danger" },
  this_week: { label: "Cette semaine", tone: "warning" },
  to_quote: { label: "À chiffrer", tone: "info" },
};

export const needStatus: Record<NeedStatus, StatusDef> = {
  open: { label: "À traiter", tone: "neutral" },
  validation_requested: { label: "Validation demandée", tone: "warning" },
  validated: { label: "Validé", tone: "success" },
  scheduled: { label: "Planifié", tone: "info" },
  done: { label: "Fait", tone: "success" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const needOriginLabels: Record<NeedOrigin, string> = {
  departure_inspection: "État des lieux de départ",
  arrival_inspection: "État des lieux d'arrivée",
  odometer: "Compteur",
  document: "Document",
  manual: "Saisie manuelle",
};

// ───────────────────────── Départs ─────────────────────────
export const departureLight: Record<DepartureLight, StatusDef & { headline: string }> = {
  green: { label: "Autorisé", tone: "success", headline: "Départ autorisé" },
  orange: { label: "Avec réserves", tone: "warning", headline: "Départ avec alerte" },
  red: { label: "Bloqué", tone: "danger", headline: "Départ bloqué" },
};

export const departureStatus: Record<DepartureStatus, StatusDef> = {
  planned: { label: "Prévu", tone: "neutral" },
  authorized: { label: "Bon de sortie émis", tone: "success" },
  departed: { label: "Parti", tone: "info" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const checklistItemTone: Record<ChecklistItemStatus, Tone> = {
  ok: "success",
  warning: "warning",
  blocked: "danger",
  pending: "neutral",
};
