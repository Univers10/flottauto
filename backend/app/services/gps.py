"""Suivi GPS (F6) : boîtiers, réception des positions, position en direct, trajets et arrêts moteur.

Trois façons d'envoyer des positions (voir docs/gps-boitiers.md) :
- ``POST /gps/ingest`` : JSON, en-tête ``X-Gps-Key`` = clé du boîtier ;
- ``/gps/osmand`` : protocole OsmAnd (application « Traccar Client » sur un téléphone), ``id`` = clé du boîtier ;
- ``POST /gps/traccar`` : redirection des positions d'un serveur Traccar (boîtiers Teltonika…), en-tête
  ``X-Gps-Key`` = clé du relais de la société, boîtier reconnu par son IMEI.
"""
import hashlib
import math
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import crud, models, schemas

Device = models.GpsDevice
Position = models.GpsPosition

# Positions acceptées : 30 jours en arrière (boîtier resté sans réseau), 5 minutes dans le futur (horloge).
MAX_AGE = timedelta(days=30)
MAX_AHEAD = timedelta(minutes=5)
# Au-delà, le saut entre deux points est une erreur de position : pas compté dans le kilométrage.
MAX_PLAUSIBLE_KMH = 160
MOVING_KMH = 5
STOP_MIN = timedelta(minutes=5)
ONLINE = timedelta(minutes=10)
MAX_TRACK_POINTS = 20000


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def new_key() -> str:
    return "gps_" + secrets.token_urlsafe(24)


