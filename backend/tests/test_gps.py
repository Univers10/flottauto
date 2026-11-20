"""Suivi GPS : boîtiers, réception (clé, OsmAnd, relais Traccar), position en direct, trajets et arrêts."""
from datetime import datetime, timedelta, timezone

from app import models

R = models.Role
# Abidjan → Yamoussoukro, environ 1 km entre deux points (0,009° de latitude).
LAT, LNG = 5.35, -4.02


def _device(client, auth, vehicle, **extra):
    r = client.post("/api/v1/gps/devices", headers=auth(R.ADMIN), json={"vehicle_id": vehicle.id, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _at(minutes: int) -> str:
    base = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0) - timedelta(days=1)
    return (base + timedelta(minutes=minutes)).isoformat()


def test_device_key_is_shown_once_and_positions_update_mileage(client, db, auth, vehicle):
    dev = _device(client, auth, vehicle, imei="350000000000001", model="Teltonika FMC130")
    key = dev["key"]
    assert key.startswith("gps_")
    listed = client.get("/api/v1/gps/devices", headers=auth(R.ADMIN)).json()
    assert "key" not in listed["devices"][0] and listed["relay_configured"] is False

    # One minute per km = 60 km/h, engine on; then a 20 min stop.
    points = [{"recorded_at": _at(i), "lat": LAT + 0.009 * i, "lng": LNG, "speed_kmh": 60, "ignition": True} for i in range(11)]
    points += [{"recorded_at": _at(10 + m), "lat": LAT + 0.09, "lng": LNG, "speed_kmh": 0, "ignition": False} for m in (1, 10, 21)]
    points += [{"recorded_at": _at(32 + i), "lat": LAT + 0.09 + 0.009 * i, "lng": LNG, "speed_kmh": 55, "ignition": True} for i in range(6)]
    r = client.post("/api/v1/gps/ingest", headers={"X-Gps-Key": key}, json={"positions": points})
    assert r.status_code == 200 and r.json() == {"accepted": len(points), "skipped": 0}, r.text
    # Same batch again: nothing twice.
    assert client.post("/api/v1/gps/ingest", headers={"X-Gps-Key": key}, json={"positions": points}).json()["accepted"] == 0

    db.refresh(vehicle)
    assert 14 <= vehicle.mileage <= 16  # ~15 km driven, no odometer from the box

    day = _at(0)[:10]
    track = client.get(f"/api/v1/gps/vehicles/{vehicle.id}/track", headers=auth(R.MANAGER), params={"day": day}).json()
    assert len(track["trips"]) == 2 and track["trips"][0]["max_speed_kmh"] == 60
    assert 9.5 <= track["trips"][0]["km"] <= 10.5
    assert len(track["stops"]) == 1 and track["stops"][0]["minutes"] >= 20

    live = client.get("/api/v1/gps/live", headers=auth(R.ADMIN)).json()
    assert live[0]["vehicle_id"] == vehicle.id and live[0]["state"] in ("moving", "offline")


def test_bad_key_and_impossible_positions_are_refused(client, auth, vehicle):
    key = _device(client, auth, vehicle)["key"]
    point = {"recorded_at": _at(0), "lat": LAT, "lng": LNG}
    assert client.post("/api/v1/gps/ingest", headers={"X-Gps-Key": "gps_wrong"}, json={"positions": [point]}).status_code == 401
    assert client.post("/api/v1/gps/ingest", json={"positions": [point]}).status_code == 401
    assert client.post("/api/v1/gps/ingest", headers={"X-Gps-Key": key}, json={"positions": [{**point, "lat": 120}]}).status_code == 422
    future = {**point, "recorded_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()}
    assert client.post("/api/v1/gps/ingest", headers={"X-Gps-Key": key}, json={"positions": [future]}).json() == {"accepted": 0, "skipped": 1}


def test_phone_app_osmand_and_traccar_relay(client, db, auth, vehicle):
    key = _device(client, auth, vehicle, imei="350000000000002")["key"]
    ts = int(datetime.now(timezone.utc).timestamp()) - 60
    # Old Traccar Client: URL parameters, speed in knots.
    r = client.get("/api/v1/gps/osmand", params={"id": key, "lat": LAT, "lon": LNG, "timestamp": ts, "speed": 10, "bearing": 90})
    assert r.status_code == 200, r.text
    # New Traccar Client: JSON body, speed in m/s.
    body = {"device_id": key, "location": {"timestamp": datetime.now(timezone.utc).isoformat(), "coords": {"latitude": LAT + 0.001, "longitude": LNG, "speed": 10, "heading": 45}}}
    assert client.post("/api/v1/gps/osmand", json=body).status_code == 200
    pos = db.query(models.GpsPosition).order_by(models.GpsPosition.recorded_at).all()
    assert [p.speed_kmh for p in pos] == [18.5, 36.0]

    # Traccar server relay: company relay key, box found by IMEI, odometer in meters.
    relay = client.post("/api/v1/gps/relay-key", headers=auth(R.ADMIN)).json()["key"]
    fwd = {"device": {"uniqueId": "350000000000002"}, "position": {"fixTime": datetime.now(timezone.utc).isoformat(), "latitude": LAT, "longitude": LNG,
           "speed": 0, "course": 10, "attributes": {"ignition": False, "odometer": 412345000, "fuel": 62}}}
    r = client.post("/api/v1/gps/traccar", headers={"X-Gps-Key": relay}, json=fwd)
    assert r.status_code == 200 and r.json()["accepted"] == 1, r.text
    db.refresh(vehicle)
    assert vehicle.mileage == 412345
    unknown = {**fwd, "device": {"uniqueId": "999"}}
    assert client.post("/api/v1/gps/traccar", headers={"X-Gps-Key": relay}, json=unknown).json()["ok"] is False
    assert client.post("/api/v1/gps/traccar", headers={"X-Gps-Key": key}, json=fwd).status_code == 401


def test_only_admins_manage_devices_and_field_staff_sees_nothing(client, auth, vehicle, make_user, other_company):
    assert client.post("/api/v1/gps/devices", headers=auth(R.MANAGER), json={"vehicle_id": vehicle.id}).status_code == 403
    assert client.get("/api/v1/gps/live", headers=auth(R.MECHANIC)).status_code == 403
    _device(client, auth, vehicle)
    # Another company does not see this car.
    _, other = make_user(R.ADMIN, other_company)
    assert client.get("/api/v1/gps/live", headers=other).json() == []
    assert client.get(f"/api/v1/gps/vehicles/{vehicle.id}/track", headers=other, params={"day": "2026-11-20"}).status_code == 404
