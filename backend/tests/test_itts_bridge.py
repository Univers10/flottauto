"""Pont ITTS Gestion → FlottAuto : événements signés, correspondances, autorisation de départ."""
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import models
from test_departures import _comply_crew, _comply_vehicle, _inspect

R = models.Role
SECRET = "itts-test-secret-0123456789abcdef0123"
EVENTS = "/api/v1/integrations/itts/events"


def _signed(method: str, path: str, body: bytes = b"", ts: int | None = None, secret: str = SECRET) -> dict:
    ts = int(time.time()) if ts is None else ts
    msg = f"{ts}.{method}.{path}.".encode() + body
    return {"X-Itts-Timestamp": str(ts), "X-Itts-Signature": hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()}


def _post_event(client, event: dict, **sign_kw):
    body = json.dumps(event).encode()
    headers = {"Content-Type": "application/json", **_signed("POST", EVENTS, body, **sign_kw)}
    return client.post(EVENTS, content=body, headers=headers)


def _event(etype="departure.upserted", dep_id="itts-dep-1", plate="AB-586-CI", driver="drv-1", conveyor="cvy-1", hours=2, **dep):
    departure = {
        "id": dep_id,
        "number": 3,
        "service_date": datetime.now(timezone.utc).date().isoformat(),
        "departure_at": (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(),
        "status": "PROGRAMME",
        "mode": "HEURE_FIXE",
        "route": {"from": "Abidjan-Abobo", "to": "Odienné"},
        "station": {"id": "st-abo", "code": "ABO", "name": "Abidjan-Abobo"},
        "bus": {"id": "bus-586", "plate": plate, "number": "586"},
        "driver": {"id": driver, "name": "SEIDOU SYNAYOKO", "phone": "0700000000"} if driver else None,
        "conveyor": {"id": conveyor, "name": "Awa Koné", "phone": None} if conveyor else None,
        "departed_at": None,
        **dep,
    }
    return {"id": str(uuid.uuid4()), "type": etype, "occurred_at": datetime.now(timezone.utc).isoformat(), "departure": departure}


def _authorization(client, itts_id, bus_id="bus-586"):
    path = f"/api/v1/integrations/itts/departures/{itts_id}/authorization?bus_id={bus_id}"
    return client.get(path, headers=_signed("GET", path))


def _authorize(client, db, auth, vehicle, crew_conveyor=False):
    """Met le départ ITTS en règle et émet le bon de sortie."""
    dep = _dep(db)
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, {"driver": {"id": dep.driver_id}})
    _set_pins(client, admin, dep)
    client.patch(f"/api/v1/departures/{dep.id}", headers=admin, json={"distance_km": 100})
    _inspect(client, admin, {"id": dep.id, "vehicle_id": vehicle.id})
    assert client.post(f"/api/v1/departures/{dep.id}/exit-pass", headers=admin).status_code == 200
    return _dep(db)


def _set_pins(client, admin, dep):
    """Le personnel créé depuis ITTS n'a pas de PIN : l'admin le définit avant les signatures."""
    client.put(f"/api/v1/drivers/{dep.driver_id}/pin", headers=admin, json={"pin": "1111"})
    if dep.conveyor_id:
        client.put(f"/api/v1/drivers/{dep.conveyor_id}/pin", headers=admin, json={"pin": "2222"})


def _dep(db, itts_id="itts-dep-1"):
    db.expire_all()
    return db.query(models.Departure).filter(models.Departure.itts_departure_id == itts_id).first()


# ───────────────────────── Signature ─────────────────────────

def test_signature_required(client, vehicle):
    body = json.dumps(_event()).encode()
    assert client.post(EVENTS, content=body, headers={"Content-Type": "application/json"}).status_code == 401
    assert _post_event(client, _event(), secret="wrong-secret-0123456789abcdef0123456").status_code == 401
    assert _post_event(client, _event(), ts=int(time.time()) - 600).status_code == 401
    # Corps modifié après signature
    event = _event()
    body = json.dumps(event).encode()
    headers = {"Content-Type": "application/json", **_signed("POST", EVENTS, body)}
    assert client.post(EVENTS, content=body + b" ", headers=headers).status_code == 401


