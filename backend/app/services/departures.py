"""Autorisation de départ : check-list calculée par le système, bon de sortie signé, car de remplacement.

Règle : un seul point rouge bloque le départ ; personne ne peut le forcer.
Un point orange laisse partir mais alerte le superviseur.
"""
import base64
import hashlib
import hmac
import re
from datetime import date, datetime, timedelta, timezone

import segno
from fastapi import HTTPException
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app import crud, models, schemas
from app.core.config import get_settings
from app.services import inspections as insp_svc

R = models.Role
DStatus = models.DepartureStatus

WRITERS = insp_svc.WRITERS
REQUIRED_DOCUMENTS = {
    "insurance": "Assurance",
    "technical_control": "Visite technique",
    "registration_card": "Carte grise",
    "transport_card": "Carte de transporteur",
}
MIN_REST_HOURS = 10
EXIT_PASS_VALIDITY = timedelta(hours=1)
# Un bon de sortie ne s'émet pas plus de 3 h avant l'heure prévue.
ISSUE_WINDOW = timedelta(hours=3)
# L'état des lieux doit être récent et propre à ce départ.
INSPECTION_MAX_AGE = timedelta(hours=24)
NOTIFY_THROTTLE = timedelta(minutes=5)
DOCUMENTS_WITH_EXPIRY = {"insurance", "technical_control", "transport_card"}

OK, WARNING, BLOCKED, PENDING = "ok", "warning", "blocked", "pending"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _item(code: str, label: str, status: str, detail: str | None = None) -> dict:
    return {"code": code, "label": label, "status": status, "detail": detail}


# ───────────────────────── Lecture ─────────────────────────

def get_departure(db: Session, departure_id: int, company_id: int, user: models.User | None = None) -> models.Departure:
    dep = db.query(models.Departure).filter(models.Departure.id == departure_id, models.Departure.company_id == company_id).first()
    scope = insp_svc._station_scope(user)
    if not dep or (scope is not None and dep.station_id != scope):
        raise HTTPException(status_code=404, detail="Departure not found")
    return dep


def list_departures(
    db: Session,
    company_id: int,
    day: date | None = None,
    station_id: int | None = None,
    status: models.DepartureStatus | None = None,
    user: models.User | None = None,
) -> list[models.Departure]:
    q = (
        db.query(models.Departure)
        .filter(models.Departure.company_id == company_id)
        .options(
            joinedload(models.Departure.vehicle),
            joinedload(models.Departure.driver),
            joinedload(models.Departure.conveyor),
            joinedload(models.Departure.inspection).selectinload(models.Inspection.signatures),
        )
    )
    scope = insp_svc._station_scope(user)
    if scope is not None:
        station_id = scope
    if station_id:
        q = q.filter(models.Departure.station_id == station_id)
    if status:
        q = q.filter(models.Departure.status == status)
    if day:
        start = datetime.combine(day, datetime.min.time())
        q = q.filter(models.Departure.scheduled_at >= start, models.Departure.scheduled_at < start + timedelta(days=1))
    return q.order_by(models.Departure.scheduled_at).limit(200).all()


# ───────────────────────── Check-list ─────────────────────────

def _vehicle_documents(db: Session, vehicle_id: int) -> dict[str, list[models.Document]]:
    by_type: dict[str, list[models.Document]] = {}
    for doc in db.query(models.Document).filter(
        models.Document.vehicle_id == vehicle_id, models.Document.document_type.in_(list(REQUIRED_DOCUMENTS))
    ):
        by_type.setdefault(doc.document_type, []).append(doc)
    return by_type


def _latest_document(docs: list[models.Document], doc_type: str) -> models.Document | None:
    if not docs:
        return None
    dated = [d for d in docs if d.expiry_date is not None]
    if doc_type in DOCUMENTS_WITH_EXPIRY:
        # Échéance la plus lointaine ; à défaut, le dernier document saisi (sans échéance → à compléter).
        return max(dated, key=lambda d: (d.expiry_date, d.id)) if dated else max(docs, key=lambda d: d.id)
    return max(docs, key=lambda d: (d.expiry_date or date.max, d.id))


