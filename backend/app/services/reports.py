"""Rapports : point hebdomadaire du lundi et bilan sur une période (coût par car, convois, conformité).

Tout est calculé à la demande à partir des données saisies ; rien n'est stocké.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app import crud, models
from app.services import convoys as convoy_svc
from app.services import interventions as iv_svc

WO = models.WorkOrderStatus
MAX_DAYS = 400
OPEN_NEEDS = (models.NeedStatus.OPEN, models.NeedStatus.VALIDATION_REQUESTED, models.NeedStatus.VALIDATED, models.NeedStatus.SCHEDULED)


def week_of(day: date) -> tuple[date, date]:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)


def _label(start: date, end: date) -> str:
    if start.weekday() == 0 and end == start + timedelta(days=6):
        return f"Semaine du {start:%d/%m} au {end:%d/%m/%Y}"
    if start.day == 1 and (end + timedelta(days=1)).day == 1 and start.month == end.month:
        months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        return f"{months[start.month - 1].capitalize()} {start.year}"
    return f"Du {start:%d/%m/%Y} au {end:%d/%m/%Y}"


def summary(db: Session, company_id: int, start: date, end: date) -> dict:
    if end < start:
        raise HTTPException(status_code=400, detail="La date de fin précède la date de début")
    if (end - start).days > MAX_DAYS:
        raise HTTPException(status_code=400, detail="Période trop longue (13 mois au plus)")
    lo, hi = _bounds(start, end)
    now = iv_svc._now()

    vehicles = db.query(models.Vehicle).filter(models.Vehicle.company_id == company_id).all()
    rows: dict[int, dict] = {
        v.id: {
            "vehicle_id": v.id, "label": convoy_svc.vehicle_label(v) or v.registration, "registration": v.registration,
            "km": 0, "fuel": 0, "fuel_liters": 0.0, "tolls": 0, "maintenance": 0, "interventions": 0,
            "departures": 0, "convoys": 0, "convoy_revenue": 0, "needs_to_plan": 0,
        }
        for v in vehicles
    }
    readings: dict[int, list[int]] = defaultdict(list)

    # Carburant et péages
    for f in db.query(models.FuelExpense).filter(
        models.FuelExpense.company_id == company_id, models.FuelExpense.refuel_date >= start, models.FuelExpense.refuel_date <= end
    ):
        if f.vehicle_id in rows:
            rows[f.vehicle_id]["fuel"] += int(f.amount or 0)
            rows[f.vehicle_id]["fuel_liters"] += float(f.liters or 0)
            if f.mileage:
                readings[f.vehicle_id].append(f.mileage)
    for t in db.query(models.TollExpense).filter(
        models.TollExpense.company_id == company_id, models.TollExpense.expense_date >= start, models.TollExpense.expense_date <= end
    ):
        if t.vehicle_id in rows:
            rows[t.vehicle_id]["tolls"] += int(t.amount or 0)
            if t.mileage:
                readings[t.vehicle_id].append(t.mileage)

    # États des lieux : relevés de compteur et conformité
    inspections = db.query(models.Inspection).filter(
        models.Inspection.company_id == company_id, models.Inspection.created_at >= lo, models.Inspection.created_at < hi
    ).all()
    for insp in inspections:
        if insp.mileage and insp.vehicle_id in rows:
            readings[insp.vehicle_id].append(insp.mileage)
    for vid, values in readings.items():
        if len(values) >= 2:
            rows[vid]["km"] = max(values) - min(values)

    # Interventions : coût sur la période (date des travaux, sinon de création)
    orders = (
        db.query(models.WorkOrder)
        .filter(
            models.WorkOrder.company_id == company_id,
            or_(
                (models.WorkOrder.completed_at >= lo) & (models.WorkOrder.completed_at < hi),
                models.WorkOrder.completed_at.is_(None) & (models.WorkOrder.created_at >= lo) & (models.WorkOrder.created_at < hi),
            ),
        )
        .options(selectinload(models.WorkOrder.lines), selectinload(models.WorkOrder.photos), selectinload(models.WorkOrder.vehicle))
        .all()
    )
    watch = []
    prices = iv_svc.price_base(db, company_id)
    status_counts = {"open": 0, "awaiting_invoice": 0, "closed": 0}
    for wo in orders:
        if wo.vehicle_id in rows:
            rows[wo.vehicle_id]["maintenance"] += int(wo.total_cost or 0)
            rows[wo.vehicle_id]["interventions"] += 1
        if wo.status == WO.VALIDATED:
            status_counts["closed"] += 1
        elif wo.status == WO.DONE:
            status_counts["awaiting_invoice" if wo.invoice_submitted_at is None else "open"] += 1
        else:
            status_counts["open"] += 1
        flags, expense = iv_svc.compute_flags(wo, now)
        reasons = [iv_svc.FLAG_LABELS[f] for f in flags]
        _, price_flags = iv_svc._price_check(db, wo, prices)
        reasons += [f"Prix élevé : {p.label} à {convoy_svc.money(p.unit_price)} (habituel {convoy_svc.money(p.usual_price)})" for p in price_flags]
        if reasons:
            watch.append({
                "id": wo.id, "title": wo.title, "vehicle_label": convoy_svc.vehicle_label(wo.vehicle) or "",
                "amount": int(wo.total_cost or 0), "expense_status": expense, "reasons": reasons,
            })

    # Pannes qui reviennent (12 mois glissants jusqu'à la fin de période)
    year_orders = db.query(models.WorkOrder).filter(
        models.WorkOrder.company_id == company_id, models.WorkOrder.created_at >= hi - timedelta(days=365), models.WorkOrder.created_at < hi
    ).options(selectinload(models.WorkOrder.lines)).all()
    repeat: dict[tuple[int, str], int] = defaultdict(int)
    for wo in year_orders:
        comp = iv_svc.component_of(" ".join([wo.title, *(line.label for line in wo.lines)]))
        if comp and comp not in iv_svc.ROUTINE_COMPONENTS:
            repeat[(wo.vehicle_id, comp)] += 1
    repeated = sorted(
        ({"vehicle_label": rows[vid]["label"], "component": comp, "count": n} for (vid, comp), n in repeat.items() if n >= 3 and vid in rows),
        key=lambda r: -r["count"],
    )

    # Départs
    departures = db.query(models.Departure).filter(
        models.Departure.company_id == company_id, models.Departure.scheduled_at >= lo, models.Departure.scheduled_at < hi,
        models.Departure.status != models.DepartureStatus.CANCELLED,
    ).all()
    for d in departures:
        if d.vehicle_id in rows:
            rows[d.vehicle_id]["departures"] += 1
    alert_counts = defaultdict(int)
    for a in db.query(models.Alert).filter(
        models.Alert.company_id == company_id, models.Alert.created_at >= lo, models.Alert.created_at < hi,
        models.Alert.alert_type.in_([models.AlertType.DEPARTURE_BLOCKED, models.AlertType.DEPARTURE_WARNING, models.AlertType.INVOICE_MISSING]),
    ):
        alert_counts[a.alert_type.value] += 1

    # Convois partis sur la période
    settings = crud.get_company_settings(db, company_id)
    convoys = db.query(models.Convoy).filter(
        models.Convoy.company_id == company_id, models.Convoy.departure_at >= lo, models.Convoy.departure_at < hi,
        models.Convoy.status.in_([models.ConvoyStatus.CONFIRMED, models.ConvoyStatus.DONE]),
    ).options(selectinload(models.Convoy.segments), selectinload(models.Convoy.payments)).order_by(models.Convoy.departure_at).all()
    convoy_rows = []
    for c in convoys:
        acc = convoy_svc.compute_account(c, settings)
        convoy_rows.append({
            "id": c.id, "number": c.number, "title": c.title, "departure_at": c.departure_at,
            "vehicle_label": rows[c.vehicle_id]["label"] if c.vehicle_id in rows else None,
            "revenue": acc["revenue"], "charges": acc["charges"], "margin": acc["margin"],
            "verdict": acc["verdict"], "verdict_label": acc["verdict_label"], "balance": acc["balance"],
        })
        if c.vehicle_id in rows:
            rows[c.vehicle_id]["convoys"] += 1
            rows[c.vehicle_id]["convoy_revenue"] += acc["revenue"]

    # À prévoir : besoins ouverts (état actuel, pour le point du lundi)
    needs = db.query(models.VehicleNeed).filter(
        models.VehicleNeed.company_id == company_id, models.VehicleNeed.status.in_(OPEN_NEEDS)
    ).all()
    for n in needs:
        if n.vehicle_id in rows:
            rows[n.vehicle_id]["needs_to_plan"] += n.estimated_cost or 0
    before_departure = sum(1 for n in needs if n.priority == models.NeedPriority.BEFORE_DEPARTURE)

    # Échéances des papiers dans les 30 jours (à partir d'aujourd'hui)
    today = date.today()
    docs = db.query(models.Document).filter(
        models.Document.company_id == company_id, models.Document.vehicle_id.isnot(None),
        models.Document.expiry_date.isnot(None), models.Document.expiry_date <= today + timedelta(days=30),
    ).order_by(models.Document.expiry_date).all()
    deadlines = [
        {"vehicle_label": rows[d.vehicle_id]["label"], "document": d.name or d.document_type,
         "expiry_date": d.expiry_date, "days_left": (d.expiry_date - today).days}
        for d in docs if d.vehicle_id in rows
    ]

    vehicle_rows = []
    for r in rows.values():
        r["fuel_liters"] = round(r["fuel_liters"], 1)
        r["total_cost"] = r["fuel"] + r["tolls"] + r["maintenance"]
        r["cost_per_km"] = round(r["total_cost"] / r["km"]) if r["km"] else None
        if r["total_cost"] or r["km"] or r["departures"] or r["convoys"] or r["needs_to_plan"]:
            vehicle_rows.append(r)
    vehicle_rows.sort(key=lambda r: -r["total_cost"])

    fuel = sum(r["fuel"] for r in rows.values())
    tolls = sum(r["tolls"] for r in rows.values())
    maintenance = sum(r["maintenance"] for r in rows.values())
    return {
        "start": start,
        "end": end,
        "label": _label(start, end),
        "totals": {
            "fuel": fuel,
            "tolls": tolls,
            "maintenance": maintenance,
            "expenses": fuel + tolls + maintenance,
            "km": sum(r["km"] for r in rows.values()),
            "departures": len(departures),
            "departures_departed": sum(1 for d in departures if d.status == models.DepartureStatus.DEPARTED),
            "exit_passes": sum(1 for d in departures if d.exit_pass_number),
            "convoys": len(convoy_rows),
            "convoy_revenue": sum(c["revenue"] for c in convoy_rows),
            "convoy_margin": sum(c["margin"] for c in convoy_rows),
            "convoy_balance_due": sum(max(c["balance"], 0) for c in convoy_rows),
            "needs_to_plan": sum(n.estimated_cost or 0 for n in needs),
            "needs_count": len(needs),
            "needs_before_departure": before_departure,
        },
        "compliance": {
            "departure_inspections": sum(1 for i in inspections if i.kind == models.InspectionKind.DEPARTURE),
            "arrival_inspections": sum(1 for i in inspections if i.kind == models.InspectionKind.ARRIVAL),
            "blocked_alerts": alert_counts[models.AlertType.DEPARTURE_BLOCKED.value],
            "warning_alerts": alert_counts[models.AlertType.DEPARTURE_WARNING.value],
            "invoice_missing_alerts": alert_counts[models.AlertType.INVOICE_MISSING.value],
        },
        "interventions": status_counts,
        "vehicles": vehicle_rows,
        "watch": watch,
        "repeated": repeated,
        "convoy_list": convoy_rows,
        "deadlines": deadlines,
    }