# ───────────────────────── Événements ─────────────────────────

def test_upsert_creates_departure_and_maps_references(client, db, vehicle):
    r = _post_event(client, _event())
    assert r.status_code == 200 and r.json()["status"] == "processed", r.text
    dep = _dep(db)
    assert dep is not None and dep.vehicle_id == vehicle.id and dep.route_label == "Abidjan-Abobo → Odienné"
    assert db.get(models.Vehicle, vehicle.id).itts_bus_id == "bus-586"
    assert dep.driver.itts_staff_id == "drv-1" and dep.driver.staff_type == models.StaffType.DRIVER
    assert dep.driver.first_name == "SEIDOU" and dep.driver.last_name == "SYNAYOKO"
    assert dep.conveyor.staff_type == models.StaffType.CONVEYOR
    assert dep.station.itts_station_id == "st-abo" and dep.station.code == "ABO"


def test_duplicate_event_processed_once(client, db, vehicle):
    event = _event()
    assert _post_event(client, event).json()["status"] == "processed"
    assert _post_event(client, event).json()["status"] == "duplicate"
    assert db.query(models.Departure).count() == 1


def test_existing_staff_and_station_are_reused(client, db, auth, vehicle):
    admin = auth(R.ADMIN)
    d = client.post("/api/v1/drivers", headers=admin, json={"first_name": "Seidou", "last_name": "Synayoko", "itts_staff_id": "drv-1"}).json()
    client.post("/api/v1/stations", headers=admin, json={"name": "Gare d'Abobo", "code": "ABO"})
    _post_event(client, _event())
    dep = _dep(db)
    assert dep.driver_id == d["id"]
    assert db.query(models.Station).count() == 1 and dep.station.itts_station_id == "st-abo"


def test_crew_change_updates_and_revokes_pass(client, db, auth, cg, vehicle):
    _post_event(client, _event())
    dep = _dep(db)
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    crew = {"driver": {"id": dep.driver_id}, "conveyor": {"id": dep.conveyor_id}}
    _comply_crew(client, admin, crew)
    _set_pins(client, admin, dep)
    client.patch(f"/api/v1/departures/{dep.id}", headers=admin, json={"distance_km": 100})
    _inspect(client, admin, {"id": dep.id, "vehicle_id": vehicle.id})
    assert client.post(f"/api/v1/departures/{dep.id}/exit-pass", headers=admin).status_code == 200
    _post_event(client, _event(driver="drv-2"))
    dep = _dep(db)
    assert dep.status == models.DepartureStatus.PLANNED and dep.driver.itts_staff_id == "drv-2"


def test_unknown_bus_is_pending_then_replayed_after_mapping(client, db, auth, vehicle):
    r = _post_event(client, _event(plate="ZZ-999-CI"))
    assert r.json()["status"] == "pending_mapping"
    assert _dep(db) is None
    admin = auth(R.ADMIN)
    status = client.get("/api/v1/integrations/itts/status", headers=admin).json()
    assert status["enabled"] is True and status["pending_mappings"][0]["plate"] == "ZZ-999-CI"
    r = client.post("/api/v1/integrations/itts/bus-mappings", headers=admin, json={"itts_bus_id": "bus-586", "vehicle_id": vehicle.id})
    assert r.status_code == 200 and r.json()["replayed"] == 1
    assert _dep(db) is not None and db.get(models.Vehicle, vehicle.id).itts_bus_id == "bus-586"


def test_cancelled_event(client, db, vehicle):
    _post_event(client, _event())
    _post_event(client, _event("departure.cancelled"))
    assert _dep(db).status == models.DepartureStatus.CANCELLED