def km_between(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


# ───────────────────────── Boîtiers ─────────────────────────

def list_devices(db: Session, cid: int) -> list[Device]:
    return db.query(Device).filter(Device.company_id == cid).order_by(Device.id).all()


def create_device(db: Session, cid: int, payload: schemas.GpsDeviceCreate) -> tuple[Device, str]:
    vehicle = crud.get_vehicle(db, payload.vehicle_id, cid)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Car inconnu")
    if db.query(Device).filter(Device.vehicle_id == vehicle.id).first():
        raise HTTPException(status_code=409, detail="Ce car a déjà un boîtier")
    if payload.imei and db.query(Device).filter(Device.imei == payload.imei).first():
        raise HTTPException(status_code=409, detail="Cet IMEI est déjà enregistré")
    key = new_key()
    device = Device(company_id=cid, vehicle_id=vehicle.id, imei=payload.imei, model=payload.model, key_hash=hash_key(key))
    db.add(device)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Boîtier déjà enregistré")
    db.refresh(device)
    return device, key


def get_device(db: Session, cid: int, device_id: int) -> Device:
    device = db.query(Device).filter(Device.id == device_id, Device.company_id == cid).first()
    if device is None:
        raise HTTPException(status_code=404, detail="Boîtier introuvable")
    return device


def update_device(db: Session, device: Device, payload: schemas.GpsDeviceUpdate) -> Device:
    data = payload.model_dump(exclude_unset=True)
    if data.get("imei") and db.query(Device).filter(Device.imei == data["imei"], Device.id != device.id).first():
        raise HTTPException(status_code=409, detail="Cet IMEI est déjà enregistré")
    for field, value in data.items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


def rotate_key(db: Session, device: Device) -> str:
    key = new_key()
    device.key_hash = hash_key(key)
    db.commit()
    return key


def delete_device(db: Session, device: Device) -> None:
    db.query(Position).filter(Position.device_id == device.id).delete()
    db.delete(device)
    db.commit()


def rotate_relay_key(db: Session, cid: int) -> str:
    key = new_key()
    settings = crud.get_company_settings(db, cid)
    settings.gps_relay_key_hash = hash_key(key)
    db.commit()
    return key


def relay_configured(db: Session, cid: int) -> bool:
    return bool(crud.get_company_settings(db, cid).gps_relay_key_hash)


def read_device(device: Device) -> dict:
    v = device.vehicle
    return {
        "id": device.id,
        "vehicle_id": device.vehicle_id,
        "vehicle": {"id": v.id, "registration": v.registration, "fleet_number": v.fleet_number} if v else None,
        "imei": device.imei,
        "model": device.model,
        "active": device.active,
        "last_seen_at": device.last_seen_at,
        "online": bool(device.last_seen_at and _now() - device.last_seen_at <= ONLINE),
        "created_at": device.created_at,
    }


# ───────────────────────── Réception ─────────────────────────

def device_by_key(db: Session, key: str | None) -> Device:
    if not key or len(key) > 200:
        raise HTTPException(status_code=401, detail="Clé du boîtier absente")
    device = db.query(Device).filter(Device.key_hash == hash_key(key)).first()
    if device is None or not device.active:
        raise HTTPException(status_code=401, detail="Boîtier inconnu ou désactivé")
    return device


def device_by_relay(db: Session, key: str | None, imei: str) -> Device | None:
    """Boîtier envoyé par le relais Traccar : clé du relais de la société, puis IMEI. None : IMEI inconnu."""
    if not key or len(key) > 200:
        raise HTTPException(status_code=401, detail="Clé du relais absente")
    settings = db.query(models.CompanySettings).filter(models.CompanySettings.gps_relay_key_hash == hash_key(key)).first()
    if settings is None:
        raise HTTPException(status_code=401, detail="Relais inconnu")
    device = db.query(Device).filter(Device.company_id == settings.company_id, Device.imei == imei).first()
    return device if device is not None and device.active else None


def ingest(db: Session, device: Device, points: list[schemas.GpsPoint]) -> dict:
    """Enregistre les positions (doublons et positions impossibles ignorés), met à jour le kilométrage du car."""
    now = _now()
    vehicle = device.vehicle
    last = (
        db.query(Position).filter(Position.device_id == device.id).order_by(Position.recorded_at.desc()).first()
    )
    known = {
        row[0]
        for row in db.query(Position.recorded_at).filter(
            Position.device_id == device.id,
            Position.recorded_at.in_([_utc(p.recorded_at) for p in points]),
        )
    }
    accepted = skipped = 0
    km = 0.0
    odometer: float | None = None
    for p in sorted(points, key=lambda x: _utc(x.recorded_at)):
        at = _utc(p.recorded_at)
        if at in known or at > now + MAX_AHEAD or at < now - MAX_AGE or (p.lat == 0 and p.lng == 0):
            skipped += 1
            continue
        known.add(at)
        db.add(Position(
            company_id=device.company_id, vehicle_id=device.vehicle_id, device_id=device.id, recorded_at=at,
            lat=p.lat, lng=p.lng, speed_kmh=p.speed_kmh, heading=p.heading, odometer_km=p.odometer_km,
            ignition=p.ignition, fuel_level_pct=p.fuel_level_pct, fuel_used_l=p.fuel_used_l, received_at=now,
        ))
        accepted += 1
        if p.odometer_km is not None:
            odometer = max(odometer or 0, p.odometer_km)
        # Sans compteur du boîtier : distance entre deux points qui se suivent, si le saut est plausible.
        if last is not None and at > last.recorded_at:
            d = km_between(last.lat, last.lng, p.lat, p.lng)
            hours = (at - last.recorded_at).total_seconds() / 3600
            if hours > 0 and d / hours <= MAX_PLAUSIBLE_KMH:
                km += d
        if last is None or at > last.recorded_at:
            last = Position(lat=p.lat, lng=p.lng, recorded_at=at)
    if accepted:
        device.last_seen_at = max(device.last_seen_at or datetime.min, now)
        if vehicle is not None:
            if odometer is not None:
                vehicle.mileage = max(vehicle.mileage or 0, int(odometer))
            elif km > 0:
                # Le compteur du car ne recule jamais ; le relevé manuel reste possible.
                vehicle.mileage = (vehicle.mileage or 0) + int(round(km))
    try:
        db.commit()
    except IntegrityError:
        # Même lot reçu deux fois en parallèle : l'autre envoi l'a enregistré.
        db.rollback()
        return {"accepted": 0, "skipped": len(points)}
    return {"accepted": accepted, "skipped": skipped}


# ───────────────────────── Lecture ─────────────────────────

def _state(p: Position | None, now: datetime) -> str:
    if p is None:
        return "no_data"
    if now - p.received_at > ONLINE and now - p.recorded_at > ONLINE:
        return "offline"
    if (p.speed_kmh or 0) >= MOVING_KMH:
        return "moving"
    if p.ignition:
        return "idle"
    return "stopped"


def _pos(p: Position) -> dict:
    return {
        "at": p.recorded_at, "lat": p.lat, "lng": p.lng, "speed_kmh": p.speed_kmh, "heading": p.heading,
        "ignition": p.ignition, "fuel_level_pct": p.fuel_level_pct, "odometer_km": p.odometer_km,
    }


def live(db: Session, cid: int) -> list[dict]:
    """Dernière position de chaque car équipé."""
    now = _now()
    devices = db.query(Device).filter(Device.company_id == cid, Device.active.is_(True)).all()
    latest = dict(
        db.query(Position.device_id, func.max(Position.recorded_at))
        .filter(Position.company_id == cid)
        .group_by(Position.device_id)
        .all()
    )
    out = []
    for d in devices:
        at = latest.get(d.id)
        p = db.query(Position).filter(Position.device_id == d.id, Position.recorded_at == at).first() if at else None
        v = d.vehicle
        out.append({
            "vehicle_id": d.vehicle_id,
            "registration": v.registration if v else None,
            "fleet_number": v.fleet_number if v else None,
            "mileage": v.mileage if v else None,
            "state": _state(p, now),
            "position": _pos(p) if p else None,
        })
    order = {"moving": 0, "idle": 1, "stopped": 2, "offline": 3, "no_data": 4}
    return sorted(out, key=lambda x: (order[x["state"]], x["fleet_number"] or x["registration"] or ""))


def _engine_on(p: Position) -> bool:
    # Sans info de contact (téléphone), on se fie à la vitesse.
    return p.ignition if p.ignition is not None else (p.speed_kmh or 0) >= MOVING_KMH


def track(db: Session, cid: int, vehicle_id: int, day: date) -> dict:
    """Positions d'une journée (heure UTC = heure d'Abidjan), découpées en trajets moteur en marche et arrêts."""
    if crud.get_vehicle(db, vehicle_id, cid) is None:
        raise HTTPException(status_code=404, detail="Car inconnu")
    start = datetime(day.year, day.month, day.day)
    points = (
        db.query(Position)
        .filter(Position.company_id == cid, Position.vehicle_id == vehicle_id,
                Position.recorded_at >= start, Position.recorded_at < start + timedelta(days=1))
        .order_by(Position.recorded_at)
        .limit(MAX_TRACK_POINTS)
        .all()
    )
    trips: list[dict] = []
    stops: list[dict] = []
    current: dict | None = None
    stop_from: Position | None = None
    prev: Position | None = None
    total = 0.0
    for p in points:
        if prev is not None:
            d = km_between(prev.lat, prev.lng, p.lat, p.lng)
            hours = (p.recorded_at - prev.recorded_at).total_seconds() / 3600
            if hours <= 0 or d / hours > MAX_PLAUSIBLE_KMH:
                d = 0.0
        else:
            d = 0.0
        if _engine_on(p):
            if stop_from is not None and prev is not None and p.recorded_at - stop_from.recorded_at >= STOP_MIN:
                stops.append({"from": stop_from.recorded_at, "to": p.recorded_at, "lat": stop_from.lat, "lng": stop_from.lng,
                              "minutes": int((p.recorded_at - stop_from.recorded_at).total_seconds() // 60)})
            stop_from = None
            if current is None:
                current = {"start": p.recorded_at, "end": p.recorded_at, "km": 0.0, "max_speed_kmh": 0.0,
                           "from": {"lat": p.lat, "lng": p.lng}, "to": {"lat": p.lat, "lng": p.lng}}
            else:
                current["km"] += d
            current["end"] = p.recorded_at
            current["to"] = {"lat": p.lat, "lng": p.lng}
            current["max_speed_kmh"] = max(current["max_speed_kmh"], p.speed_kmh or 0)
        else:
            if current is not None:
                current["km"] += d
                current["end"] = p.recorded_at
                current["to"] = {"lat": p.lat, "lng": p.lng}
                trips.append(current)
                current = None
            if stop_from is None:
                stop_from = p
        total += d
        prev = p
    if current is not None:
        trips.append(current)
    if stop_from is not None and prev is not None and prev.recorded_at - stop_from.recorded_at >= STOP_MIN:
        stops.append({"from": stop_from.recorded_at, "to": None, "lat": stop_from.lat, "lng": stop_from.lng,
                      "minutes": int((prev.recorded_at - stop_from.recorded_at).total_seconds() // 60)})
    for t in trips:
        t["km"] = round(t["km"], 1)
        t["minutes"] = int((t["end"] - t["start"]).total_seconds() // 60)
    return {
        "vehicle_id": vehicle_id,
        "day": day.isoformat(),
        "points": [[p.lat, p.lng, p.recorded_at.isoformat(), p.speed_kmh] for p in points],
        "truncated": len(points) >= MAX_TRACK_POINTS,
        "km": round(total, 1),
        "trips": trips,
        "stops": stops,
        "max_speed_kmh": max((p.speed_kmh or 0 for p in points), default=0),
    }
