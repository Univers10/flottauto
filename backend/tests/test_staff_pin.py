"""Personnel (chauffeurs, convoyeurs) : champs d'exploitation et PIN de signature."""
from datetime import datetime, timedelta, timezone

import pytest

from app import models

R = models.Role


def _create(client, headers, **extra):
    body = {"first_name": "Seidou", "last_name": "Synayoko", **extra}
    r = client.post("/api/v1/drivers", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_staff_fields_round_trip(client, auth):
    admin = auth(R.ADMIN)
    d = _create(client, admin, staff_type="conveyor", medical_visit_expiry="2027-03-01", license_categories="D", itts_staff_id="itts-42")
    assert d["staff_type"] == "conveyor"
    assert d["medical_visit_expiry"] == "2027-03-01"
    assert d["itts_staff_id"] == "itts-42"
    assert d["has_pin"] is False
    assert "pin_hash" not in d


def test_staff_type_defaults_to_driver_and_filters(client, auth):
    admin = auth(R.ADMIN)
    _create(client, admin)
    _create(client, admin, first_name="Awa", staff_type="conveyor")
    assert [d["staff_type"] for d in client.get("/api/v1/drivers?staff_type=conveyor", headers=admin).json()] == ["conveyor"]
    assert len(client.get("/api/v1/drivers", headers=admin).json()) == 2


@pytest.mark.parametrize("pin", ["12", "1234567", "12a4", ""])
def test_pin_format_is_validated(client, auth, pin):
    admin = auth(R.ADMIN)
    d = _create(client, admin)
    assert client.put(f"/api/v1/drivers/{d['id']}/pin", headers=admin, json={"pin": pin}).status_code == 422


def test_set_and_verify_pin(client, auth, db):
    admin = auth(R.ADMIN)
    d = _create(client, admin)
    r = client.put(f"/api/v1/drivers/{d['id']}/pin", headers=admin, json={"pin": "4821"})
    assert r.status_code == 200 and r.json()["has_pin"] is True
    stored = db.get(models.Driver, d["id"]).pin_hash
    assert stored and "4821" not in stored
    assert client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=admin, json={"pin": "4821"}).json() == {"valid": True}
    assert client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=admin, json={"pin": "0000"}).json() == {"valid": False}


def test_pin_locks_after_five_failures(client, auth, db):
    admin = auth(R.ADMIN)
    d = _create(client, admin)
    client.put(f"/api/v1/drivers/{d['id']}/pin", headers=admin, json={"pin": "4821"})
    for _ in range(5):
        client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=admin, json={"pin": "0000"})
    r = client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=admin, json={"pin": "4821"})
    assert r.status_code == 423
    # Après la fin du blocage, le bon PIN fonctionne et remet le compteur à zéro.
    driver = db.get(models.Driver, d["id"])
    driver.pin_locked_until = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    db.commit()
    assert client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=admin, json={"pin": "4821"}).json() == {"valid": True}
    db.refresh(driver)
    assert driver.pin_failed_attempts == 0


def test_verify_without_pin_returns_conflict(client, auth):
    admin = auth(R.ADMIN)
    d = _create(client, admin)
    assert client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=admin, json={"pin": "1234"}).status_code == 409


def test_pin_rights(client, auth):
    d = _create(client, auth(R.ADMIN))
    for role in (R.ADMIN, R.OPERATIONS_SUPERVISOR, R.STATION_MANAGER):
        assert client.put(f"/api/v1/drivers/{d['id']}/pin", headers=auth(role), json={"pin": "1234"}).status_code == 200, role
    for role in (R.MANAGER, R.ACCOUNTANT, R.READER):
        assert client.put(f"/api/v1/drivers/{d['id']}/pin", headers=auth(role), json={"pin": "1234"}).status_code == 403, role


def test_pin_isolation_between_companies(client, auth, make_user, other_company):
    d = _create(client, auth(R.ADMIN))
    other = make_user(R.ADMIN, other_company)[1]
    assert client.put(f"/api/v1/drivers/{d['id']}/pin", headers=other, json={"pin": "1234"}).status_code == 404
    assert client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=other, json={"pin": "1234"}).status_code == 404
