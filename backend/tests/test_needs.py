"""Liste des besoins des cars : saisie, cycle de validation, conversion en intervention."""
from app import models

R = models.Role
API = "/api/v1/needs"


def _need(client, headers, vehicle, **extra):
    body = {"vehicle_id": vehicle.id, "title": "Recharge du gaz de clim", "priority": "this_week", "estimated_cost": 15000, **extra}
    r = client.post(API, headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_manual_need_and_total(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle)
    assert n["origin"] == "manual" and n["status"] == "open"
    _need(client, cg, vehicle, title="Lavage", estimated_cost=5000)
    _need(client, cg, vehicle, title="Rayure", priority="to_quote", estimated_cost=None)
    r = client.get(f"{API}?vehicle_id={vehicle.id}", headers=cg).json()
    assert len(r["items"]) == 3 and r["total_estimated"] == 20000


def test_priority_order(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    _need(client, cg, vehicle, title="Bb", priority="to_quote")
    _need(client, cg, vehicle, title="Aa", priority="before_departure")
    _need(client, cg, vehicle, title="Cc", priority="this_week")
    titles = [n["title"] for n in client.get(API, headers=cg).json()["items"]]
    assert titles == ["Aa", "Cc", "Bb"]


def test_only_validators_validate(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle)
    assert client.patch(f"{API}/{n['id']}", headers=cg, json={"status": "validation_requested"}).status_code == 200
    assert client.patch(f"{API}/{n['id']}", headers=cg, json={"status": "validated"}).status_code == 403
    assert client.patch(f"{API}/{n['id']}", headers=auth(R.OPERATIONS_SUPERVISOR), json={"status": "validated"}).status_code == 200


def test_convert_validated_need_to_work_order(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle)
    assert client.post(f"{API}/{n['id']}/work-order", headers=cg).status_code == 409
    client.patch(f"{API}/{n['id']}", headers=auth(R.ADMIN), json={"status": "validated"})
    r = client.post(f"{API}/{n['id']}/work-order", headers=cg)
    assert r.status_code == 201
    wo = r.json()
    assert wo["vehicle_id"] == vehicle.id and wo["title"] == "Recharge du gaz de clim"
    need = client.get(f"{API}?vehicle_id={vehicle.id}", headers=cg).json()["items"][0]
    assert need["work_order_id"] == wo["id"] and need["status"] == "scheduled"
    assert client.post(f"{API}/{n['id']}/work-order", headers=cg).status_code == 409


def test_open_only_filter(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    a = _need(client, cg, vehicle, title="Aa")
    _need(client, cg, vehicle, title="Bb")
    client.patch(f"{API}/{a['id']}", headers=cg, json={"status": "cancelled"})
    assert [n["title"] for n in client.get(f"{API}?open_only=true", headers=cg).json()["items"]] == ["Bb"]


def test_needs_rights_and_isolation(client, auth, vehicle, make_user, other_company):
    assert client.get(API, headers=auth(R.MECHANIC)).status_code == 200
    assert client.post(API, headers=auth(R.MECHANIC), json={"vehicle_id": vehicle.id, "title": "xx", "priority": "this_week"}).status_code == 403
    assert client.get(API, headers=auth(R.CONVEYOR)).status_code == 403
    n = _need(client, auth(R.STATION_MANAGER), vehicle)
    other = make_user(R.ADMIN, other_company)[1]
    assert client.get(API, headers=other).json()["items"] == []
    assert client.patch(f"{API}/{n['id']}", headers=other, json={"status": "cancelled"}).status_code == 404
    assert client.post(API, headers=other, json={"vehicle_id": vehicle.id, "title": "xx", "priority": "this_week"}).status_code == 404


# ───────────── Revue de code phase 1 ─────────────

def test_validated_need_is_locked_for_non_validators(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle)
    client.patch(f"{API}/{n['id']}", headers=auth(R.OPERATIONS_SUPERVISOR), json={"status": "validated"})
    assert client.patch(f"{API}/{n['id']}", headers=cg, json={"estimated_cost": 999999}).status_code == 403
    assert client.patch(f"{API}/{n['id']}", headers=cg, json={"status": "open"}).status_code == 409


def test_need_explicit_null_rejected(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle)
    for body in ({"title": None}, {"priority": None}, {"status": None}):
        assert client.patch(f"{API}/{n['id']}", headers=cg, json=body).status_code == 422


def test_scheduled_need_cannot_reopen(client, auth, vehicle):
    cg, sup = auth(R.STATION_MANAGER), auth(R.OPERATIONS_SUPERVISOR)
    n = _need(client, cg, vehicle)
    client.patch(f"{API}/{n['id']}", headers=sup, json={"status": "validated"})
    client.post(f"{API}/{n['id']}/work-order", headers=cg)
    assert client.patch(f"{API}/{n['id']}", headers=sup, json={"status": "open"}).status_code == 409


def test_work_order_from_need_keeps_vehicle_status(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle, priority="this_week")
    client.patch(f"{API}/{n['id']}", headers=auth(R.ADMIN), json={"status": "validated"})
    client.post(f"{API}/{n['id']}/work-order", headers=cg)
    assert client.get(f"/api/v1/vehicles/{vehicle.id}", headers=cg).json()["status"] == "available"
    assert len(client.get("/api/v1/maintenance/work-orders", headers=cg).json()) == 1


def test_need_validation_is_traced(client, auth, vehicle, db):
    n = _need(client, auth(R.STATION_MANAGER), vehicle)
    client.patch(f"{API}/{n['id']}", headers=auth(R.OPERATIONS_SUPERVISOR), json={"status": "validated"})
    row = db.get(models.VehicleNeed, n["id"])
    db.refresh(row)
    assert row.validated_by_id is not None and row.validated_at is not None


def test_station_manager_cannot_skip_to_done(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    n = _need(client, cg, vehicle)
    assert client.patch(f"{API}/{n['id']}", headers=cg, json={"status": "done"}).status_code == 409
    assert client.patch(f"{API}/{n['id']}", headers=cg, json={"status": "scheduled"}).status_code == 409