def _document_items(db: Session, vehicle: models.Vehicle, on: date, warn_days: int) -> list[dict]:
    items = []
    all_docs = _vehicle_documents(db, vehicle.id)
    for doc_type, label in REQUIRED_DOCUMENTS.items():
        code = f"doc_{doc_type}"
        doc = _latest_document(all_docs.get(doc_type, []), doc_type)
        if doc is None:
            items.append(_item(code, label, BLOCKED, "Absent"))
        elif doc.expiry_date is None and doc_type in DOCUMENTS_WITH_EXPIRY:
            items.append(_item(code, label, WARNING, "Date d'échéance non saisie"))
        elif doc.expiry_date is None:
            items.append(_item(code, label, OK, "Présent"))
        elif doc.expiry_date < on:
            days = (on - doc.expiry_date).days
            items.append(_item(code, label, BLOCKED, f"Expiré le {_fmt(doc.expiry_date)} ({days} j)"))
        elif (doc.expiry_date - on).days < warn_days:
            items.append(_item(code, label, WARNING, f"Valide · expire dans {(doc.expiry_date - on).days} j"))
        else:
            items.append(_item(code, label, OK, f"Valide jusqu'au {_fmt(doc.expiry_date)}"))
    return items


def _has_category_d(categories: str | None) -> bool:
    return "D" in {c.strip().upper() for c in re.split(r"[,;/\s]+", categories or "") if c.strip()}


def _expiry_item(code: str, label: str, expiry: date | None, on: date, warn_days: int) -> dict:
    if expiry is None:
        return _item(code, label, WARNING, "Date d'expiration non saisie")
    if expiry < on:
        return _item(code, label, BLOCKED, f"Expiré le {_fmt(expiry)}")
    if (expiry - on).days < warn_days:
        return _item(code, label, WARNING, f"Expire dans {(expiry - on).days} j")
    return _item(code, label, OK, f"Valide jusqu'au {_fmt(expiry)}")


