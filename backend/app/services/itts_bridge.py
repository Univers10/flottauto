"""Pont ITTS Gestion → FlottAuto (contrat : docs/integration-itts.md).

- Événements de départ signés, traités une seule fois (identifiant d'événement) et dans l'ordre (``occurred_at``).
- Référentiel (``fleet.snapshot``) : cars, gares et personnel d'ITTS recopiés dans FlottAuto, sans ressaisie.
- Correspondance des cars par numéro de parc puis immatriculation ; un car inconnu est créé automatiquement.
- Autorisation de départ demandée par ITTS juste avant de passer un départ à « parti », pour un car précis.
"""
import hashlib
import hmac
import json
import re
import time
import unicodedata
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.config import get_settings
from app.services import departures as dep_svc

SIGNATURE_WINDOW_SECONDS = 300
MAX_BODY_BYTES = 256 * 1024
DStatus = models.DepartureStatus
Event = models.IntegrationEvent


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def enabled() -> bool:
    s = get_settings()
    return bool(s.ITTS_SHARED_SECRET and s.ITTS_COMPANY_ID)


def company_id() -> int:
    if not enabled():
        raise HTTPException(status_code=503, detail="Pont ITTS désactivé")
    return get_settings().ITTS_COMPANY_ID


# ───────────────────────── Signature ─────────────────────────

def sign(secret: str, timestamp: str, method: str, path: str, body: bytes) -> str:
    message = f"{timestamp}.{method.upper()}.{path}.".encode() + body
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def _invalid() -> HTTPException:
    return HTTPException(status_code=401, detail="Signature invalide")


async def _read_body(request: Request) -> bytes:
    """Corps borné : le serveur ne met jamais plus de MAX_BODY_BYTES en mémoire."""
    length = request.headers.get("content-length")
    if length is not None and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        raise HTTPException(status_code=413, detail="Corps trop volumineux")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Corps trop volumineux")
    return bytes(body)


async def verify_request(request: Request) -> bytes:
    """Dépendance : vérifie la signature HMAC d'ITTS et renvoie le corps brut."""
    if not enabled():
        raise HTTPException(status_code=503, detail="Pont ITTS désactivé")
    timestamp = request.headers.get("x-itts-timestamp", "")
    signature = request.headers.get("x-itts-signature", "")
    # En-têtes contrôlés avant de lire le corps.
    if not (timestamp.isascii() and timestamp.isdigit() and len(timestamp) <= 10):
        raise _invalid()
    if abs(time.time() - int(timestamp)) > SIGNATURE_WINDOW_SECONDS or not re.fullmatch(r"[0-9a-f]{64}", signature):
        raise _invalid()
    body = await _read_body(request)
    # Chemin et requête tels que reçus (non décodés), comme ITTS les a signés.
    path = request.scope.get("raw_path", request.url.path.encode()).decode("latin-1")
    query = request.scope.get("query_string", b"").decode("latin-1")
    if query:
        path = f"{path}?{query}"
    expected = sign(get_settings().ITTS_SHARED_SECRET, timestamp, request.method, path, body)
    if not hmac.compare_digest(signature.encode(), expected.encode()):
        raise _invalid()
    return body


# ───────────────────────── Correspondances ─────────────────────────

