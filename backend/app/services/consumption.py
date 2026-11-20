"""Consommation réelle en litres aux 100 km, calculée à partir des pleins.

Entre deux pleins « à ras » (réservoir rempli) dont le kilométrage est relevé : litres mis après le
premier plein jusqu'au second inclus (pleins partiels compris) ÷ km parcourus × 100. La valeur saisie
à la main sur la fiche du car reste la valeur théorique, utilisée tant qu'il n'y a pas de mesure.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app import models

# Écart au-dessus de la valeur théorique qui fait signaler le car (fuite, vol, panne, saisie erronée).
ANOMALY_PCT = 15
# Intervalle aberrant (compteur faux, plein oublié) : ignoré.
MAX_INTERVAL_KM = 5000
# Fiche du car : moyenne des derniers intervalles mesurés.
RECENT_INTERVALS = 5


@dataclass
class Interval:
    end: date
    liters: float
    km: int


def intervals(fills: list[models.FuelExpense]) -> list[Interval]:
    """Intervalles plein à ras → plein à ras d'un car, dans l'ordre chronologique."""
    ordered = sorted(fills, key=lambda f: (f.refuel_date, f.mileage or 0, f.id or 0))
    out: list[Interval] = []
    last_full: models.FuelExpense | None = None
    liters = 0.0
    for f in ordered:
        if last_full is not None:
            liters += float(f.liters or 0)
        if f.full_tank and f.mileage:
            if last_full is not None:
                km = f.mileage - (last_full.mileage or 0)
                if 0 < km <= MAX_INTERVAL_KM and liters > 0:
                    out.append(Interval(f.refuel_date, liters, km))
            last_full = f
            liters = 0.0
    return out


def l_100km(items: list[Interval]) -> float | None:
    km = sum(i.km for i in items)
    return round(sum(i.liters for i in items) * 100 / km, 1) if km > 0 else None


def gap_pct(measured: float | None, theoretical: float | None) -> int | None:
    if measured is None or not theoretical:
        return None
    return round((measured - float(theoretical)) * 100 / float(theoretical))


def _fills(db: Session, company_id: int, vehicle_ids: list[int] | None = None, until: date | None = None):
    q = db.query(models.FuelExpense).filter(models.FuelExpense.company_id == company_id)
    if vehicle_ids is not None:
        q = q.filter(models.FuelExpense.vehicle_id.in_(vehicle_ids))
    if until is not None:
        q = q.filter(models.FuelExpense.refuel_date <= until)
    by_vehicle: dict[int, list[models.FuelExpense]] = defaultdict(list)
    for f in q.all():
        by_vehicle[f.vehicle_id].append(f)
    return by_vehicle


def vehicle_consumption(db: Session, vehicle: models.Vehicle) -> dict:
    """Fiche du car : consommation mesurée (derniers pleins), théorique, écart et signalement."""
    items = intervals(_fills(db, vehicle.company_id, [vehicle.id]).get(vehicle.id, []))[-RECENT_INTERVALS:]
    measured = l_100km(items)
    theoretical = float(vehicle.fuel_consumption_l_100km) if vehicle.fuel_consumption_l_100km else None
    gap = gap_pct(measured, theoretical)
    return {
        "measured_l_100km": measured,
        "theoretical_l_100km": theoretical,
        "gap_pct": gap,
        "anomaly": gap is not None and gap > ANOMALY_PCT,
        "intervals": len(items),
        "km": sum(i.km for i in items),
        "liters": round(sum(i.liters for i in items), 1),
        "since": items[0].end if items else None,
    }


def effective_l_100km(db: Session, vehicle: models.Vehicle | None) -> float | None:
    """Valeur utilisée dans les calculs (départs, convois) : mesurée si possible, sinon théorique."""
    if vehicle is None:
        return None
    measured = vehicle_consumption(db, vehicle)["measured_l_100km"]
    if measured is not None:
        return measured
    return float(vehicle.fuel_consumption_l_100km) if vehicle.fuel_consumption_l_100km else None


def per_vehicle_in_period(db: Session, company_id: int, start: date, end: date) -> dict[int, float | None]:
    """Rapports : L/100 km de chaque car sur les intervalles qui se terminent dans la période."""
    out: dict[int, float | None] = {}
    for vehicle_id, fills in _fills(db, company_id, until=end).items():
        out[vehicle_id] = l_100km([i for i in intervals(fills) if start <= i.end <= end])
    return out