def _crew_items(db: Session, dep: models.Departure, on: date, warn_days: int, at: datetime) -> list[dict]:
    items = []
    driver = dep.driver
    if driver is None:
        items.append(_item("driver_license", "Permis du chauffeur (catégorie D)", BLOCKED, "Aucun chauffeur affecté"))
    else:
        if not _has_category_d(driver.license_categories):
            items.append(_item("driver_license", "Permis du chauffeur (catégorie D)", BLOCKED, "Catégorie D absente"))
        else:
            items.append(_expiry_item("driver_license", "Permis du chauffeur (catégorie D)", driver.license_expiry, on, warn_days))
        items.append(_expiry_item("driver_medical", "Visite médicale du chauffeur", driver.medical_visit_expiry, on, warn_days))
        last_arrival = (
            db.query(func.max(models.Inspection.arrived_at))
            .filter(
                models.Inspection.driver_id == driver.id,
                models.Inspection.kind == models.InspectionKind.ARRIVAL,
                models.Inspection.status == models.InspectionStatus.VALIDATED,
                models.Inspection.arrived_at < at,
            )
            .scalar()
        )
        label = f"Repos du chauffeur (≥ {MIN_REST_HOURS} h depuis la dernière arrivée)"
        if last_arrival is None:
            items.append(_item("driver_rest", label, OK, "Pas d'arrivée récente"))
        else:
            hours = int((at - last_arrival).total_seconds() // 3600)
            status = BLOCKED if hours < MIN_REST_HOURS else OK
            items.append(_item("driver_rest", label, status, f"{hours} h" + (f" (minimum {MIN_REST_HOURS} h)" if status == BLOCKED else "")))
    if dep.conveyor is None:
        items.append(_item("conveyor", "Convoyeur affecté", BLOCKED, "Aucun convoyeur"))
    else:
        items.append(_item("conveyor", "Convoyeur affecté", OK, f"{dep.conveyor.first_name} {dep.conveyor.last_name}"))
    return items


def _vehicle_items(db: Session, dep: models.Departure, warn_km: int) -> list[dict]:
    items = []
    vstatus = dep.vehicle.status
    if vstatus in (models.VehicleStatus.IN_MAINTENANCE, models.VehicleStatus.OUT_OF_SERVICE):
        detail = "En maintenance" if vstatus == models.VehicleStatus.IN_MAINTENANCE else "Hors service"
        items.append(_item("vehicle_status", "Car en service", BLOCKED, detail))
    else:
        items.append(_item("vehicle_status", "Car en service", OK, "Disponible"))

    insp = dep.inspection
    label = "État des lieux au départ validé"
    shared = (
        insp is not None
        and db.query(models.Departure.id)
        .filter(
            models.Departure.inspection_id == insp.id,
            models.Departure.id != dep.id,
            models.Departure.status != DStatus.CANCELLED,
        )
        .first()
        is not None
    )
    if insp is None:
        items.append(_item("inspection", label, BLOCKED, "État des lieux non fait"))
    elif insp.status != models.InspectionStatus.VALIDATED:
        items.append(_item("inspection", label, BLOCKED, "État des lieux en cours"))
    elif insp.vehicle_id != dep.vehicle_id:
        items.append(_item("inspection", label, BLOCKED, "État des lieux d'un autre car"))
    elif shared:
        items.append(_item("inspection", label, BLOCKED, "État des lieux déjà utilisé pour un autre départ"))
    elif insp.driver_id != dep.driver_id or insp.conveyor_id != dep.conveyor_id:
        items.append(_item("inspection", label, BLOCKED, "Équipage différent de celui de l'état des lieux"))
    elif insp.validated_at is not None and insp.validated_at < dep.scheduled_at - INSPECTION_MAX_AGE:
        items.append(_item("inspection", label, BLOCKED, "État des lieux trop ancien (plus de 24 h)"))
    elif insp.verdict == "unfit":
        items.append(_item("inspection", label, BLOCKED, f"{insp.score}/100 · inapte (KO bloquant)"))
    elif insp.verdict == "fit_with_reserves":
        items.append(_item("inspection", label, WARNING, f"{insp.score}/100 · avec réserves"))
    else:
        items.append(_item("inspection", label, OK, f"{insp.score}/100 · 0 bloquant"))

    due = dep.vehicle.oil_change_due_in_km
    if due is None:
        items.append(_item("oil_change", "Vidange non dépassée", WARNING, "Relevé de vidange non saisi"))
    elif due < 0:
        items.append(_item("oil_change", "Vidange non dépassée", BLOCKED, f"Dépassée de {-due} km"))
    elif due <= warn_km:
        items.append(_item("oil_change", "Vidange non dépassée", WARNING, f"{due} km restants"))
    else:
        items.append(_item("oil_change", "Vidange non dépassée", OK, f"{due} km restants"))

    consumption = dep.vehicle.fuel_consumption_l_100km
    liters = insp.fuel_liters if insp is not None else None
    if dep.distance_km and consumption and liters is not None:
        need = round(dep.distance_km * float(consumption) / 100)
        status = OK if liters >= need else BLOCKED
        items.append(_item("fuel", "Carburant suffisant pour l'étape", status, f"≈ {liters} L pour {need} L"))
    else:
        items.append(_item("fuel", "Carburant suffisant pour l'étape", WARNING, "Non évaluable (distance, consommation ou litres manquants)"))
    return items


def _operations_items(dep: models.Departure) -> list[dict]:
    insp = dep.inspection
    if insp is not None and insp.status == models.InspectionStatus.VALIDATED:
        last = max((s.signed_at for s in insp.signatures), default=None)
        signatures = _item("signatures", "Signatures : chef de gare, chauffeur, convoyeur", OK,
                           f"3 / 3 · {last:%H:%M}" if last else "3 / 3")
    else:
        signed = len(insp.signatures) if insp is not None else 0
        signatures = _item("signatures", "Signatures : chef de gare, chauffeur, convoyeur", BLOCKED, f"{signed} / 3")
    return [
        _item("roadmap", "Feuille de route et manifeste passagers", PENDING, "Reçus d'ITTS Gestion (pont à venir)"),
        signatures,
    ]


def compute_checklist(db: Session, dep: models.Departure, settings: models.CompanySettings | None = None) -> dict:
    settings = settings or crud.get_company_settings(db, dep.company_id)
    # Évaluée au plus tard de l'heure prévue et de maintenant : un départ en retard ou antidaté
    # ne profite jamais de papiers qui étaient encore valides à la date prévue.
    at = max(dep.scheduled_at, _now())
    on = at.date()
    groups = [
        {"key": "papers", "label": "Papiers du car", "items": _document_items(db, dep.vehicle, on, settings.document_warning_days)},
        {"key": "crew", "label": "Équipage", "items": _crew_items(db, dep, on, settings.document_warning_days, at)},
        {"key": "vehicle", "label": "Car", "items": _vehicle_items(db, dep, settings.oil_change_warning_km)},
        {"key": "operations", "label": "Exploitation", "items": _operations_items(dep)},
    ]
    statuses = [it for g in groups for it in g["items"]]
    blocked = [it for it in statuses if it["status"] == BLOCKED]
    if blocked:
        overall = "red"
    elif any(it["status"] == WARNING for it in statuses):
        overall = "orange"
    else:
        overall = "green"
    reason = f"{blocked[0]['label']} : {blocked[0]['detail']}" if blocked else None
    return {"status": overall, "blocking_reason": reason, "groups": groups}


def serialize(db: Session, dep: models.Departure, settings: models.CompanySettings | None = None) -> schemas.DepartureRead:
    read = schemas.DepartureRead.model_validate(dep)
    if dep.status in (DStatus.PLANNED, DStatus.AUTHORIZED):
        checklist = compute_checklist(db, dep, settings)
        read = read.model_copy(update={"checklist": schemas.DepartureChecklist.model_validate(checklist)})
    return read


# ───────────────────────── Saisie ─────────────────────────

def _check_refs(db: Session, company_id: int, data: dict, departure_id: int | None = None, scope: int | None = None) -> None:
    if data.get("driver_id") is not None and data.get("driver_id") == data.get("conveyor_id"):
        raise HTTPException(status_code=400, detail="Le chauffeur et le convoyeur doivent être deux personnes différentes")
    if data.get("station_id") is not None and not crud.get_station(db, data["station_id"], company_id):
        raise HTTPException(status_code=400, detail="Gare inconnue")
    for key in ("driver_id", "conveyor_id"):
        if data.get(key) is not None and not crud.get_driver(db, data[key], company_id):
            raise HTTPException(status_code=400, detail="Personne inconnue")
    if data.get("inspection_id") is not None:
        insp = db.query(models.Inspection).filter(models.Inspection.id == data["inspection_id"], models.Inspection.company_id == company_id).first()
        if not insp or insp.kind != models.InspectionKind.DEPARTURE or (scope is not None and insp.station_id != scope):
            raise HTTPException(status_code=400, detail="État des lieux de départ inconnu")
        used = (
            db.query(models.Departure.id)
            .filter(models.Departure.inspection_id == insp.id, models.Departure.status != DStatus.CANCELLED,
                    models.Departure.id != departure_id)
            .first()
        )
        if used:
            raise HTTPException(status_code=400, detail="Cet état des lieux sert déjà à un autre départ")


def create_departure(db: Session, company_id: int, user: models.User, payload: schemas.DepartureCreate) -> models.Departure:
    if not crud.get_vehicle(db, payload.vehicle_id, company_id):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    data = payload.model_dump()
    data["scheduled_at"] = _naive(data["scheduled_at"])
    scope = insp_svc._station_scope(user)
    data["station_id"] = scope if scope is not None else (data["station_id"] or user.station_id)
    _check_refs(db, company_id, data)
    dep = models.Departure(**data, company_id=company_id, created_by_id=user.id)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


def _ensure_open(dep: models.Departure) -> None:
    if dep.status in (DStatus.DEPARTED, DStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="Départ clôturé : il ne peut plus être modifié")


def _revoke_pass(dep: models.Departure) -> None:
    """Annule le bon de sortie : tout changement de car, d'équipage ou d'horaire impose une nouvelle vérification."""
    dep.status = DStatus.PLANNED
    dep.exit_pass_number = None
    dep.exit_pass_issued_at = None
    dep.exit_pass_valid_until = None
    dep.exit_pass_issued_by_id = None
    dep.exit_pass_status = None


def update_departure(db: Session, dep: models.Departure, payload: schemas.DepartureUpdate, user: models.User) -> models.Departure:
    _ensure_open(dep)
    data = payload.model_dump(exclude_unset=True)
    if insp_svc._station_scope(user) is not None:
        data.pop("station_id", None)
    if "scheduled_at" in data:
        data["scheduled_at"] = _naive(data["scheduled_at"])
    merged = {"driver_id": dep.driver_id, "conveyor_id": dep.conveyor_id, **data}
    _check_refs(db, dep.company_id, merged, departure_id=dep.id, scope=insp_svc._station_scope(user))
    sensitive = {"scheduled_at", "driver_id", "conveyor_id", "inspection_id", "distance_km", "station_id"}
    if dep.status == DStatus.AUTHORIZED and any(k in data and data[k] != getattr(dep, k) for k in sensitive):
        _revoke_pass(dep)
    for field, value in data.items():
        setattr(dep, field, value)
    db.commit()
    db.refresh(dep)
    return dep


def cancel_departure(db: Session, dep: models.Departure) -> models.Departure:
    _ensure_open(dep)
    _revoke_pass(dep)
    dep.status = DStatus.CANCELLED
    db.commit()
    db.refresh(dep)
    return dep


def mark_departed(db: Session, dep: models.Departure) -> models.Departure:
    if dep.status != DStatus.AUTHORIZED:
        raise HTTPException(status_code=409, detail="Pas de bon de sortie valide pour ce départ")
    if dep.exit_pass_valid_until is None or _now() > dep.exit_pass_valid_until:
        raise HTTPException(status_code=409, detail="Bon de sortie expiré : refaites l'autorisation")
    checklist = compute_checklist(db, dep)
    if checklist["status"] == "red":
        _revoke_pass(dep)
        db.commit()
        raise HTTPException(status_code=409, detail=f"Départ bloqué depuis l'émission du bon : {checklist['blocking_reason']}")
    dep.status = DStatus.DEPARTED
    dep.departed_at = _now()
    db.commit()
    db.refresh(dep)
    return dep


# ───────────────────────── Bon de sortie ─────────────────────────

def _alert(db: Session, dep: models.Departure, alert_type: models.AlertType, severity: str, title: str, message: str) -> None:
    existing = (
        db.query(models.Alert)
        .filter(models.Alert.company_id == dep.company_id, models.Alert.vehicle_id == dep.vehicle_id,
                models.Alert.alert_type == alert_type, models.Alert.title == title)
        .order_by(models.Alert.created_at.desc())
        .first()
    )
    if existing is not None and (not existing.is_read or existing.created_at > _now() - NOTIFY_THROTTLE):
        existing.message = message  # alerte encore ouverte ou toute récente : on la met à jour, sans doublon
        return
    db.add(models.Alert(company_id=dep.company_id, vehicle_id=dep.vehicle_id, driver_id=dep.driver_id,
                        alert_type=alert_type, severity=severity, title=title, message=message, due_date=dep.scheduled_at.date()))


def _pass_number(db: Session, dep: models.Departure) -> str:
    plate = re.sub(r"[^A-Z0-9]", "", dep.vehicle.registration.upper()) or str(dep.vehicle_id)
    base = f"AD-{plate}-{dep.scheduled_at:%m%d}"
    taken = {n for (n,) in db.query(models.Departure.exit_pass_number).filter(
        models.Departure.company_id == dep.company_id, models.Departure.exit_pass_number.like(f"{base}-%"))}
    index = 1
    while f"{base}-{index:02d}" in taken:
        index += 1
    return f"{base}-{index:02d}"


def issue_exit_pass(db: Session, dep: models.Departure, user: models.User) -> models.Departure:
    _ensure_open(dep)
    if dep.status == DStatus.AUTHORIZED:
        raise HTTPException(status_code=409, detail="Un bon de sortie a déjà été émis pour ce départ")
    if dep.scheduled_at - _now() > ISSUE_WINDOW:
        raise HTTPException(status_code=409, detail="Trop tôt : le bon de sortie s'émet au plus 3 h avant le départ")
    snapshot = dep.updated_at
    # Toujours recalculée au moment d'émettre : jamais de décision sur un affichage périmé.
    checklist = compute_checklist(db, dep)
    vehicle = dep.vehicle.registration
    if checklist["status"] == "red":
        _alert(db, dep, models.AlertType.DEPARTURE_BLOCKED, "critical", f"Départ bloqué · {vehicle}", checklist["blocking_reason"])
        db.commit()
        raise HTTPException(status_code=409, detail=f"Départ bloqué : {checklist['blocking_reason']}")
    claimed = 0
    for _attempt in range(3):
        number = _pass_number(db, dep)
        try:
            # Verrou optimiste : le départ ne doit pas avoir changé depuis le calcul de la check-list.
            claimed = db.execute(
                update(models.Departure)
                .where(models.Departure.id == dep.id, models.Departure.status == DStatus.PLANNED,
                       models.Departure.updated_at == snapshot)
                .values(
                    status=DStatus.AUTHORIZED,
                    exit_pass_number=number,
                    exit_pass_issued_at=_now(),
                    exit_pass_valid_until=max(dep.scheduled_at, _now()) + EXIT_PASS_VALIDITY,
                    exit_pass_issued_by_id=user.id,
                    exit_pass_status=checklist["status"],
                    updated_at=_now(),
                )
            ).rowcount
            break
        except IntegrityError:
            db.rollback()  # numéro pris en même temps par une autre émission : on recalcule
    if not claimed:
        db.rollback()
        raise HTTPException(status_code=409, detail="Un bon de sortie a déjà été émis pour ce départ")
    if checklist["status"] == "orange":
        warnings = [f"{it['label']} : {it['detail']}" for g in checklist["groups"] for it in g["items"] if it["status"] == WARNING]
        _alert(db, dep, models.AlertType.DEPARTURE_WARNING, "warning", f"Départ avec réserves · {vehicle} · {number}", " ; ".join(warnings))
    db.commit()
    db.refresh(dep)
    return dep


def notify_supervisor(db: Session, dep: models.Departure) -> None:
    _ensure_open(dep)
    checklist = compute_checklist(db, dep)
    reason = checklist["blocking_reason"] or "Vérification demandée par la gare"
    _alert(db, dep, models.AlertType.DEPARTURE_BLOCKED, "critical", f"Départ à arbitrer · {dep.vehicle.registration}", reason)
    db.commit()


def _sign(payload: str) -> str:
    key = get_settings().SECRET_KEY.encode()
    return hmac.new(key, f"exit-pass:{payload}".encode(), hashlib.sha256).hexdigest()[:32]


def _ts(value: datetime) -> int:
    """Horodatage en microsecondes : deux émissions successives ne produisent jamais le même jeton."""
    value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp()) * 1_000_000 + value.microsecond


