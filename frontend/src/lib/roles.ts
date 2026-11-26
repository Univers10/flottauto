import type { Role, User } from "@/types";

/** Un rôle, ou tous les rôles d'un utilisateur (rôle principal + rôles en plus). */
export type Who = Role | Role[] | null | undefined;

const rolesList = (who: Who): Role[] => (who == null ? [] : Array.isArray(who) ? who : [who]);

/** Tous les rôles de l'utilisateur : ses droits sont l'union de ses rôles. */
export function rolesOf(user: Pick<User, "role"> & { roles?: Role[] | null }): Role[] {
  return user.roles && user.roles.length > 0 ? user.roles : [user.role];
}

export const roleLabels: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Gestionnaire",
  driver: "Conducteur",
  mechanic: "Maintenancier",
  accountant: "Caisse / comptable",
  reader: "Lecteur",
  station_manager: "Chef de gare",
  operations_supervisor: "Superviseur des opérations",
  conveyor: "Convoyeur",
};

// Sections accessibles par rôle restreint ; les autres rôles voient tout.
const restrictedSections: Partial<Record<Role, string[]>> = {
  mechanic: ["/maintenance", "/needs", "/alerts", "/settings"],
  // Le convoyeur signe les états des lieux (phase 1) ; pour l'instant, seulement ses réglages.
  conveyor: ["/settings"],
};

export function canAccess(who: Who, pathname: string): boolean {
  return rolesList(who).some((role) => {
    const sections = restrictedSections[role];
    if (!sections) return true;
    return sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
  });
}

export function homePathFor(who: Who): string {
  // Un rôle sans restriction (gestionnaire…) ouvre l'accueil ; sinon la page du rôle restreint.
  const list = rolesList(who);
  if (list.some((r) => r !== "mechanic" && r !== "conveyor")) return "/dashboard";
  if (list.includes("mechanic")) return "/maintenance";
  return "/settings";
}

export function canManageUsers(who: Who): boolean {
  return rolesList(who).some((role) => {
    return role === "admin" || role === "super_admin";
  });
}

/** Gares et valeurs de calcul de l'exploitation. */
export function canEditOperationsSettings(who: Who): boolean {
  return rolesList(who).some((role) => {
    return role === "admin" || role === "super_admin" || role === "operations_supervisor";
  });
}

/** Définir le PIN de signature d'un chauffeur ou d'un convoyeur. */
export function canManagePins(who: Who): boolean {
  return rolesList(who).some((role) => {
    return canEditOperationsSettings(role) || role === "station_manager";
  });
}

export function canDeleteWorkOrders(who: Who): boolean {
  return rolesList(who).some((role) => {
    return role === "admin" || role === "super_admin" || role === "manager" || role === "operations_supervisor";
  });
}

/** Tenir et signer les états des lieux, gérer la liste des besoins. */
export function canRunInspections(who: Who): boolean {
  return rolesList(who).some((role) => {
    return ["super_admin", "admin", "manager", "station_manager", "operations_supervisor"].includes(role);
  });
}

/** Valider une dépense (un besoin) : le superviseur des opérations, ou un administrateur. */
export function canValidateNeeds(who: Who): boolean {
  return rolesList(who).some((role) => {
    return role === "admin" || role === "super_admin" || role === "operations_supervisor";
  });
}

/** Créer, chiffrer et valider un convoi (contrat). */
export function canManageConvoys(who: Who): boolean {
  return rolesList(who).some((role) => {
    // Le chef de gare crée les convois de sa gare (demandes de location).
    return ["super_admin", "admin", "manager", "operations_supervisor", "station_manager"].includes(role);
  });
}

/** Encaisser un paiement de convoi (acompte, solde). */
export function canCollectConvoyPayments(who: Who): boolean {
  return rolesList(who).some((role) => {
    return canManageConvoys(role) || role === "accountant" || role === "station_manager";
  });
}

/** Valider un devis d'intervention dans FlottAuto (le superviseur). */
export function canApproveExpenses(who: Who): boolean {
  return rolesList(who).some((role) => {
    return ["super_admin", "admin", "operations_supervisor"].includes(role);
  });
}

/** Clôturer une intervention (chef de gare et hiérarchie). */
export function canCloseInterventions(who: Who): boolean {
  return rolesList(who).some((role) => {
    return canApproveExpenses(role) || role === "manager" || role === "station_manager";
  });
}