def _plate_key(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def _number_key(value: str | None) -> str:
    """Numéro de parc comparable : « N°530 », « 0530 » et « 530 » sont le même car."""
    digits = re.sub(r"\D", "", value or "")
    return digits.lstrip("0") or digits


def _sync_bus_fields(vehicle: models.Vehicle, bus: schemas.IttsBus) -> None:
    """ITTS fait foi pour le numéro de parc et le nombre de places ; FlottAuto garde l'immatriculation."""
    vehicle.itts_bus_id = bus.id
    if bus.number and bus.number.strip():
        vehicle.fleet_number = bus.number.strip()[:20]
    capacity = getattr(bus, "capacity", None)
    if capacity:
        vehicle.seats = capacity


def _find_vehicle(db: Session, cid: int, bus: schemas.IttsBus, create: bool = True,
                  index: dict | None = None) -> models.Vehicle | None:
    """Car FlottAuto d'un car ITTS : lien connu, puis numéro de parc, puis immatriculation ; sinon créé.

    ``index`` (instantané) : cars de la société lus une seule fois, {"linked": {itts_id: car}, "unlinked": [cars]}.
    """
    vehicles = db.query(models.Vehicle).filter(models.Vehicle.company_id == cid)
    if index is not None:
        vehicle = index["linked"].get(bus.id)
    else:
        vehicle = vehicles.filter(models.Vehicle.itts_bus_id == bus.id).first()
    if vehicle is None:
        unlinked = index["unlinked"] if index is not None else vehicles.filter(models.Vehicle.itts_bus_id.is_(None)).all()
        number, plate = _number_key(bus.number), _plate_key(bus.plate)
        vehicle = next((v for v in unlinked if number and _number_key(v.fleet_number) == number), None)
        if vehicle is None and plate:
            vehicle = next((v for v in unlinked if _plate_key(v.registration) == plate), None)
        if vehicle is None and number:
            vehicle = next((v for v in unlinked if not v.fleet_number and _plate_key(v.registration) == number), None)
    if vehicle is None:
        if not create:
            return None
        label = (bus.number or "").strip() or bus.plate
        vehicle = models.Vehicle(
            company_id=cid,
            registration=bus.plate[:50],
            brand="Car",
            model=f"N°{label}"[:100],
            vehicle_type=models.VehicleType.BUS,
            energy=models.EnergyType.DIESEL,
            notes="Créé automatiquement depuis ITTS Gestion.",
        )
        db.add(vehicle)
    _sync_bus_fields(vehicle, bus)
    if index is not None:
        index["linked"][bus.id] = vehicle
        if vehicle in index["unlinked"]:
            index["unlinked"].remove(vehicle)
    else:
        db.flush()
    return vehicle


def _station(db: Session, cid: int, st: schemas.IttsStation) -> models.Station:
    station = db.query(models.Station).filter(models.Station.company_id == cid, models.Station.itts_station_id == st.id).first()
    if station is None:
        code = st.code.strip().upper()[:20]
        station = db.query(models.Station).filter(models.Station.company_id == cid, models.Station.code == code).first()
        if station is None:
            station = models.Station(company_id=cid, name=st.name[:255], code=code, active=True)
            db.add(station)
        station.itts_station_id = st.id
    station.name = st.name[:255]
    if getattr(st, "city", None):
        station.city = st.city[:100]
    db.flush()
    return station


def _name_key(value: str) -> str:
    """Nom comparable sans accents ni ordre : « Koné Awa » = « AWA KONE »."""
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().upper()
    return " ".join(sorted(re.sub(r"[^A-Z ]", " ", plain).split()))


def _person(db: Session, cid: int, person: schemas.IttsPerson | None, staff_type: models.StaffType,
            index: dict | None = None) -> models.Driver | None:
    """Personnel ITTS : lien connu, puis même nom (fiche saisie à la main), sinon créé.

    ``index`` (instantané) : {"linked": {itts_id: fiche}, "by_name": {nom normalisé: [fiches non liées]}}.
    """
    if person is None:
        return None
    drivers = db.query(models.Driver).filter(models.Driver.company_id == cid)
    if index is not None:
        found = index["linked"].get(person.id)
    else:
        found = drivers.filter(models.Driver.itts_staff_id == person.id).first()
    if found is None:
        key = _name_key(person.name)
        if index is not None:
            candidates = index["by_name"].get(key) or []
            found = candidates.pop(0) if key and candidates else None
        else:
            found = next(
                (d for d in drivers.filter(models.Driver.itts_staff_id.is_(None))
                 if key and _name_key(f"{d.first_name} {d.last_name}") == key),
                None,
            )
        if found is not None:
            found.itts_staff_id = person.id
            if index is not None:
                index["linked"][person.id] = found
    if found is not None:
        if person.phone and not found.phone:
            found.phone = person.phone
        return found
    first, _, last = person.name.strip().partition(" ")
    driver = models.Driver(
        company_id=cid,
        first_name=(first or person.name)[:100],
        last_name=(last or "—")[:100],
        phone=person.phone,
        staff_type=staff_type,
        itts_staff_id=person.id,
        is_active=True,
    )
    db.add(driver)
    if index is not None:
        index["linked"][person.id] = driver
    else:
        db.flush()
    return driver


STAFF_TYPES = {"CHAUFFEUR": models.StaffType.DRIVER, "CONVOYEUR": models.StaffType.CONVEYOR}


def _apply_fleet(db: Session, cid: int, event: schemas.IttsEvent) -> str:
    """Référentiel ITTS : gares, cars et personnel créés ou mis à jour ; jamais supprimés."""
    latest = (
        db.query(func.max(Event.occurred_at))
        .filter(Event.company_id == cid, Event.type == "fleet.snapshot", Event.status == "processed", Event.id != event.id)
        .scalar()
    )
    if latest is not None and _utc_naive(event.occurred_at) < latest:
        return "processed"  # instantané plus ancien que le dernier appliqué
    fleet = event.fleet
    for st in fleet.stations:
        if not st.code.strip():
            continue
        station = _station(db, cid, st)
        station.active = st.active
    # Index construits une fois : coût linéaire même avec des centaines de cars et de personnes.
    vehicles = db.query(models.Vehicle).filter(models.Vehicle.company_id == cid).all()
    vindex = {"linked": {v.itts_bus_id: v for v in vehicles if v.itts_bus_id},
              "unlinked": [v for v in vehicles if not v.itts_bus_id]}
    for bus in fleet.buses:
        # Un car désactivé dans ITTS n'est pas créé ; s'il existe déjà, il reste tel quel dans FlottAuto.
        _find_vehicle(db, cid, bus, create=bus.active, index=vindex)
    people = db.query(models.Driver).filter(models.Driver.company_id == cid).all()
    pindex: dict = {"linked": {d.itts_staff_id: d for d in people if d.itts_staff_id}, "by_name": {}}
    for d in people:
        if not d.itts_staff_id:
            pindex["by_name"].setdefault(_name_key(f"{d.first_name} {d.last_name}"), []).append(d)
    for person in fleet.staff:
        driver = _person(db, cid, person, STAFF_TYPES[person.role], index=pindex)
        driver.is_active = person.active
    db.flush()
    return "processed"


# ───────────────────────── Traitement des événements ─────────────────────────

def _latest_processed_at(db: Session, cid: int, itts_departure_id: str, exclude_id: str | None = None) -> datetime | None:
    query = db.query(func.max(Event.occurred_at)).filter(
        Event.company_id == cid, Event.itts_departure_id == itts_departure_id, Event.status == "processed"
    )
    if exclude_id:
        query = query.filter(Event.id != exclude_id)
    return query.scalar()


def _pass_valid_at(dep: models.Departure, moment: datetime) -> bool:
    return (
        dep.exit_pass_number is not None
        and dep.exit_pass_issued_at is not None
        and dep.exit_pass_valid_until is not None
        and dep.exit_pass_issued_at <= moment <= dep.exit_pass_valid_until
    )


def _infraction_alert(db: Session, dep: models.Departure) -> None:
    dep_svc._alert(
        db,
        dep,
        models.AlertType.DEPARTURE_BLOCKED,
        "critical",
        f"Car sorti sans autorisation · {dep.vehicle.registration}",
        "Départ enregistré « parti » dans ITTS Gestion sans bon de sortie FlottAuto valide.",
    )


def _apply(db: Session, cid: int, event: schemas.IttsEvent) -> str:
    if event.type == "fleet.snapshot":
        return _apply_fleet(db, cid, event)
    d = event.departure
    if event.type == "departure.upserted":
        latest = _latest_processed_at(db, cid, d.id, exclude_id=event.id)
        if latest is not None and _utc_naive(event.occurred_at) < latest:
            return "processed"  # changement plus ancien que l'état connu : ignoré
    vehicle = _find_vehicle(db, cid, d.bus)
    if vehicle is None:
        return "pending_mapping"
    dep = db.query(models.Departure).filter(models.Departure.company_id == cid, models.Departure.itts_departure_id == d.id).first()

    if event.type == "departure.upserted":
        if dep is not None and dep.status in (DStatus.DEPARTED, DStatus.CANCELLED):
            return "processed"  # départ clos : les mises à jour tardives sont ignorées
        station = _station(db, cid, d.station)
        driver = _person(db, cid, d.driver, models.StaffType.DRIVER)
        conveyor = _person(db, cid, d.conveyor, models.StaffType.CONVEYOR)
        values = {
            "vehicle_id": vehicle.id,
            "station_id": station.id,
            "scheduled_at": _utc_naive(d.departure_at),
            "route_label": f"{d.route.from_} → {d.route.to}"[:255],
            "driver_id": driver.id if driver else None,
            "conveyor_id": conveyor.id if conveyor else None,
        }
        if dep is None:
            db.add(models.Departure(company_id=cid, itts_departure_id=d.id, **values))
        else:
            changed = any(getattr(dep, k) != v for k, v in values.items() if k != "route_label")
            if changed and dep.status == DStatus.AUTHORIZED:
                dep_svc._revoke_pass(dep)
            if dep.vehicle_id != vehicle.id:
                dep.inspection_id = None  # autre car : un nouvel état des lieux est obligatoire
            for k, v in values.items():
                setattr(dep, k, v)
        return "processed"

    if dep is None:
        # Annulation ou départ d'un départ jamais reçu : on le crée d'abord, puis on applique.
        _apply(db, cid, schemas.IttsEvent(id=event.id, type="departure.upserted", occurred_at=event.occurred_at, departure=d))
        db.flush()
        dep = db.query(models.Departure).filter(models.Departure.company_id == cid, models.Departure.itts_departure_id == d.id).first()

    if event.type == "departure.cancelled":
        if dep.status != DStatus.DEPARTED:
            dep_svc._revoke_pass(dep)
            dep.status = DStatus.CANCELLED
        return "processed"

    # departure.departed : le bon est jugé à l'heure réelle de sortie, même si l'événement arrive en retard.
    if dep.status == DStatus.DEPARTED:
        return "processed"
    departed_at = _utc_naive(d.departed_at) or _now()
    if not (dep.status == DStatus.AUTHORIZED and _pass_valid_at(dep, departed_at)):
        _infraction_alert(db, dep)
    dep.status = DStatus.DEPARTED
    dep.departed_at = departed_at
    return "processed"


def _new_record(cid: int, raw: bytes, event: schemas.IttsEvent) -> models.IntegrationEvent:
    d = event.departure
    return Event(
        id=event.id,
        company_id=cid,
        type=event.type,
        itts_departure_id=d.id if d else None,
        itts_bus_id=d.bus.id if d else None,
        bus_plate=d.bus.plate if d else None,
        occurred_at=_utc_naive(event.occurred_at),
        payload=raw.decode("utf-8", errors="replace"),
        status="received",
    )


def _record_error(db: Session, cid: int, raw: bytes, event: schemas.IttsEvent, exc: Exception) -> None:
    """Conserve l'événement en erreur pour l'administrateur ; ITTS le renverra (5xx)."""
    record = db.get(Event, event.id)
    if record is None:
        record = _new_record(cid, raw, event)
        db.add(record)
    record.status = "error"
    record.error = f"{type(exc).__name__}: {exc}"[:500]
    db.commit()


def handle_event(db: Session, raw: bytes, event: schemas.IttsEvent) -> str:
    cid = company_id()
    record = db.get(Event, event.id)
    if record is not None and record.status not in ("pending_mapping", "error"):
        return "duplicate"
    if record is None:
        record = _new_record(cid, raw, event)
        db.add(record)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return "duplicate"  # même événement reçu en parallèle
    try:
        status = _apply(db, cid, event)
    except Exception as exc:  # noqa: BLE001 — journalisé puis signalé à ITTS (5xx, nouvel essai)
        db.rollback()
        _record_error(db, cid, raw, event, exc)
        raise HTTPException(status_code=500, detail="Erreur de traitement de l'événement") from exc
    record.status = status
    record.error = None
    record.processed_at = _now() if status == "processed" else None
    db.commit()
    if event.type == "fleet.snapshot":
        replay_all_pending(db, cid)
    return status


def replay_pending(db: Session, cid: int, itts_bus_id: str) -> int:
    """Rejoue, dans l'ordre chronologique, les événements en attente d'un car désormais associé."""
    pending = (
        db.query(Event)
        .filter(Event.company_id == cid, Event.status == "pending_mapping", Event.itts_bus_id == itts_bus_id)
        .order_by(Event.occurred_at, Event.received_at)
        .all()
    )
    replayed = 0
    for record in pending:
        event = schemas.IttsEvent.model_validate(json.loads(record.payload))
        if handle_event(db, record.payload.encode(), event) == "processed":
            replayed += 1
    return replayed


def replay_all_pending(db: Session, cid: int) -> int:
    """Rejoue les départs restés en attente (cars désormais connus grâce au référentiel)."""
    bus_ids = [row[0] for row in db.query(Event.itts_bus_id).filter(
        Event.company_id == cid, Event.status == "pending_mapping", Event.itts_bus_id.is_not(None)).distinct()]
    return sum(replay_pending(db, cid, bus_id) for bus_id in bus_ids)


def map_bus(db: Session, cid: int, payload: schemas.IttsBusMapping) -> int:
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == payload.vehicle_id, models.Vehicle.company_id == cid).first()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    other = db.query(models.Vehicle).filter(models.Vehicle.company_id == cid, models.Vehicle.itts_bus_id == payload.itts_bus_id,
                                            models.Vehicle.id != vehicle.id).first()
    if other is not None:
        raise HTTPException(status_code=409, detail=f"Ce car ITTS est déjà associé à {other.registration}")
    if vehicle.itts_bus_id and vehicle.itts_bus_id != payload.itts_bus_id and not payload.force:
        raise HTTPException(status_code=409, detail=f"{vehicle.registration} est déjà associé à un autre car ITTS")
    vehicle.itts_bus_id = payload.itts_bus_id
    db.commit()
    return replay_pending(db, cid, payload.itts_bus_id)


