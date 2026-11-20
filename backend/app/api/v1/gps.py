"""Suivi GPS (F6). Réception des positions (sans compte : clé du boîtier ou du relais) et écrans."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import require_role
from app.core.database import get_db
from app.services import gps as svc

R = models.Role
ADMINS = (R.SUPER_ADMIN, R.ADMIN, R.OPERATIONS_SUPERVISOR)

router = APIRouter()
ingest_router = APIRouter()

KNOTS_TO_KMH = 1.852


def _cid(user: models.User) -> int:
    if user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return user.company_id


# ───────────── Réception ─────────────

@ingest_router.post("/ingest")
def ingest(payload: schemas.GpsIngest, x_gps_key: str | None = Header(None), db: Session = Depends(get_db)):
    """Boîtier ou script : JSON, en-tête X-Gps-Key = clé du boîtier."""
    device = svc.device_by_key(db, x_gps_key)
    return svc.ingest(db, device, payload.positions)


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _when(v) -> datetime:
    if v in (None, ""):
        return datetime.now(timezone.utc)
    n = _num(v)
    if n is not None:
        # Secondes ou millisecondes depuis 1970.
        return datetime.fromtimestamp(n / 1000 if n > 1e11 else n, tz=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Heure invalide")


def _point(**kw) -> schemas.GpsPoint:
    try:
        return schemas.GpsPoint(**{k: v for k, v in kw.items() if v is not None})
    except ValidationError:
        raise HTTPException(status_code=400, detail="Position invalide")


@ingest_router.api_route("/osmand", methods=["GET", "POST"])
async def osmand(request: Request, db: Session = Depends(get_db)):
    """Protocole OsmAnd (application gratuite « Traccar Client ») : identifiant de l'appareil = clé du boîtier.
    Anciennes versions : paramètres d'URL ; nouvelles : JSON ``{"device_id", "location": {"timestamp", "coords"}}``."""
    q = dict(request.query_params)
    body = {}
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001 — corps vide ou formulaire : les paramètres d'URL suffisent
            form = await request.form()
            q.update({k: str(v) for k, v in form.items()})
    if isinstance(body, dict) and isinstance(body.get("location"), dict):
        loc = body["location"]
        coords = loc.get("coords") or {}
        speed_ms = _num(coords.get("speed"))
        point = _point(
            recorded_at=_when(loc.get("timestamp")), lat=_num(coords.get("latitude")), lng=_num(coords.get("longitude")),
            speed_kmh=round(speed_ms * 3.6, 1) if speed_ms is not None and speed_ms >= 0 else None,
            heading=int(_num(coords.get("heading")) or 0) % 361 if _num(coords.get("heading")) is not None and _num(coords.get("heading")) >= 0 else None,
            odometer_km=(_num(loc.get("odometer")) or 0) / 1000 if loc.get("odometer") is not None else None,
        )
        key = body.get("device_id") or q.get("id")
    else:
        speed = _num(q.get("speed"))
        point = _point(
            recorded_at=_when(q.get("timestamp")), lat=_num(q.get("lat")), lng=_num(q.get("lon")),
            speed_kmh=round(speed * KNOTS_TO_KMH, 1) if speed is not None else None,
            heading=int(_num(q.get("bearing"))) % 361 if _num(q.get("bearing")) is not None else None,
            ignition={"true": True, "false": False}.get(str(q.get("ignition")).lower()),
        )
        key = q.get("id") or q.get("deviceid")
    device = svc.device_by_key(db, key)
    svc.ingest(db, device, [point])
    return {"ok": True}


@ingest_router.post("/traccar")
async def traccar(request: Request, x_gps_key: str | None = Header(None), db: Session = Depends(get_db)):
    """Redirection d'un serveur Traccar (forward.url, forward.json=true, forward.header = X-Gps-Key: …).
    Le boîtier est reconnu par son IMEI ; un IMEI inconnu est ignoré (200, pour que Traccar ne réessaie pas)."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="JSON invalide")
    pos = body.get("position") if isinstance(body, dict) else None
    dev = body.get("device") if isinstance(body, dict) else None
    if not isinstance(pos, dict) or not isinstance(dev, dict) or not dev.get("uniqueId"):
        raise HTTPException(status_code=400, detail="Position Traccar attendue")
    device = svc.device_by_relay(db, x_gps_key, str(dev["uniqueId"])[:32])
    if device is None:
        return {"ok": False, "reason": "IMEI non enregistré dans FlottAuto"}
    attrs = pos.get("attributes") if isinstance(pos.get("attributes"), dict) else {}
    meters = _num(attrs.get("odometer")) or _num(attrs.get("totalDistance"))
    speed = _num(pos.get("speed"))
    fuel = _num(attrs.get("fuel"))
    point = _point(
        recorded_at=_when(pos.get("fixTime") or pos.get("deviceTime")), lat=_num(pos.get("latitude")), lng=_num(pos.get("longitude")),
        speed_kmh=round(speed * KNOTS_TO_KMH, 1) if speed is not None else None,
        heading=int(_num(pos.get("course"))) % 361 if _num(pos.get("course")) is not None else None,
        odometer_km=round(meters / 1000, 1) if meters else None,
        ignition=attrs.get("ignition") if isinstance(attrs.get("ignition"), bool) else None,
        fuel_level_pct=fuel if fuel is not None and 0 <= fuel <= 100 else None,
        fuel_used_l=_num(attrs.get("fuelUsed")),
    )
    return svc.ingest(db, device, [point])


# ───────────── Écrans ─────────────

@router.get("/live")
def live(db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS, R.MANAGER, R.STATION_MANAGER, R.READER, R.ACCOUNTANT))):
    return svc.live(db, _cid(current_user))


@router.get("/vehicles/{vehicle_id}/track")
def track(vehicle_id: int, day: date, db: Session = Depends(get_db),
          current_user: models.User = Depends(require_role(*ADMINS, R.MANAGER, R.STATION_MANAGER, R.READER, R.ACCOUNTANT))):
    return svc.track(db, _cid(current_user), vehicle_id, day)


@router.get("/devices")
def devices(db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS, R.MANAGER))):
    cid = _cid(current_user)
    return {"devices": [svc.read_device(d) for d in svc.list_devices(db, cid)], "relay_configured": svc.relay_configured(db, cid)}


@router.post("/devices", status_code=201)
def create_device(payload: schemas.GpsDeviceCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS))):
    device, key = svc.create_device(db, _cid(current_user), payload)
    return {**svc.read_device(device), "key": key}


@router.patch("/devices/{device_id}")
def update_device(device_id: int, payload: schemas.GpsDeviceUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS))):
    return svc.read_device(svc.update_device(db, svc.get_device(db, _cid(current_user), device_id), payload))


@router.post("/devices/{device_id}/key")
def rotate_key(device_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS))):
    """Nouvelle clé (l'ancienne ne marche plus)."""
    return {"key": svc.rotate_key(db, svc.get_device(db, _cid(current_user), device_id))}


@router.delete("/devices/{device_id}", status_code=204)
def delete_device(device_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS))):
    svc.delete_device(db, svc.get_device(db, _cid(current_user), device_id))


@router.post("/relay-key")
def relay_key(db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS))):
    """Clé du serveur relais Traccar (montrée une fois ; en générer une nouvelle remplace l'ancienne)."""
    return {"key": svc.rotate_relay_key(db, _cid(current_user))}