def make_token(dep: models.Departure) -> str:
    # L'heure d'émission signée rend inutilisable un ancien QR après annulation et réémission.
    payload = f"{dep.id}.{dep.exit_pass_number}.{_ts(dep.exit_pass_issued_at)}"
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return f"{encoded}.{_sign(payload)}"


def exit_pass(dep: models.Departure) -> dict:
    if dep.status not in (DStatus.AUTHORIZED, DStatus.DEPARTED) or not dep.exit_pass_number:
        raise HTTPException(status_code=404, detail="Aucun bon de sortie pour ce départ")
    token = make_token(dep)
    url = f"{get_settings().PUBLIC_APP_URL.rstrip('/')}/exit-pass/{token}"
    svg = segno.make(url, error="m").svg_inline(scale=4, border=2, dark="#111827", light="#ffffff")
    return {
        "number": dep.exit_pass_number,
        "valid_until": dep.exit_pass_valid_until,
        "issued_at": dep.exit_pass_issued_at,
        "status": dep.exit_pass_status or "green",
        "token": token,
        "verify_url": url,
        "qr_svg": svg,
    }


def verify_token(db: Session, token: str) -> dict:
    """Vérification publique (scan au portail) : ne renvoie ni nom ni donnée personnelle."""
    invalid = {"valid": False, "reason": "Bon de sortie invalide"}
    try:
        encoded, signature = token.rsplit(".", 1)
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
        dep_id, number, issued = payload.split(".")
        dep_id_int, issued_int = int(dep_id), int(issued)
        if not hmac.compare_digest(signature.encode(), _sign(payload).encode()):
            return invalid
    except (ValueError, TypeError, UnicodeError):
        return invalid
    dep = db.get(models.Departure, dep_id_int)
    if (dep is None or dep.exit_pass_number != number or dep.exit_pass_issued_at is None
            or _ts(dep.exit_pass_issued_at) != issued_int):
        return {**invalid, "reason": "Bon de sortie annulé ou remplacé"}
    base = {"number": number, "registration": dep.vehicle.registration, "route_label": dep.route_label,
            "valid_until": dep.exit_pass_valid_until}
    if dep.status == DStatus.CANCELLED:
        return {**base, "valid": False, "reason": "Départ annulé"}
    if dep.status == DStatus.DEPARTED:
        return {**base, "valid": False, "reason": f"Car déjà sorti à {dep.departed_at:%H:%M}" if dep.departed_at else "Car déjà sorti"}
    if dep.status != DStatus.AUTHORIZED:
        return {**base, "valid": False, "reason": "Bon de sortie annulé"}
    if dep.exit_pass_valid_until is None or _now() > dep.exit_pass_valid_until:
        return {**base, "valid": False, "reason": "Bon de sortie expiré"}
    # Revérifié au scan : un document supprimé ou un car mis en maintenance depuis l'émission invalide le bon.
    if compute_checklist(db, dep)["status"] == "red":
        return {**base, "valid": False, "reason": "Départ bloqué depuis l'émission du bon"}
    return {**base, "valid": True, "reason": None}


