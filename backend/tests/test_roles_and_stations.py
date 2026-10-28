"""Nouveaux rôles d'exploitation (chef de gare, superviseur, convoyeur) et gares."""
import pytest

from app import models

R = models.Role

MODULES = ["/api/v1/vehicles", "/api/v1/drivers", "/api/v1/maintenance/work-orders", "/api/v1/alerts", "/api/v1/fuel", "/api/v1/tolls", "/api/v1/dashboard/stats"]


@pytest.mark.parametrize("role", [R.STATION_MANAGER, R.OPERATIONS_SUPERVISOR])
def test_operations_roles_read_all_modules(client, auth, role):
    for path in MODULES:
        assert client.get(path, headers=auth(role)).status_code == 200, (role, path)


def test_conveyor_has_no_module_access(client, auth):
    h = auth(R.CONVEYOR)
    for path in MODULES:
        assert client.get(path, headers=h).status_code == 403, path
    assert client.get("/api/v1/auth/me", headers=h).status_code == 200


def test_station_manager_writes_fleet_but_not_accounts(client, auth, vehicle):
    h = auth(R.STATION_MANAGER)
    assert client.post("/api/v1/vehicles", headers=h, json={"registration": "CG-1", "brand": "a", "model": "b"}).status_code == 201
    wo = client.post("/api/v1/maintenance/work-orders", headers=h, json={"vehicle_id": vehicle.id, "title": "Pneu"}).json()
    assert client.delete(f"/api/v1/maintenance/work-orders/{wo['id']}", headers=h).status_code == 403
    body = {"email": "n@itts-demo.com", "password": "12345678", "role": "mechanic"}
    assert client.post("/api/v1/auth/users", headers=h, json=body).status_code == 403


def test_supervisor_deletes_work_orders_but_cannot_manage_accounts(client, auth, vehicle):
    h = auth(R.OPERATIONS_SUPERVISOR)
    wo = client.post("/api/v1/maintenance/work-orders", headers=h, json={"vehicle_id": vehicle.id, "title": "Pneu"}).json()
    assert client.delete(f"/api/v1/maintenance/work-orders/{wo['id']}", headers=h).status_code == 204
    body = {"email": "n@itts-demo.com", "password": "12345678", "role": "mechanic"}
    assert client.post("/api/v1/auth/users", headers=h, json=body).status_code == 403
    assert client.get("/api/v1/auth/users", headers=h).status_code == 200


# ───────────── Gares ─────────────

def _create_station(client, headers, code="ABO", name="Gare d'Abobo"):
    return client.post("/api/v1/stations", headers=headers, json={"name": name, "code": code})


def test_station_crud(client, auth):
    admin = auth(R.ADMIN)
    r = _create_station(client, admin)
    assert r.status_code == 201
    st = r.json()
    assert st["code"] == "ABO" and st["active"] is True and st["itts_station_id"] is None
    r = client.put(f"/api/v1/stations/{st['id']}", headers=admin, json={"name": "Gare d'Abidjan-Abobo", "active": False})
    assert r.status_code == 200 and r.json()["name"] == "Gare d'Abidjan-Abobo" and r.json()["active"] is False
    assert [s["code"] for s in client.get("/api/v1/stations", headers=admin).json()] == ["ABO"]


def test_station_code_unique_per_company(client, auth, make_user, other_company):
    assert _create_station(client, auth(R.ADMIN)).status_code == 201
    assert _create_station(client, auth(R.ADMIN)).status_code == 409
    other_admin = make_user(R.ADMIN, other_company)[1]
    assert _create_station(client, other_admin).status_code == 201


def test_station_isolation_between_companies(client, auth, make_user, other_company):
    st = _create_station(client, auth(R.ADMIN)).json()
    other_admin = make_user(R.ADMIN, other_company)[1]
    assert client.get("/api/v1/stations", headers=other_admin).json() == []
    assert client.put(f"/api/v1/stations/{st['id']}", headers=other_admin, json={"name": "Autre gare"}).status_code == 404


def test_station_write_rights(client, auth):
    assert _create_station(client, auth(R.OPERATIONS_SUPERVISOR), code="YOP").status_code == 201
    for role in (R.STATION_MANAGER, R.MECHANIC):
        assert _create_station(client, auth(role), code="ODI").status_code == 403
    assert client.get("/api/v1/stations", headers=auth(R.STATION_MANAGER)).status_code == 200
    assert client.get("/api/v1/stations", headers=auth(R.CONVEYOR)).status_code == 403


def test_station_manager_account_is_attached_to_station(client, auth, make_user, other_company):
    admin = auth(R.ADMIN)
    st = _create_station(client, admin).json()
    body = {"email": "cg@itts-demo.com", "password": "12345678", "role": "station_manager", "station_id": st["id"]}
    r = client.post("/api/v1/auth/users", headers=admin, json=body)
    assert r.status_code == 201 and r.json()["station_id"] == st["id"]
    # Une gare d'une autre société est refusée.
    other_st = _create_station(client, make_user(R.ADMIN, other_company)[1], code="ZZZ").json()
    body = {"email": "cg2@itts-demo.com", "password": "12345678", "role": "station_manager", "station_id": other_st["id"]}
    assert client.post("/api/v1/auth/users", headers=admin, json=body).status_code == 400
