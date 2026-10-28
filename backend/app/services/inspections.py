"""Règles métier des états des lieux : note, verdict, signatures, validation et effets (besoins, compteur)."""
import logging
import re
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, update
from sqlalchemy.orm import Session, selectinload

from app import crud, models, schemas
from app.services import checklists, needs
from app.utils.uploads import delete_private, save_private_image

R = models.Role
Kind = models.InspectionKind
Status = models.ItemStatus

# Rôles qui tiennent les états des lieux et signent comme « chef de gare ».
WRITERS = (R.SUPER_ADMIN, R.ADMIN, R.MANAGER, R.STATION_MANAGER, R.OPERATIONS_SUPERVISOR)
REQUIRED_SIGNATURES = {models.SignatureRole.STATION_MANAGER, models.SignatureRole.DRIVER, models.SignatureRole.CONVEYOR}
REPORT_DEADLINE_MINUTES = 60
FRESH_PHOTO_MINUTES = 10
MAX_MILEAGE_JUMP_KM = 3000

logger = logging.getLogger("flottauto.pin")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


# ───────────────────────── Lecture ─────────────────────────

def _station_scope(user: models.User | None) -> int | None:
    """Gare imposée : un chef de gare rattaché à une gare ne voit que les états des lieux de sa gare."""
    if user is not None and user.role == R.STATION_MANAGER and user.station_id is not None:
        return user.station_id
    return None


def get_inspection(db: Session, inspection_id: int, company_id: int, user: models.User | None = None) -> models.Inspection:
    insp = (
        db.query(models.Inspection)
        .filter(models.Inspection.id == inspection_id, models.Inspection.company_id == company_id)
        .first()
    )
    scope = _station_scope(user)
    if not insp or (scope is not None and insp.station_id != scope):
        raise HTTPException(status_code=404, detail="Inspection not found")
    return insp


def list_inspections(
    db: Session,
    company_id: int,
    vehicle_id: int | None = None,
    station_id: int | None = None,
    kind: models.InspectionKind | None = None,
    status: models.InspectionStatus | None = None,
    day: date | None = None,
    limit: int = 100,
    user: models.User | None = None,
) -> list[models.Inspection]:
    q = (
        db.query(models.Inspection)
        .filter(models.Inspection.company_id == company_id)
        .options(
            selectinload(models.Inspection.items),
            selectinload(models.Inspection.photos),
            selectinload(models.Inspection.signatures),
        )
    )
    scope = _station_scope(user)
    if scope is not None:
        station_id = scope
    if vehicle_id:
        q = q.filter(models.Inspection.vehicle_id == vehicle_id)
    if station_id:
        q = q.filter(models.Inspection.station_id == station_id)
    if kind:
        q = q.filter(models.Inspection.kind == kind)
    if status:
        q = q.filter(models.Inspection.status == status)
    if day:
        start = datetime.combine(day, datetime.min.time())
        q = q.filter(models.Inspection.created_at >= start, models.Inspection.created_at < start + timedelta(days=1))
    return q.order_by(models.Inspection.created_at.desc()).limit(limit).all()


def score_and_verdict(insp: models.Inspection) -> tuple[int | None, str | None]:
    """Note sur 100 (−6 par réserve, −20 par KO) et verdict, une fois tous les points renseignés.
    Une fois validé, on renvoie la note figée à la validation."""
    if insp.status == models.InspectionStatus.VALIDATED and insp.score is not None:
        return insp.score, insp.verdict
    if not insp.items or any(it.status is None for it in insp.items):
        return None, None
    reserves = sum(1 for it in insp.items if it.status == Status.RESERVE)
    kos = [it for it in insp.items if it.status == Status.KO]
    score = max(0, 100 - checklists.RESERVE_PENALTY * reserves - checklists.KO_PENALTY * len(kos))
    if any(it.section in checklists.BLOCKING_SECTIONS for it in kos):
        verdict = "unfit"
    elif reserves or kos:
        verdict = "fit_with_reserves"
    else:
        verdict = "fit"
    return score, verdict


def missing_photos(insp: models.Inspection) -> list[str]:
    taken = {p.slot for p in insp.photos}
    return [slot for slot in checklists.PHOTO_SLOTS if slot not in taken]


def is_ready_to_sign(insp: models.Inspection) -> bool:
    return insp.mileage is not None and not missing_photos(insp) and all(it.status is not None for it in insp.items)


