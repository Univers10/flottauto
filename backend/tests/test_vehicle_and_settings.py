"""Véhicule (vidange, carburant, lien ITTS) et réglages de calcul de la société."""
import pytest

from app import models

R = models.Role


def _vehicle(client, headers, **extra):
    body = {"registration": "AB-586-CI", "brand": "Yutong", "model": "ZK6122", **extra}
    r = client.post("/api/v1/vehicles", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_oil_change_due_is_computed(client, auth):
    v = _vehicle(client, auth(R.ADMIN), mileage=168420, last_oil_change_km=160000, oil_change_interval_km=10000)
    assert v["oil_change_due_in_km"] == 1580


def test_oil_change_overdue_is_negative(client, auth):
    v = _vehicle(client, auth(R.ADMIN), mileage=171000, last_oil_change_km=160000)
    assert v["oil_change_interval_km"] == 10000
    assert v["oil_change_due_in_km"] == -1000


def test_oil_change_unknown_without_reading(client, auth):
    assert _vehicle(client, auth(R.ADMIN))["oil_change_due_in_km"] is None


def test_fuel_and_itts_fields_round_trip(client, auth):
    admin = auth(R.ADMIN)
    v = _vehicle(client, admin, fuel_tank_liters=400, fuel_consumption_l_100km=33, itts_bus_id="bus-586")
    r = client.put(f"/api/v1/vehicles/{v['id']}", headers=admin, json={**v, "fuel_tank_liters": 450})
    assert r.status_code == 200
    body = r.json()
    assert body["fuel_tank_liters"] == 450
    assert float(body["fuel_consumption_l_100km"]) == 33
    assert body["itts_bus_id"] == "bus-586"


# ───────────── Réglages ─────────────

DEFAULTS = {
    "diesel_price_per_liter": 715,
    "driver_daily_ration": 10000,
    "conveyor_daily_ration": 5000,
    "broker_commission_pct": 5,
    "line_revenue_per_bus_day": 147342,
    "immobilization_daily_rate": 100000,
    "document_warning_days": 30,
    "oil_change_warning_km": 2000,
}


def test_settings_defaults_created_on_first_read(client, auth):
    r = client.get("/api/v1/settings/operations", headers=auth(R.STATION_MANAGER))
    assert r.status_code == 200
    body = r.json()
    for key, value in DEFAULTS.items():
        assert float(body[key]) == value, key


def test_settings_update(client, auth):
    admin = auth(R.ADMIN)
    r = client.put("/api/v1/settings/operations", headers=admin, json={"diesel_price_per_liter": 730, "broker_commission_pct": 7.5})
    assert r.status_code == 200
    body = client.get("/api/v1/settings/operations", headers=admin).json()
    assert body["diesel_price_per_liter"] == 730
    assert float(body["broker_commission_pct"]) == 7.5
    assert body["driver_daily_ration"] == 10000


@pytest.mark.parametrize("payload", [{"diesel_price_per_liter": -1}, {"broker_commission_pct": 150}, {"document_warning_days": 0}])
def test_settings_validation(client, auth, payload):
    assert client.put("/api/v1/settings/operations", headers=auth(R.ADMIN), json=payload).status_code == 422


def test_settings_rights(client, auth):
    assert client.put("/api/v1/settings/operations", headers=auth(R.OPERATIONS_SUPERVISOR), json={"diesel_price_per_liter": 720}).status_code == 200
    for role in (R.STATION_MANAGER, R.MANAGER, R.MECHANIC):
        assert client.put("/api/v1/settings/operations", headers=auth(role), json={"diesel_price_per_liter": 1}).status_code == 403, role
    assert client.get("/api/v1/settings/operations", headers=auth(R.CONVEYOR)).status_code == 403


def test_settings_isolation(client, auth, make_user, other_company):
    client.put("/api/v1/settings/operations", headers=auth(R.ADMIN), json={"diesel_price_per_liter": 800})
    other = make_user(R.ADMIN, other_company)[1]
    assert client.get("/api/v1/settings/operations", headers=other).json()["diesel_price_per_liter"] == 715