# ───────────────────────── Remplacement ─────────────────────────

def _car_ok(db: Session, vehicle: models.Vehicle, on: date, warn_days: int) -> tuple[bool, str]:
    docs = _document_items(db, vehicle, on, warn_days)
    if any(d["status"] == BLOCKED for d in docs):
        return False, "blocked"
    due = vehicle.oil_change_due_in_km
    if due is not None and due < 0:
        return False, "blocked"
    return True, "warning" if any(d["status"] == WARNING for d in docs) else "ok"


def replacement_candidates(db: Session, dep: models.Departure) -> list[dict]:
    settings = crud.get_company_settings(db, dep.company_id)
    on = dep.scheduled_at.date()
    busy = {
        vid for (vid,) in db.query(models.Departure.vehicle_id).filter(
            models.Departure.company_id == dep.company_id,
            models.Departure.status.in_([DStatus.PLANNED, DStatus.AUTHORIZED]),
            models.Departure.id != dep.id,
            models.Departure.scheduled_at >= dep.scheduled_at - timedelta(hours=6),
            models.Departure.scheduled_at <= dep.scheduled_at + timedelta(hours=6),
        )
    }
    vehicles = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.company_id == dep.company_id, models.Vehicle.id != dep.vehicle_id,
                models.Vehicle.status == models.VehicleStatus.AVAILABLE)
        .all()
    )
    out = []
    for v in vehicles:
        if v.id in busy:
            continue
        ok, docs_status = _car_ok(db, v, on, settings.document_warning_days)
        if not ok:
            continue
        last = (
            db.query(models.Inspection.score)
            .filter(models.Inspection.vehicle_id == v.id, models.Inspection.status == models.InspectionStatus.VALIDATED,
                    models.Inspection.kind == models.InspectionKind.DEPARTURE)
            .order_by(models.Inspection.validated_at.desc())
            .first()
        )
        out.append({
            "vehicle": {"id": v.id, "registration": v.registration, "brand": v.brand, "model": v.model},
            "last_score": last[0] if last else None,
            "oil_change_due_in_km": v.oil_change_due_in_km,
            "documents_status": docs_status,
        })
    out.sort(key=lambda c: (c["documents_status"] != "ok", -(c["last_score"] or 0), -(c["oil_change_due_in_km"] or 0)))
    return out


def replace_vehicle(db: Session, dep: models.Departure, vehicle_id: int) -> models.Departure:
    _ensure_open(dep)
    if vehicle_id not in {c["vehicle"]["id"] for c in replacement_candidates(db, dep)}:
        raise HTTPException(status_code=409, detail="Ce car n'est pas en règle ou n'est pas disponible")
    _revoke_pass(dep)
    dep.vehicle_id = vehicle_id
    dep.inspection_id = None  # un nouvel état des lieux est obligatoire pour le car de remplacement
    db.commit()
    db.refresh(dep)
    return dep
