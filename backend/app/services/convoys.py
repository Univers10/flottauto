"""Convois : fiche, compte du convoi, aide à la décision, paiements et contrat de transport.

Le compte est recalculé à chaque lecture à partir des Paramètres (gasoil, rations, commission,
recette de ligne de référence) : rien n'est figé tant que le contrat n'est pas généré.
Valider un convoi génère le contrat et crée son départ : pas de bon de sortie tant que le solde n'est pas réglé.
"""
import math
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import crud, models, schemas
from app.services import departures as dep_svc

R = models.Role
CStatus = models.ConvoyStatus
DStatus = models.DepartureStatus

WRITERS = (R.SUPER_ADMIN, R.ADMIN, R.MANAGER, R.OPERATIONS_SUPERVISOR)
CASHIERS = WRITERS + (R.ACCOUNTANT, R.STATION_MANAGER)
READERS = CASHIERS + (R.READER,)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _round(value: float) -> int:
    return int(math.floor(value + 0.5))


def money(value: int) -> str:
    return f"{value:,}".replace(",", " ") + " F"


def _ratio(value: float) -> str:
    return f"{value:g}".replace(".", ",")


def vehicle_label(vehicle: models.Vehicle | None) -> str | None:
    if vehicle is None:
        return None
    if vehicle.fleet_number:
        seats = f" · {vehicle.seats} places" if vehicle.seats else ""
        return f"Car N°{vehicle.fleet_number}{seats}"
    return vehicle.registration


def _person(driver: models.Driver | None) -> str | None:
    return f"{driver.first_name} {driver.last_name}".strip() if driver else None


def itinerary(convoy: models.Convoy) -> str:
    if not convoy.segments:
        return ""
    stops = [convoy.segments[0].from_label] + [s.to_label for s in convoy.segments]
    return " – ".join(stops)


# ───────────────────────── Compte du convoi ─────────────────────────

def days_of(convoy: models.Convoy) -> int:
    if convoy.departure_at is None or convoy.return_date is None:
        return 0
    return max((convoy.return_date - convoy.departure_at.date()).days + 1, 1)