def test_departed_without_pass_raises_infraction_alert(client, db, auth, vehicle):
    _post_event(client, _event())
    _post_event(client, _event("departure.departed", departed_at=datetime.now(timezone.utc).isoformat()))
    assert _dep(db).status == models.DepartureStatus.DEPARTED
    alerts = client.get("/api/v1/alerts", headers=auth(R.ADMIN)).json()
    assert any("sans autorisation" in a["title"] for a in alerts)


def test_upsert_ignored_after_departure_closed(client, db, vehicle):
    _post_event(client, _event())
    _post_event(client, _event("departure.cancelled"))
    assert _post_event(client, _event(driver="drv-9")).json()["status"] == "processed"
    assert _dep(db).status == models.DepartureStatus.CANCELLED


# ───────────────────────── Autorisation ─────────────────────────

def test_authorization_unknown_and_signed(client):
    path = "/api/v1/integrations/itts/departures/nope/authorization?bus_id=bus-586"
    assert client.get(path).status_code == 401
    body = _authorization(client, "nope").json()
    assert body["authorized"] is False and body["status"] == "unknown"


def test_authorization_red_then_authorized(client, db, auth, vehicle):
    _post_event(client, _event())
    dep = _dep(db)
    a = _authorization(client, "itts-dep-1").json()
    assert a["authorized"] is False and a["status"] == "red" and a["reason"]
    assert a["url"].endswith(f"/departures/{dep.id}")
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, {"driver": {"id": dep.driver_id}})
    _set_pins(client, admin, dep)
    client.patch(f"/api/v1/departures/{dep.id}", headers=admin, json={"distance_km": 100})
    _inspect(client, admin, {"id": dep.id, "vehicle_id": vehicle.id})
    client.post(f"/api/v1/departures/{dep.id}/exit-pass", headers=admin)
    a = _authorization(client, "itts-dep-1").json()
    assert a["authorized"] is True and a["exit_pass_number"].startswith("AD-") and a["valid_until"]


def test_status_page_admin_only(client, auth):
    assert client.get("/api/v1/integrations/itts/status", headers=auth(R.STATION_MANAGER)).status_code == 403
    assert client.get("/api/v1/integrations/itts/status", headers=auth(R.OPERATIONS_SUPERVISOR)).status_code == 200


@pytest.mark.parametrize("bad", [{"id": "x"}, {"id": "x", "type": "nope", "departure": {}}])
def test_malformed_event_rejected(client, bad):
    assert _post_event(client, bad).status_code == 422


# ───────────────────────── Régressions (revues phase 3) ─────────────────────────

def test_authorization_requires_matching_bus(client, db, auth, vehicle):
    _post_event(client, _event())
    _authorize(client, db, auth, vehicle)
    path = "/api/v1/integrations/itts/departures/itts-dep-1/authorization"
    assert client.get(path, headers=_signed("GET", path)).status_code == 422
    a = _authorization(client, "itts-dep-1", bus_id="bus-other").json()
    assert a["authorized"] is False and a["status"] == "red" and "car" in a["reason"].lower()
    assert _authorization(client, "itts-dep-1").json()["authorized"] is True


def test_authorization_denied_while_bus_change_pending(client, db, auth, vehicle):
    _post_event(client, _event())
    _authorize(client, db, auth, vehicle)
    # Changement de car vers un car inconnu de FlottAuto : en attente de correspondance.
    event = _event(plate="ZZ-999-CI")
    event["departure"]["bus"]["id"] = "bus-999"
    assert _post_event(client, event).json()["status"] == "pending_mapping"
    a = _authorization(client, "itts-dep-1").json()
    assert a["authorized"] is False and a["status"] == "red"


def test_stale_upsert_is_ignored(client, db, auth, vehicle):
    newer = _event(driver="drv-2")
    older = _event(driver="drv-old")
    older["occurred_at"] = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    assert _post_event(client, newer).json()["status"] == "processed"
    assert _post_event(client, older).json()["status"] == "processed"
    assert _dep(db).driver.itts_staff_id == "drv-2"