# ───────────────────────── Autorisation et état ─────────────────────────

def _denied(reason: str, url: str | None, status: str = "red") -> dict:
    return {"authorized": False, "status": status, "reason": reason, "url": url}


def authorization(db: Session, itts_departure_id: str, bus_id: str) -> dict:
    cid = company_id()
    dep = db.query(models.Departure).filter(models.Departure.company_id == cid,
                                            models.Departure.itts_departure_id == itts_departure_id).first()
    if dep is None:
        return _denied("Départ inconnu de FlottAuto", None, status="unknown")
    url = f"{get_settings().PUBLIC_APP_URL.rstrip('/')}/departures/{dep.id}"
    if dep.status == DStatus.CANCELLED:
        return _denied("Départ annulé dans FlottAuto", url)
    if dep.vehicle.itts_bus_id != bus_id:
        return _denied(f"Car différent de celui prévu dans FlottAuto ({dep.vehicle.registration})", url)
    # Un changement plus récent que l'état connu, non encore appliqué (car à associer, erreur) : refus.
    latest = _latest_processed_at(db, cid, itts_departure_id)
    pending = db.query(Event.id).filter(Event.company_id == cid, Event.itts_departure_id == itts_departure_id,
                                        Event.status.in_(("pending_mapping", "error")))
    if latest is not None:
        pending = pending.filter(Event.occurred_at >= latest)
    if pending.first() is not None:
        return _denied("Changement du départ pas encore pris en compte par FlottAuto (car à associer)", url)
    if dep.status == DStatus.DEPARTED:
        if dep.departed_at and _pass_valid_at(dep, dep.departed_at):
            return {"authorized": True, "status": dep.exit_pass_status or "green", "reason": None,
                    "exit_pass_number": dep.exit_pass_number,
                    "valid_until": dep.exit_pass_valid_until.replace(tzinfo=timezone.utc), "url": url}
        return _denied("Départ déjà enregistré comme parti sans bon de sortie valide", url)
    checklist = dep_svc.compute_checklist(db, dep)
    if dep.status != DStatus.AUTHORIZED:
        return _denied(checklist["blocking_reason"] or "Bon de sortie non émis dans FlottAuto", url, status=checklist["status"])
    check = dep_svc.verify_token(db, dep_svc.make_token(dep))
    return {
        "authorized": bool(check["valid"]),
        "status": checklist["status"],
        "reason": None if check["valid"] else check["reason"],
        "exit_pass_number": dep.exit_pass_number,
        "valid_until": dep.exit_pass_valid_until.replace(tzinfo=timezone.utc) if dep.exit_pass_valid_until else None,
        "url": url,
    }