def compute_account(convoy: models.Convoy, settings: models.CompanySettings) -> dict:
    km = sum(s.km for s in convoy.segments)
    price = sum(s.price_per_seat for s in convoy.segments)
    seats = convoy.seats_sold or 0
    days = days_of(convoy)
    rate = convoy.daily_rate if convoy.daily_rate is not None else settings.immobilization_daily_rate
    transport = price * seats
    immobilization = rate * (convoy.billed_days or 0)
    revenue = transport + immobilization

    vehicle = convoy.vehicle
    consumption = float(vehicle.fuel_consumption_l_100km) if vehicle and vehicle.fuel_consumption_l_100km else float(
        settings.convoy_consumption_l_100km)
    liters = _round(km * consumption / 100)
    fuel = liters * settings.diesel_price_per_liter
    drivers = 2 if convoy.relief_driver_id else 1
    driver_rations = drivers * days * settings.driver_daily_ration
    conveyor_rations = days * settings.conveyor_daily_ration
    pct = float(convoy.commission_pct if convoy.commission_pct is not None else settings.broker_commission_pct)
    commission = _round(revenue * pct / 100) if convoy.broker_name else 0
    tolls = convoy.tolls_estimate or 0

    revenue_lines = [
        {"label": "Transport", "detail": f"{money(price)} × {seats} places", "amount": transport},
        {"label": "Immobilisation", "detail": f"{money(rate)} × {convoy.billed_days or 0} j", "amount": immobilization},
    ]
    charge_lines = [
        {"label": "Carburant", "detail": f"{km} km × {consumption:g} L/100 = {liters} L × {money(settings.diesel_price_per_liter)}",
         "amount": fuel},
        {"label": "Ration chauffeurs", "detail": f"{drivers} × {days} j × {money(settings.driver_daily_ration)}", "amount": driver_rations},
        {"label": "Ration convoyeur", "detail": f"1 × {days} j × {money(settings.conveyor_daily_ration)}", "amount": conveyor_rations},
        {"label": "Péages", "detail": "estimation de l'itinéraire", "amount": tolls},
    ]
    if convoy.broker_name:
        charge_lines.append({"label": f"Commission apporteur ({pct:g} %)", "detail": convoy.broker_name, "amount": commission})
    charges = fuel + driver_rations + conveyor_rations + tolls + commission
    margin = revenue - charges
    line = settings.line_revenue_per_bus_day
    revenue_per_day = revenue // days if days else None
    ratio = round(revenue_per_day / line, 1) if revenue_per_day is not None and line else None
    floor = charges + line * days
    paid = sum(p.amount for p in convoy.payments)

    if not convoy.segments or seats == 0 or days == 0:
        verdict, label, detail = "incomplete", "À COMPLÉTER", "Renseignez l'itinéraire, les places vendues et les dates."
    elif margin < 0:
        verdict, label, detail = "loss", "À PERTE", f"Le convoi coûte plus qu'il ne rapporte. Prix plancher : {money(floor)}."
    elif line and revenue_per_day < line:
        verdict, label, detail = "weak", "PEU RENTABLE", (
            f"Moins qu'une journée de ligne (×{_ratio(ratio)}). Négocier au-dessus de {money(floor)}."
            if ratio is not None else f"Négocier au-dessus de {money(floor)}.")
    else:
        verdict, label, detail = "profitable", "RENTABLE", (
            f"×{_ratio(ratio)} une journée de ligne. À accepter." if ratio is not None else "À accepter.")

    alerts = []
    billed = convoy.billed_days or 0
    if days and billed < days:
        missing = days - billed
        alerts.append(
            f"{days} jours d'immobilisation, mais seulement {billed} jour(s) facturé(s) ({billed} × {money(rate)}). "
            f"{missing} jour(s) de car non payé(s), soit ≈ {money(line * missing)} de recette de ligne perdue."
        )
    if vehicle and vehicle.seats and seats > vehicle.seats:
        alerts.append(f"Places vendues ({seats}) supérieures aux places du car ({vehicle.seats}).")
    if verdict in ("profitable", "weak") and revenue < floor:
        alerts.append(f"Prix global sous le prix plancher conseillé ({money(floor)}).")
    if paid > revenue:
        alerts.append(f"Trop-perçu de {money(paid - revenue)} : vérifiez les paiements ou le prix.")

    return {
        "km": km,
        "days": days,
        "price_per_seat": price,
        "revenue_lines": revenue_lines,
        "charge_lines": charge_lines,
        "revenue": revenue,
        "charges": charges,
        "margin": margin,
        "margin_pct": round(margin * 100 / revenue, 1) if revenue else None,
        "revenue_per_day": revenue_per_day,
        "line_revenue_per_day": line,
        "line_ratio": ratio,
        "margin_per_km": margin // km if km else None,
        "margin_per_day": margin // days if days else None,
        "break_even_seats": max(math.ceil((charges - immobilization) / price), 0) if price else None,
        "fuel_share_pct": round(fuel * 100 / charges) if charges else None,
        "floor_price": floor,
        "verdict": verdict,
        "verdict_label": label,
        "verdict_detail": detail,
        "paid": paid,
        "balance": max(revenue - paid, 0),
        "alerts": alerts,
    }


def balance_due(db: Session, convoy: models.Convoy) -> int:
    return compute_account(convoy, crud.get_company_settings(db, convoy.company_id))["balance"]


# ───────────────────────── Lecture ─────────────────────────

def _query(db: Session, company_id: int):
    return (
        db.query(models.Convoy)
        .filter(models.Convoy.company_id == company_id)
        .options(selectinload(models.Convoy.segments), selectinload(models.Convoy.payments))
    )


def get_convoy(db: Session, convoy_id: int, company_id: int) -> models.Convoy:
    convoy = _query(db, company_id).filter(models.Convoy.id == convoy_id).first()
    if convoy is None:
        raise HTTPException(status_code=404, detail="Convoi introuvable")
    return convoy