def test_stale_pending_event_not_replayed_over_newer(client, db, auth, vehicle):
    old = _event(plate="ZZ-999-CI")
    old["departure"]["bus"]["id"] = "bus-999"
    old["occurred_at"] = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    assert _post_event(client, old).json()["status"] == "pending_mapping"
    assert _post_event(client, _event()).json()["status"] == "processed"  # car connu, plus récent
    other = models.Vehicle(company_id=vehicle.company_id, registration="ZZ-999-CI", brand="Iveco", model="Bus")
    db.add(other)
    db.commit()
    r = client.post("/api/v1/integrations/itts/bus-mappings", headers=auth(R.ADMIN), json={"itts_bus_id": "bus-999", "vehicle_id": other.id})
    assert r.status_code == 200
    assert _dep(db).vehicle_id == vehicle.id


def test_late_departed_event_uses_departure_time(client, db, auth, vehicle):
    _post_event(client, _event())
    dep = _authorize(client, db, auth, vehicle)
    # Bon émis il y a 2 h, expiré depuis 1 h ; le car est sorti il y a 90 min (événement livré en retard).
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    dep.exit_pass_issued_at = now - timedelta(hours=2)
    dep.exit_pass_valid_until = now - timedelta(hours=1)
    db.commit()
    departed_at = (now - timedelta(minutes=90)).replace(tzinfo=timezone.utc)
    _post_event(client, _event("departure.departed", departed_at=departed_at.isoformat()))
    assert _dep(db).status == models.DepartureStatus.DEPARTED
    alerts = client.get("/api/v1/alerts", headers=auth(R.ADMIN)).json()
    assert not any("sans autorisation" in a["title"] for a in alerts)


def test_authorization_stays_true_after_flottauto_marked_departed(client, db, auth, vehicle):
    _post_event(client, _event())
    dep = _authorize(client, db, auth, vehicle)
    assert client.post(f"/api/v1/departures/{dep.id}/depart", headers=auth(R.ADMIN)).status_code == 200
    assert _authorization(client, "itts-dep-1").json()["authorized"] is True


def test_processing_error_is_recorded_then_retried(client, db, vehicle, monkeypatch):
    from app.services import itts_bridge

    event = _event()
    real_apply = itts_bridge._apply
    monkeypatch.setattr(itts_bridge, "_apply", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    assert _post_event(client, event).status_code == 500
    db.expire_all()
    record = db.get(models.IntegrationEvent, event["id"])
    assert record.status == "error" and "boom" in record.error
    monkeypatch.setattr(itts_bridge, "_apply", real_apply)
    assert _post_event(client, event).json()["status"] == "processed"


def test_body_size_and_timestamp_limits(client, vehicle):
    big = json.dumps({"pad": "x" * 70_000}).encode()
    headers = {"Content-Type": "application/json", **_signed("POST", EVENTS, big)}
    assert client.post(EVENTS, content=big, headers=headers).status_code == 413
    body = json.dumps(_event()).encode()
    headers = {"Content-Type": "application/json", "X-Itts-Timestamp": "9" * 400, "X-Itts-Signature": "0" * 64}
    assert client.post(EVENTS, content=body, headers=headers).status_code == 401


def test_bus_mapping_overwrite_requires_force(client, db, auth, vehicle):
    _post_event(client, _event())  # lie bus-586 au car
    event = _event(plate="ZZ-999-CI", dep_id="itts-dep-2")
    event["departure"]["bus"]["id"] = "bus-999"
    _post_event(client, event)
    admin = auth(R.ADMIN)
    body = {"itts_bus_id": "bus-999", "vehicle_id": vehicle.id}
    assert client.post("/api/v1/integrations/itts/bus-mappings", headers=admin, json=body).status_code == 409
    assert client.post("/api/v1/integrations/itts/bus-mappings", headers=admin, json={**body, "force": True}).status_code == 200


def test_short_secret_rejected():
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(DATABASE_URL="sqlite://", SECRET_KEY="x" * 40, ITTS_SHARED_SECRET="too-short")