def _report_delay(insp: models.Inspection) -> tuple[int | None, bool | None]:
    if insp.kind != Kind.ARRIVAL or insp.arrived_at is None:
        return None, None
    end = insp.validated_at or _now()
    minutes = max(0, int((end - insp.arrived_at).total_seconds() // 60))
    return minutes, minutes > REPORT_DEADLINE_MINUTES


def km_of_day(insp: models.Inspection) -> int | None:
    dep = insp.departure_inspection
    if insp.kind != Kind.ARRIVAL or dep is None or insp.mileage is None or dep.mileage is None:
        return None
    return max(0, insp.mileage - dep.mileage)


def serialize(insp: models.Inspection) -> schemas.InspectionRead:
    score, verdict = score_and_verdict(insp)
    delay, late = _report_delay(insp)
    read = schemas.InspectionRead.model_validate(insp)
    return read.model_copy(
        update={
            "score": score,
            "verdict": verdict,
            "missing_photos": missing_photos(insp),
            "ready_to_sign": is_ready_to_sign(insp),
            "km_of_day": km_of_day(insp),
            "report_delay_minutes": delay,
            "report_late": late,
        }
    )


def serialize_list_item(insp: models.Inspection) -> schemas.InspectionListItem:
    score, verdict = score_and_verdict(insp)
    item = schemas.InspectionListItem.model_validate(insp)
    return item.model_copy(
        update={"score": score, "verdict": verdict, "photos_count": len(insp.photos), "signatures_count": len(insp.signatures)}
    )


# ───────────────────────── Saisie ─────────────────────────

def _check_refs(db: Session, company_id: int, station_id: int | None, driver_id: int | None, conveyor_id: int | None) -> None:
    if driver_id is not None and driver_id == conveyor_id:
        raise HTTPException(status_code=400, detail="Le chauffeur et le convoyeur doivent être deux personnes différentes")
    if station_id is not None and not crud.get_station(db, station_id, company_id):
        raise HTTPException(status_code=400, detail="Gare inconnue")
    for person_id in (driver_id, conveyor_id):
        if person_id is not None and not crud.get_driver(db, person_id, company_id):
            raise HTTPException(status_code=400, detail="Personne inconnue")


def _number(db: Session, vehicle: models.Vehicle, kind: models.InspectionKind) -> str:
    plate = re.sub(r"[^A-Z0-9]", "", vehicle.registration.upper()) or str(vehicle.id)
    base = f"EDL-{plate}-{_now():%Y%m%d}-{'D' if kind == Kind.DEPARTURE else 'A'}"
    taken = {
        n
        for (n,) in db.query(models.Inspection.number).filter(
            models.Inspection.company_id == vehicle.company_id, models.Inspection.number.like(f"{base}%")
        )
    }
    if base not in taken:
        return base
    index = 2
    while f"{base}{index}" in taken:
        index += 1
    return f"{base}{index}"


def _last_validated_departure(db: Session, vehicle_id: int, company_id: int) -> models.Inspection | None:
    return (
        db.query(models.Inspection)
        .filter(
            models.Inspection.company_id == company_id,
            models.Inspection.vehicle_id == vehicle_id,
            models.Inspection.kind == Kind.DEPARTURE,
            models.Inspection.status == models.InspectionStatus.VALIDATED,
        )
        .order_by(models.Inspection.validated_at.desc())
        .first()
    )


def create_inspection(db: Session, company_id: int, user: models.User, payload: schemas.InspectionCreate) -> models.Inspection:
    data = payload.model_dump()
    departure = None
    if data.pop("departure_id", None) is not None:
        departure = (
            db.query(models.Departure)
            .filter(models.Departure.id == payload.departure_id, models.Departure.company_id == company_id)
            .first()
        )
        scope = _station_scope(user)
        if departure is None or (scope is not None and departure.station_id != scope):
            raise HTTPException(status_code=404, detail="Departure not found")
        if payload.kind != Kind.DEPARTURE:
            raise HTTPException(status_code=400, detail="Un départ se contrôle par un état des lieux de départ")
        if departure.status in (models.DepartureStatus.DEPARTED, models.DepartureStatus.CANCELLED):
            raise HTTPException(status_code=409, detail="Départ clôturé")
        # Car, équipage, ligne et horaire repris du départ.
        data["vehicle_id"] = departure.vehicle_id
        data["station_id"] = data["station_id"] or departure.station_id
        data["route_label"] = data["route_label"] or departure.route_label
        data["scheduled_departure_at"] = data["scheduled_departure_at"] or departure.scheduled_at
        data["driver_id"] = data["driver_id"] or departure.driver_id
        data["conveyor_id"] = data["conveyor_id"] or departure.conveyor_id
    vehicle = crud.get_vehicle(db, data["vehicle_id"], company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    previous = None
    if payload.kind == Kind.ARRIVAL:
        previous = _last_validated_departure(db, vehicle.id, company_id)
        if previous is not None:
            data["driver_id"] = data["driver_id"] or previous.driver_id
            data["conveyor_id"] = data["conveyor_id"] or previous.conveyor_id
            data["route_label"] = data["route_label"] or previous.route_label
    # Heure d'arrivée fixée par le serveur : le délai d'envoi du bilan (1 h) ne peut pas être contourné.
    data["arrived_at"] = _now() if payload.kind == Kind.ARRIVAL else None
    scope = _station_scope(user)
    if scope is not None:
        data["station_id"] = scope
    elif data["station_id"] is None:
        data["station_id"] = user.station_id
    data["scheduled_departure_at"] = _naive(data["scheduled_departure_at"])
    _check_refs(db, company_id, data["station_id"], data["driver_id"], data["conveyor_id"])

    insp = models.Inspection(
        **data,
        company_id=company_id,
        number=_number(db, vehicle, payload.kind),
        departure_inspection_id=previous.id if previous else None,
        created_by_id=user.id,
    )
    insp.items = [
        models.InspectionItem(position=i, section=it.section, code=it.code, label=it.label)
        for i, it in enumerate(checklists.checklist_for(payload.kind.value))
    ]
    db.add(insp)
    db.flush()
    if departure is not None:
        if departure.status == models.DepartureStatus.AUTHORIZED:
            # Nouvel état des lieux : le bon de sortie précédent n'est plus valable.
            from app.services.departures import _revoke_pass

            _revoke_pass(departure)
        departure.inspection_id = insp.id
    db.commit()
    db.refresh(insp)
    return insp


def _ensure_draft(insp: models.Inspection) -> None:
    if insp.status != models.InspectionStatus.DRAFT:
        raise HTTPException(status_code=409, detail="État des lieux validé : il ne peut plus être modifié")


def _clear_signatures(insp: models.Inspection) -> None:
    """Toute modification après signature annule les signatures déjà recueillies."""
    insp.signatures = []


def update_inspection(db: Session, insp: models.Inspection, payload: schemas.InspectionUpdate, user: models.User) -> models.Inspection:
    _ensure_draft(insp)
    data = payload.model_dump(exclude_unset=True)
    if _station_scope(user) is not None:
        data.pop("station_id", None)
    _check_refs(
        db,
        insp.company_id,
        data.get("station_id"),
        data.get("driver_id", insp.driver_id),
        data.get("conveyor_id", insp.conveyor_id),
    )
    if "scheduled_departure_at" in data:
        data["scheduled_departure_at"] = _naive(data["scheduled_departure_at"])
    for field, value in data.items():
        setattr(insp, field, value)
    _clear_signatures(insp)
    db.commit()
    db.refresh(insp)
    return insp


def set_items(db: Session, insp: models.Inspection, items: list[schemas.InspectionItemSet]) -> models.Inspection:
    _ensure_draft(insp)
    by_code = {it.code: it for it in insp.items}
    unknown = [it.code for it in items if it.code not in by_code]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Point(s) inconnu(s) : {', '.join(unknown)}")
    for it in items:
        row = by_code[it.code]
        row.status = it.status
        row.note = it.note
    _clear_signatures(insp)
    db.commit()
    db.refresh(insp)
    return insp


def add_photo(
    db: Session,
    insp: models.Inspection,
    slot: str,
    file: UploadFile,
    captured_at: datetime | None,
    is_fresh: bool,
    damage: bool,
) -> models.InspectionPhoto:
    _ensure_draft(insp)
    if slot not in checklists.PHOTO_SLOTS:
        raise HTTPException(status_code=422, detail="Emplacement de photo inconnu")
    key = save_private_image(file, insp.company_id, "inspections", insp.id, prefix=slot)
    captured = _naive(captured_at)
    # « Prise à l'instant » : déclaré par l'appareil ET daté à moins de 10 min de la réception.
    fresh = bool(is_fresh and captured is not None and abs((_now() - captured).total_seconds()) <= FRESH_PHOTO_MINUTES * 60)
    old_keys = []
    for old in [p for p in insp.photos if p.slot == slot]:
        old_keys.append(old.file_key)
        insp.photos.remove(old)
    photo = models.InspectionPhoto(slot=slot, file_key=key, captured_at=captured, is_fresh=fresh, damage=damage)
    insp.photos.append(photo)
    _clear_signatures(insp)
    db.commit()
    for old_key in old_keys:
        delete_private(old_key, insp.company_id)
    db.refresh(photo)
    return photo


# ───────────────────────── Signatures et validation ─────────────────────────

def sign(db: Session, insp: models.Inspection, payload: schemas.SignatureCreate, user: models.User, ip: str | None = None) -> models.Inspection:
    _ensure_draft(insp)
    if not is_ready_to_sign(insp):
        raise HTTPException(status_code=409, detail="Renseignez tous les points, le compteur et les 8 photos avant de signer")
    role = payload.role
    if role == models.SignatureRole.STATION_MANAGER:
        signature = models.InspectionSignature(
            role=role, user_id=user.id, signer_name=f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email, collected_by_id=user.id
        )
    else:
        person_id = insp.driver_id if role == models.SignatureRole.DRIVER else insp.conveyor_id
        if person_id is None:
            raise HTTPException(status_code=409, detail="Aucun chauffeur ou convoyeur affecté à cet état des lieux")
        person = crud.get_driver(db, person_id, insp.company_id)
        if not person or not person.pin_hash:
            raise HTTPException(status_code=409, detail="Cette personne n'a pas de PIN de signature")
        if not payload.pin:
            raise HTTPException(status_code=422, detail="PIN requis")
        if crud.collector_throttled(db, user.id):
            raise HTTPException(status_code=429, detail="Trop d'essais de PIN, réessayez plus tard")
        if crud.driver_pin_locked(db, person):
            raise HTTPException(status_code=423, detail="PIN bloqué après trop d'essais, réessayez dans 15 minutes")
        valid = crud.check_driver_pin(db, person, payload.pin)
        crud.record_pin_attempt(db, insp.company_id, user.id, person.id, valid, ip, inspection_id=insp.id)
        if not valid:
            logger.warning("Signature refusée (PIN) : inspection=%s driver=%s par user=%s ip=%s", insp.id, person.id, user.id, ip)
            raise HTTPException(status_code=403, detail="PIN incorrect")
        signature = models.InspectionSignature(
            role=role, driver_id=person.id, signer_name=f"{person.first_name} {person.last_name}", collected_by_id=user.id
        )
    insp.signatures = [s for s in insp.signatures if s.role != role] + [signature]
    db.commit()
    db.refresh(insp)
    return insp


def validate(db: Session, insp: models.Inspection, user: models.User) -> models.Inspection:
    _ensure_draft(insp)
    if not is_ready_to_sign(insp):
        raise HTTPException(status_code=409, detail="État des lieux incomplet")
    missing = REQUIRED_SIGNATURES - {s.role for s in insp.signatures}
    if missing:
        raise HTTPException(status_code=409, detail="Les 3 signatures (chef de gare, chauffeur, convoyeur) sont obligatoires")
    if insp.kind == Kind.ARRIVAL and insp.departure_inspection_id is None:
        departure = _last_validated_departure(db, insp.vehicle_id, insp.company_id)
        if departure is not None:
            insp.departure_inspection_id = departure.id
    _check_mileage(db, insp)

    score, verdict = score_and_verdict(insp)
    now = _now()
    # Passage atomique brouillon → validé : deux validations simultanées n'appliquent les effets qu'une fois.
    claimed = db.execute(
        update(models.Inspection)
        .where(models.Inspection.id == insp.id, models.Inspection.status == models.InspectionStatus.DRAFT)
        .values(status=models.InspectionStatus.VALIDATED, validated_at=now, score=score, verdict=verdict,
                departure_inspection_id=insp.departure_inspection_id)
    ).rowcount
    if not claimed:
        db.rollback()
        raise HTTPException(status_code=409, detail="État des lieux déjà validé")
    db.refresh(insp)
    _apply_effects(db, insp, user)
    db.commit()
    db.refresh(insp)
    return insp


def _check_mileage(db: Session, insp: models.Inspection) -> None:
    """Le compteur ne recule jamais et ne fait pas de saut invraisemblable (faute de frappe irréversible)."""
    previous = (
        db.query(func.max(models.Inspection.mileage))
        .filter(
            models.Inspection.vehicle_id == insp.vehicle_id,
            models.Inspection.status == models.InspectionStatus.VALIDATED,
            models.Inspection.id != insp.id,
        )
        .scalar()
    )
    reference = max(previous or 0, insp.vehicle.mileage or 0)
    if insp.mileage < reference:
        raise HTTPException(status_code=409, detail=f"Compteur incohérent : inférieur au dernier relevé ({reference} km)")
    if reference > 0 and insp.mileage - reference > MAX_MILEAGE_JUMP_KM:
        raise HTTPException(
            status_code=409,
            detail=f"Compteur incohérent : +{insp.mileage - reference} km depuis le dernier relevé ({reference} km). Vérifiez la saisie.",
        )


def _apply_effects(db: Session, insp: models.Inspection, user: models.User) -> None:
    vehicle = insp.vehicle
    when = f"{insp.created_at:%d/%m}"
    if insp.kind == Kind.DEPARTURE:
        origin, origin_label = models.NeedOrigin.DEPARTURE_INSPECTION, f"État des lieux du {when} au départ"
        for it in insp.items:
            if it.status in (Status.RESERVE, Status.KO):
                priority = (
                    models.NeedPriority.BEFORE_DEPARTURE
                    if it.section in checklists.BLOCKING_SECTIONS
                    else models.NeedPriority.THIS_WEEK
                )
                needs.add_need(db, insp, it.label, it.note, priority, origin, origin_label, user)
    else:
        origin, origin_label = models.NeedOrigin.ARRIVAL_INSPECTION, f"Arrivée du {when}"
        items = {it.code: it for it in insp.items}

        def flagged(code: str, statuses=(Status.RESERVE, Status.KO)):
            item = items.get(code)
            return item if item is not None and item.status in statuses else None

        if item := flagged("cleanliness_after"):
            needs.add_need(db, insp, "Lavage complet et désinfection", item.note,
                           models.NeedPriority.THIS_WEEK, origin, origin_label, user)
        if item := flagged("new_damages"):
            needs.add_need(db, insp, f"Dégât : {item.note}" if item.note else "Dégât constaté à l'arrivée", item.note,
                           models.NeedPriority.TO_QUOTE, origin, origin_label, user)
        if item := flagged("video_saved", (Status.KO,)):
            needs.add_need(db, insp, "Récupérer la vidéo du jour", item.note,
                           models.NeedPriority.THIS_WEEK, origin, origin_label, user)

    if insp.mileage is not None and insp.mileage > (vehicle.mileage or 0):
        vehicle.mileage = insp.mileage
    db.flush()

    settings = crud.get_company_settings(db, insp.company_id)
    due = vehicle.oil_change_due_in_km
    if due is not None and due <= settings.oil_change_warning_km:
        label = f"Compteur : {due} km restants" if due >= 0 else f"Vidange dépassée de {-due} km"
        needs.add_need(db, insp, "Vidange moteur et filtres", None, models.NeedPriority.BEFORE_DEPARTURE,
                       models.NeedOrigin.ODOMETER, label, user, unique_open=True)


# ───────────────────────── Bilan de fin de journée ─────────────────────────

def day_report(db: Session, insp: models.Inspection) -> dict:
    vehicle = insp.vehicle
    day = (insp.arrived_at or insp.created_at).date()
    fuel = (
        db.query(func.coalesce(func.sum(models.FuelExpense.amount), 0))
        .filter(models.FuelExpense.vehicle_id == vehicle.id, models.FuelExpense.refuel_date == day)
        .scalar()
    )
    tolls = (
        db.query(func.coalesce(func.sum(models.TollExpense.amount), 0))
        .filter(models.TollExpense.vehicle_id == vehicle.id, models.TollExpense.expense_date == day)
        .scalar()
    )
    documents = []
    for doc_type in ("technical_control", "insurance"):
        doc = (
            db.query(models.Document)
            .filter(models.Document.vehicle_id == vehicle.id, models.Document.document_type == doc_type, models.Document.expiry_date.isnot(None))
            .order_by(models.Document.expiry_date.desc())
            .first()
        )
        documents.append({"type": doc_type, "expiry_date": doc.expiry_date if doc else None,
                          "days_left": (doc.expiry_date - day).days if doc else None})
    open_needs = needs.list_needs(db, insp.company_id, vehicle_id=vehicle.id, open_only=True)
    return {
        "km_of_day": km_of_day(insp),
        "fuel_level": insp.fuel_level,
        "fuel_liters": insp.fuel_liters,
        "day_expenses": {"fuel": float(fuel), "tolls": float(tolls), "total": float(fuel) + float(tolls)},
        "deadlines": {"oil_change_due_in_km": vehicle.oil_change_due_in_km, "documents": documents},
        "needs": [schemas.VehicleNeedRead.model_validate(n) for n in open_needs],
        "needs_total": sum(n.estimated_cost or 0 for n in open_needs),
    }
