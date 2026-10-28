"""Modèles de check-list des états des lieux (maquettes ITTS « État des lieux au départ » et « Fin de journée »).

Les points d'une section bloquante passés en KO rendent le car inapte au départ.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ChecklistItem:
    section: str
    code: str
    label: str


SECTION_LABELS = {
    "hygiene": "Hygiène et confort",
    "mechanical": "Mécanique et sécurité",
    "equipment": "Pièces et outils de bord",
    "technology": "Caméras et outils technologiques",
    "arrival": "Contrôle d'arrivée",
}

# Un KO dans ces sections refuse le départ (règle de la maquette 2).
BLOCKING_SECTIONS = {"mechanical", "equipment"}

DEPARTURE_CHECKLIST: tuple[ChecklistItem, ...] = (
    ChecklistItem("hygiene", "cleanliness", "Propreté de l'intérieur (sol, sièges, vitres)"),
    ChecklistItem("hygiene", "seats_belts", "Sièges, appuie-têtes et ceintures"),
    ChecklistItem("hygiene", "air_conditioning", "Climatisation, avant et arrière"),
    ChecklistItem("hygiene", "curtains_lighting", "Rideaux, veilleuses, éclairage intérieur"),
    ChecklistItem("hygiene", "odor_bins", "Odeur et poubelles vidées"),
    ChecklistItem("mechanical", "tyres", "Pneus : pression et usure, roue de secours"),
    ChecklistItem("mechanical", "brakes", "Freins et frein à main"),
    ChecklistItem("mechanical", "fluid_levels", "Niveaux : huile, refroidissement, freins"),
    ChecklistItem("mechanical", "leaks", "Fuites visibles sous le car"),
    ChecklistItem("mechanical", "lights", "Phares, clignotants, feux stop"),
    ChecklistItem("mechanical", "windshield_body", "Pare-brise, essuie-glaces, rétroviseurs, carrosserie"),
    ChecklistItem("equipment", "extinguisher", "Extincteur chargé (date de validité)"),
    ChecklistItem("equipment", "triangles_vests", "Triangles et gilets"),
    ChecklistItem("equipment", "jack_tools", "Cric, clé de roue, câble de remorquage"),
    ChecklistItem("equipment", "first_aid", "Trousse de premiers secours"),
    ChecklistItem("technology", "cameras", "Caméras intérieures (enregistrement actif)"),
    ChecklistItem("technology", "gps_limiter", "Traceur GPS et limiteur de vitesse"),
    ChecklistItem("technology", "conveyor_phone", "Téléphone ou terminal du convoyeur (chargé, en ligne)"),
    ChecklistItem("technology", "usb_sound_screen", "Ports USB, sono et écran"),
)

ARRIVAL_CHECKLIST: tuple[ChecklistItem, ...] = (
    ChecklistItem("arrival", "cleanliness_after", "Propreté du car après le voyage"),
    ChecklistItem("arrival", "new_damages", "Dégâts nouveaux depuis le départ"),
    ChecklistItem("arrival", "forgotten_items", "Objets oubliés par les passagers"),
    ChecklistItem("arrival", "video_saved", "Vidéo du jour sauvegardée"),
    ChecklistItem("arrival", "incident", "Incident ou contrôle routier"),
)

PHOTO_SLOTS: dict[str, str] = {
    "front": "Face avant",
    "rear": "Face arrière",
    "left": "Côté gauche",
    "right": "Côté droit",
    "dashboard": "Compteur et jauge",
    "interior_front": "Intérieur avant",
    "interior_rear": "Intérieur arrière",
    "hold": "Soute",
}

RESERVE_PENALTY = 6
KO_PENALTY = 20


def checklist_for(kind: str) -> tuple[ChecklistItem, ...]:
    return DEPARTURE_CHECKLIST if kind == "departure" else ARRIVAL_CHECKLIST


def item_by_code(kind: str) -> dict[str, ChecklistItem]:
    return {it.code: it for it in checklist_for(kind)}