def status(db: Session, cid: int) -> dict:
    events = db.query(Event).filter(Event.company_id == cid).order_by(Event.received_at.desc()).limit(30).all()
    pending: dict[str, dict] = {}
    for e in db.query(Event).filter(Event.company_id == cid, Event.status == "pending_mapping"):
        item = pending.setdefault(e.itts_bus_id, {"itts_bus_id": e.itts_bus_id, "plate": e.bus_plate, "events": 0})
        item["events"] += 1
    return {
        "enabled": enabled() and get_settings().ITTS_COMPANY_ID == cid,
        "last_event_at": events[0].received_at if events else None,
        "events": [
            {"id": e.id, "type": e.type, "status": e.status, "itts_departure_id": e.itts_departure_id,
             "bus_plate": e.bus_plate, "received_at": e.received_at, "error": e.error}
            for e in events
        ],
        "pending_mappings": list(pending.values()),
        "last_snapshot_at": db.query(func.max(Event.processed_at)).filter(
            Event.company_id == cid, Event.type == "fleet.snapshot", Event.status == "processed").scalar(),
        "synced": {
            "vehicles": db.query(models.Vehicle).filter(models.Vehicle.company_id == cid, models.Vehicle.itts_bus_id.is_not(None)).count(),
            "stations": db.query(models.Station).filter(models.Station.company_id == cid, models.Station.itts_station_id.is_not(None)).count(),
            "staff": db.query(models.Driver).filter(models.Driver.company_id == cid, models.Driver.itts_staff_id.is_not(None)).count(),
        },
    }