def list_convoys(db: Session, company_id: int, status: models.ConvoyStatus | None = None, q: str | None = None) -> list[models.Convoy]:
    query = _query(db, company_id)
    if status:
        query = query.filter(models.Convoy.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            models.Convoy.title.ilike(like) | models.Convoy.number.ilike(like) | models.Convoy.client_name.ilike(like)
        )
    return query.order_by(models.Convoy.departure_at.is_(None), models.Convoy.departure_at.desc(), models.Convoy.id.desc()).limit(200).all()


def _departure(db: Session, convoy: models.Convoy) -> models.Departure | None:
    return (
        db.query(models.Departure)
        .filter(models.Departure.convoy_id == convoy.id, models.Departure.company_id == convoy.company_id)
        .order_by(models.Departure.id.desc())
        .first()
    )


def serialize(db: Session, convoy: models.Convoy, settings: models.CompanySettings | None = None) -> schemas.ConvoyRead:
    settings = settings or crud.get_company_settings(db, convoy.company_id)
    read = schemas.ConvoyRead.model_validate(convoy)
    docs = []
    if convoy.vehicle is not None:
        # Papiers jugés au retour : un document qui expire pendant le voyage est un problème.
        on = convoy.return_date or (convoy.departure_at.date() if convoy.departure_at else _now().date())
        docs = dep_svc._document_items(db, convoy.vehicle, on, settings.document_warning_days)
    dep = _departure(db, convoy)
    crew = {k: v for k, v in {
        "driver": _person(convoy.driver),
        "relief_driver": _person(convoy.relief_driver),
        "conveyor": _person(convoy.conveyor),
        "backup_vehicle": vehicle_label(convoy.backup_vehicle),
        "station": convoy.station.name if convoy.station else None,
    }.items() if v}
    return read.model_copy(update={
        "account": schemas.ConvoyAccount.model_validate(compute_account(convoy, settings)),
        "vehicle_documents": [schemas.ChecklistItem.model_validate(d) for d in docs],
        "departure_id": dep.id if dep else None,
        "vehicle_label": vehicle_label(convoy.vehicle),
        "crew_labels": crew,
    })


# ───────────────────────── Saisie ─────────────────────────

def _next_number(db: Session, company_id: int, prefix: str, year: int) -> str:
    stem = f"{prefix}-{year}-"
    numbers = db.query(models.Convoy.number).filter(models.Convoy.company_id == company_id, models.Convoy.number.like(f"{stem}%"))
    # Comparaison numérique : « 1000 » vient après « 999 ».
    seqs = [int(n.rsplit("-", 1)[1]) for (n,) in numbers if n.rsplit("-", 1)[1].isdigit()]
    return f"{stem}{max(seqs, default=0) + 1:03d}"


def _check_refs(db: Session, company_id: int, data: dict) -> None:
    for key in ("vehicle_id", "backup_vehicle_id"):
        if data.get(key) is not None and not crud.get_vehicle(db, data[key], company_id):
            raise HTTPException(status_code=400, detail="Car inconnu")
    for key in ("driver_id", "relief_driver_id", "conveyor_id"):
        if data.get(key) is not None and not crud.get_driver(db, data[key], company_id):
            raise HTTPException(status_code=400, detail="Personne inconnue")
    if data.get("station_id") is not None and not crud.get_station(db, data["station_id"], company_id):
        raise HTTPException(status_code=400, detail="Gare inconnue")
    if data.get("vehicle_id") is not None and data.get("vehicle_id") == data.get("backup_vehicle_id"):
        raise HTTPException(status_code=400, detail="Le car de secours doit être un autre car")
    people = [data.get(k) for k in ("driver_id", "relief_driver_id", "conveyor_id") if data.get(k) is not None]
    if len(people) != len(set(people)):
        raise HTTPException(status_code=400, detail="Chauffeur, chauffeur relais et convoyeur doivent être trois personnes différentes")
    if data.get("departure_at") and data.get("return_date") and data["return_date"] < data["departure_at"].date():
        raise HTTPException(status_code=400, detail="La date de retour est avant le départ")


def _apply(convoy: models.Convoy, data: dict) -> None:
    segments = data.pop("segments", None)
    for field, value in data.items():
        setattr(convoy, field, value)
    if segments is not None:
        convoy.segments = [models.ConvoySegment(position=i + 1, **seg) for i, seg in enumerate(segments)]


def _clean(payload: schemas.ConvoyBase) -> dict:
    data = payload.model_dump(exclude_unset=True)
    if data.get("departure_at") is not None:
        data["departure_at"] = dep_svc._naive(data["departure_at"])
    for key in ("seats_sold", "billed_days", "tolls_estimate"):
        if key in data and data[key] is None:
            data[key] = 0
    if "title" in data and data["title"] is None:
        data.pop("title")
    if "purpose" in data and data["purpose"] is None:
        data["purpose"] = models.ConvoyPurpose.OTHER
    return data


def create_convoy(db: Session, company_id: int, user: models.User, payload: schemas.ConvoyCreate) -> models.Convoy:
    data = _clean(payload)
    _check_refs(db, company_id, data)
    settings = crud.get_company_settings(db, company_id)
    year = (data.get("departure_at") or _now()).year
    for _ in range(5):
        convoy = models.Convoy(company_id=company_id, created_by_id=user.id,
                               number=_next_number(db, company_id, settings.convoy_number_prefix or "CV", year))
        _apply(convoy, dict(data))
        db.add(convoy)
        try:
            db.commit()
            return get_convoy(db, convoy.id, company_id)
        except IntegrityError:
            db.rollback()  # numéro pris en parallèle : on recommence
    raise HTTPException(status_code=409, detail="Numéro de convoi indisponible, réessayez")


def _ensure_open(convoy: models.Convoy) -> None:
    if convoy.status in (CStatus.DONE, CStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="Convoi clôturé : il ne peut plus être modifié")


def _sync_departure(db: Session, convoy: models.Convoy) -> None:
    """Car, équipage ou horaire changés après le contrat : le départ suit, son bon de sortie est annulé."""
    dep = _departure(db, convoy)
    if dep is None or dep.status in (DStatus.DEPARTED, DStatus.CANCELLED):
        return
    values = {
        "vehicle_id": convoy.vehicle_id,
        "driver_id": convoy.driver_id,
        "conveyor_id": convoy.conveyor_id,
        "scheduled_at": convoy.departure_at,
        "station_id": convoy.station_id,
    }
    # Car, chauffeur et date restent obligatoires ; convoyeur et gare peuvent être retirés.
    optional = {"conveyor_id", "station_id"}
    changed = {k: v for k, v in values.items() if (v is not None or k in optional) and getattr(dep, k) != v}
    if not changed:
        return
    if dep.status == DStatus.AUTHORIZED:
        dep_svc._revoke_pass(dep)
    if "vehicle_id" in changed:
        dep.inspection_id = None
    for k, v in changed.items():
        setattr(dep, k, v)


def update_convoy(db: Session, convoy: models.Convoy, payload: schemas.ConvoyUpdate) -> models.Convoy:
    _ensure_open(convoy)
    data = _clean(payload)
    current = {k: getattr(convoy, k) for k in (
        "vehicle_id", "backup_vehicle_id", "driver_id", "relief_driver_id", "conveyor_id", "station_id", "departure_at", "return_date")}
    _check_refs(db, convoy.company_id, {**current, **data})
    if convoy.status == CStatus.CONFIRMED:
        for key in ("vehicle_id", "driver_id", "departure_at"):
            if key in data and data[key] is None:
                raise HTTPException(status_code=400, detail="Contrat généré : le car, le chauffeur et la date restent obligatoires")
        if "segments" in data and not data["segments"]:
            raise HTTPException(status_code=400, detail="Contrat généré : l'itinéraire reste obligatoire")
    _apply(convoy, data)
    db.flush()
    if convoy.status == CStatus.CONFIRMED:
        _sync_departure(db, convoy)
    db.commit()
    return get_convoy(db, convoy.id, convoy.company_id)


def missing_for_contract(convoy: models.Convoy) -> list[str]:
    checks = {
        "le client": bool(convoy.client_name),
        "l'itinéraire": bool(convoy.segments),
        "la date et l'heure de départ": convoy.departure_at is not None,
        "la date de retour": convoy.return_date is not None,
        "les places vendues": (convoy.seats_sold or 0) > 0,
        "le car": convoy.vehicle_id is not None,
        "le chauffeur": convoy.driver_id is not None,
        "des tarifs (prix global à 0 F)": any(s.price_per_seat for s in convoy.segments) or (convoy.billed_days or 0) > 0,
    }
    return [label for label, ok in checks.items() if not ok]


def confirm_convoy(db: Session, convoy: models.Convoy, user: models.User) -> models.Convoy:
    """« Valider et générer le contrat » : fige le contrat et crée le départ du convoi."""
    if convoy.status != CStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Ce convoi est déjà validé")
    missing = missing_for_contract(convoy)
    if missing:
        raise HTTPException(status_code=400, detail="Pour générer le contrat, complétez : " + ", ".join(missing))
    # Tarifs figés au contrat : changer les Paramètres ensuite ne modifie pas le montant dû.
    settings = crud.get_company_settings(db, convoy.company_id)
    if convoy.daily_rate is None:
        convoy.daily_rate = settings.immobilization_daily_rate
    if convoy.commission_pct is None and convoy.broker_name:
        convoy.commission_pct = settings.broker_commission_pct
    # Le brouillon a pu être numéroté avant de connaître la date : le contrat porte l'année du voyage.
    prefix = convoy.number.rsplit("-", 2)[0]
    if not convoy.number.startswith(f"{prefix}-{convoy.departure_at.year}-"):
        convoy.number = _next_number(db, convoy.company_id, prefix, convoy.departure_at.year)
    convoy.status = CStatus.CONFIRMED
    convoy.contract_generated_at = _now()
    first_leg = convoy.segments[0].km if convoy.segments else None
    db.add(models.Departure(
        company_id=convoy.company_id,
        convoy_id=convoy.id,
        vehicle_id=convoy.vehicle_id,
        station_id=convoy.station_id,
        route_label=f"Convoi {convoy.number} · {itinerary(convoy)}"[:255],
        scheduled_at=convoy.departure_at,
        distance_km=first_leg or None,
        driver_id=convoy.driver_id,
        conveyor_id=convoy.conveyor_id,
        created_by_id=user.id,
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # numéro pris en parallèle
        raise HTTPException(status_code=409, detail="Numéro de contrat déjà pris, réessayez")
    return get_convoy(db, convoy.id, convoy.company_id)


def close_convoy(db: Session, convoy: models.Convoy, cancel: bool) -> models.Convoy:
    _ensure_open(convoy)
    if cancel:
        dep = _departure(db, convoy)
        if dep is not None and dep.status not in (DStatus.DEPARTED, DStatus.CANCELLED):
            dep_svc._revoke_pass(dep)
            dep.status = DStatus.CANCELLED
        convoy.status = CStatus.CANCELLED
    else:
        if convoy.status != CStatus.CONFIRMED:
            raise HTTPException(status_code=409, detail="Seul un convoi validé peut être terminé")
        convoy.status = CStatus.DONE
    db.commit()
    return get_convoy(db, convoy.id, convoy.company_id)


def delete_convoy(db: Session, convoy: models.Convoy) -> None:
    if convoy.status != CStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Seul un brouillon peut être supprimé ; annulez le convoi")
    db.delete(convoy)
    db.commit()


def add_payment(db: Session, convoy: models.Convoy, user: models.User, payload: schemas.ConvoyPaymentCreate) -> models.Convoy:
    if convoy.status == CStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Convoi annulé")
    data = payload.model_dump()
    data["paid_at"] = dep_svc._naive(data["paid_at"]) or _now()
    convoy.payments.append(models.ConvoyPayment(**data, created_by_id=user.id))
    db.commit()
    return get_convoy(db, convoy.id, convoy.company_id)


def delete_payment(db: Session, convoy: models.Convoy, payment_id: int) -> models.Convoy:
    payment = next((p for p in convoy.payments if p.id == payment_id), None)
    if payment is None:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    convoy.payments.remove(payment)
    db.commit()
    return get_convoy(db, convoy.id, convoy.company_id)
