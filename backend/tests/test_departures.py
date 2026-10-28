"""Autorisation de départ : check-list système, bon de sortie QR, remplacement du car."""
from datetime import date, datetime, timedelta, timezone

import pytest

from app import models
from test_inspections import _fill, _sign_all

R = models.Role
API = "/api/v1/departures"
DOCS = ["insurance", "technical_control", "registration_card", "transport_card"]


def _future(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def _comply_vehicle(client, admin, vehicle_id, skip=(), expiry_days=200, oil_due=5000):
    for doc in DOCS:
        if doc in skip:
            continue
        expiry = None if doc == "registration_card" else _future(expiry_days)
        client.post(f"/api/v1/vehicles/{vehicle_id}/documents", headers=admin, json={"name": doc, "document_type": doc, "expiry_date": expiry})
    v = client.get(f"/api/v1/vehicles/{vehicle_id}", headers=admin).json()
    client.put(f"/api/v1/vehicles/{vehicle_id}", headers=admin, json={
        "mileage": 168000, "last_oil_change_km": 168000 + oil_due - v["oil_change_interval_km"],
        "fuel_consumption_l_100km": 33,
    })


def _comply_crew(client, admin, crew, medical_days=200):
    client.put(f"/api/v1/drivers/{crew['driver']['id']}", headers=admin, json={
        "license_categories": "B, D", "license_expiry": _future(400), "medical_visit_expiry": _future(medical_days),
    })


def _departure(client, headers, vehicle, crew, hours=2, **extra):
    body = {
        "vehicle_id": vehicle.id,
        "route_label": "Abobo → Odienné",
        "scheduled_at": (datetime.now() + timedelta(hours=hours)).replace(microsecond=0).isoformat(),
        "driver_id": crew["driver"]["id"],
        "conveyor_id": crew["conveyor"]["id"],
        **extra,
    }
    r = client.post(API, headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _inspect(client, headers, dep, statuses=None, mileage=168420, fuel_liters=300):
    r = client.post("/api/v1/inspections", headers=headers, json={"departure_id": dep["id"], "kind": "departure", "vehicle_id": dep["vehicle_id"]})
    assert r.status_code == 201, r.text
    insp = _fill(client, headers, r.json(), statuses, mileage=mileage)
    client.patch(f"/api/v1/inspections/{insp['id']}", headers=headers, json={"fuel_liters": fuel_liters})
    insp = client.get(f"/api/v1/inspections/{insp['id']}", headers=headers).json()
    _sign_all(client, headers, insp)
    assert client.post(f"/api/v1/inspections/{insp['id']}/validate", headers=headers).status_code == 200
    return insp


def _check(client, headers, dep_id):
    return client.get(f"{API}/{dep_id}", headers=headers).json()["checklist"]


def _item(checklist, code):
    for group in checklist["groups"]:
        for item in group["items"]:
            if item["code"] == code:
                return item
    raise AssertionError(code)


@pytest.fixture
def ready(client, auth, cg, vehicle, crew):
    """Départ entièrement en règle : papiers, équipage, vidange, état des lieux validé."""
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew, distance_km=600)
    _inspect(client, cg, dep)
    return dep


# ───────────────────────── Check-list ─────────────────────────

def test_compliant_departure_is_green(client, cg, ready):
    cl = _check(client, cg, ready["id"])
    assert cl["status"] == "green", cl
    assert cl["blocking_reason"] is None
    assert {g["key"] for g in cl["groups"]} == {"papers", "crew", "vehicle", "operations"}


def test_departure_without_inspection_is_blocked(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    cl = _check(client, cg, dep["id"])
    assert cl["status"] == "red" and _item(cl, "inspection")["status"] == "blocked"


@pytest.mark.parametrize("skip", ["insurance", "transport_card"])
def test_missing_document_blocks(client, auth, cg, vehicle, crew, skip):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, skip=(skip,))
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    cl = _check(client, cg, dep["id"])
    assert cl["status"] == "red" and _item(cl, f"doc_{skip}")["status"] == "blocked"


def test_expired_insurance_blocks_with_reason(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, skip=("insurance",))
    client.post(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin, json={"name": "Assurance", "document_type": "insurance", "expiry_date": _future(-19)})
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    cl = _check(client, cg, dep["id"])
    assert cl["status"] == "red" and "Assurance" in cl["blocking_reason"]


def test_document_expiring_soon_is_orange(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, expiry_days=15)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    cl = _check(client, cg, dep["id"])
    assert cl["status"] == "orange" and _item(cl, "doc_technical_control")["status"] == "warning"


def test_driver_without_category_d_blocks(client, auth, cg, ready, crew):
    client.put(f"/api/v1/drivers/{crew['driver']['id']}", headers=auth(R.ADMIN), json={"license_categories": "B"})
    assert _item(_check(client, cg, ready["id"]), "driver_license")["status"] == "blocked"


def test_medical_visit_missing_date_is_orange(client, auth, cg, ready, crew):
    client.put(f"/api/v1/drivers/{crew['driver']['id']}", headers=auth(R.ADMIN), json={"medical_visit_expiry": None})
    cl = _check(client, cg, ready["id"])
    assert _item(cl, "driver_medical")["status"] == "warning" and cl["status"] == "orange"


def test_driver_rest_under_ten_hours_blocks(client, auth, cg, ready, vehicle, crew, db):
    # Arrivée validée du chauffeur il y a 4 h.
    arr = client.post("/api/v1/inspections", headers=cg, json={"vehicle_id": vehicle.id, "kind": "arrival", "driver_id": crew["driver"]["id"], "conveyor_id": crew["conveyor"]["id"]}).json()
    arr = _fill(client, cg, arr, mileage=168500)
    _sign_all(client, cg, arr)
    client.post(f"/api/v1/inspections/{arr['id']}/validate", headers=cg)
    row = db.get(models.Inspection, arr["id"])
    row.arrived_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=4)
    db.commit()
    item = _item(_check(client, cg, ready["id"]), "driver_rest")
    assert item["status"] == "blocked"


def test_missing_conveyor_blocks(client, cg, ready):
    client.patch(f"{API}/{ready['id']}", headers=cg, json={"conveyor_id": None})
    assert _item(_check(client, cg, ready["id"]), "conveyor")["status"] == "blocked"


def test_unfit_inspection_blocks(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep, {"brakes": "ko"})
    assert _item(_check(client, cg, dep["id"]), "inspection")["status"] == "blocked"


def test_inspection_with_reserves_is_orange(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep, {"air_conditioning": "reserve"})
    assert _check(client, cg, dep["id"])["status"] == "orange"


@pytest.mark.parametrize("oil_due,expected", [(1500, "warning"), (-200, "blocked")])
def test_oil_change(client, auth, cg, vehicle, crew, oil_due, expected):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, oil_due=oil_due + 420)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    assert _item(_check(client, cg, dep["id"]), "oil_change")["status"] == expected


def test_fuel_insufficient_blocks(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew, distance_km=800)
    _inspect(client, cg, dep, fuel_liters=100)
    item = _item(_check(client, cg, dep["id"]), "fuel")
    assert item["status"] == "blocked"


def test_fuel_unknown_is_orange(client, cg, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    cl = _check(client, cg, dep["id"])
    assert _item(cl, "fuel")["status"] == "warning" and cl["status"] == "orange"


# ───────────────────────── Bon de sortie ─────────────────────────

def test_exit_pass_issued_and_verified(client, cg, ready):
    r = client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    assert r.status_code == 200, r.text
    dep = r.json()
    assert dep["status"] == "authorized" and dep["exit_pass_number"].startswith("AD-")
    pass_ = client.get(f"{API}/{ready['id']}/exit-pass", headers=cg).json()
    assert pass_["qr_svg"].startswith("<svg") and pass_["token"]
    v = client.get(f"/api/v1/exit-passes/verify?token={pass_['token']}").json()
    assert v["valid"] is True and v["registration"] == "AB-586-CI"
    assert "driver" not in str(v).lower()


def test_red_departure_cannot_be_forced(client, auth, cg, vehicle, crew):
    dep = _departure(client, cg, vehicle, crew)
    for role in (R.STATION_MANAGER, R.ADMIN, R.SUPER_ADMIN, R.OPERATIONS_SUPERVISOR):
        assert client.post(f"{API}/{dep['id']}/exit-pass", headers=auth(role)).status_code == 409


def test_orange_departure_alerts_supervisor(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, expiry_days=15)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    assert client.post(f"{API}/{dep['id']}/exit-pass", headers=cg).status_code == 200
    alerts = client.get("/api/v1/alerts", headers=admin).json()
    assert any(a["alert_type"] == "departure_warning" for a in alerts)


def test_tampered_or_revoked_token_is_invalid(client, cg, ready):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    token = client.get(f"{API}/{ready['id']}/exit-pass", headers=cg).json()["token"]
    bad = token[:-2] + ("00" if token[-2:] != "00" else "11")
    assert client.get(f"/api/v1/exit-passes/verify?token={bad}").json()["valid"] is False
    assert client.get("/api/v1/exit-passes/verify?token=garbage").json()["valid"] is False
    # Changer le chauffeur annule le bon.
    client.patch(f"{API}/{ready['id']}", headers=cg, json={"route_label": "Autre ligne"})
    assert client.get(f"/api/v1/exit-passes/verify?token={token}").json()["valid"] is True
    client.post(f"{API}/{ready['id']}/cancel", headers=cg)
    assert client.get(f"/api/v1/exit-passes/verify?token={token}").json()["valid"] is False


def test_crew_change_revokes_pass(client, auth, cg, ready):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    other = client.post("/api/v1/drivers", headers=auth(R.ADMIN), json={"first_name": "Ousmane", "last_name": "Koné"}).json()
    dep = client.patch(f"{API}/{ready['id']}", headers=cg, json={"driver_id": other["id"]}).json()
    assert dep["status"] == "planned" and dep["exit_pass_number"] is None


def test_mark_departed(client, cg, ready):
    assert client.post(f"{API}/{ready['id']}/depart", headers=cg).status_code == 409
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    r = client.post(f"{API}/{ready['id']}/depart", headers=cg)
    assert r.status_code == 200 and r.json()["status"] == "departed"
    assert client.patch(f"{API}/{ready['id']}", headers=cg, json={"route_label": "x y"}).status_code == 409


# ───────────────────────── Remplacement ─────────────────────────

def test_replacement_proposal_and_assignment(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, skip=("insurance",))
    _comply_crew(client, admin, crew)
    good = client.post("/api/v1/vehicles", headers=admin, json={"registration": "AB-530-CI", "brand": "Yutong", "model": "ZK"}).json()
    bad = client.post("/api/v1/vehicles", headers=admin, json={"registration": "AB-576-CI", "brand": "Yutong", "model": "ZK"}).json()
    _comply_vehicle(client, admin, good["id"])
    dep = _departure(client, cg, vehicle, crew)
    proposals = client.get(f"{API}/{dep['id']}/replacements", headers=cg).json()
    ids = [p["vehicle"]["id"] for p in proposals]
    assert good["id"] in ids and bad["id"] not in ids and vehicle.id not in ids
    assert client.post(f"{API}/{dep['id']}/replace", headers=cg, json={"vehicle_id": bad["id"]}).status_code == 409
    r = client.post(f"{API}/{dep['id']}/replace", headers=cg, json={"vehicle_id": good["id"]})
    assert r.status_code == 200 and r.json()["vehicle_id"] == good["id"] and r.json()["inspection_id"] is None


# ───────────────────────── Liste, droits, isolation ─────────────────────────

def test_day_list_with_summary(client, cg, ready):
    rows = client.get(f"{API}?day={date.today().isoformat()}", headers=cg).json()
    assert len(rows) == 1 and rows[0]["checklist"]["status"] == "green"


def test_inspection_from_departure_is_linked_and_prefilled(client, cg, ready):
    dep = client.get(f"{API}/{ready['id']}", headers=cg).json()
    insp = client.get(f"/api/v1/inspections/{dep['inspection_id']}", headers=cg).json()
    assert insp["route_label"] == "Abobo → Odienné" and insp["driver_id"] == dep["driver_id"]


def test_rights_and_isolation(client, auth, cg, vehicle, crew, make_user, other_company):
    dep = _departure(client, cg, vehicle, crew)
    assert client.get(API, headers=auth(R.MECHANIC)).status_code == 403
    assert client.post(API, headers=auth(R.READER), json={"vehicle_id": vehicle.id, "scheduled_at": datetime.now().isoformat()}).status_code == 403
    other = make_user(R.ADMIN, other_company)[1]
    assert client.get(f"{API}/{dep['id']}", headers=other).status_code == 404
    assert client.post(f"{API}/{dep['id']}/exit-pass", headers=other).status_code == 404


# ───────────── Revue de code phase 2 ─────────────

def test_checklist_uses_now_when_issued_late(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, skip=("insurance",))
    client.post(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin, json={"name": "A", "document_type": "insurance", "expiry_date": _future(-1)})
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew, hours=-30)  # départ prévu hier, pas encore parti
    _inspect(client, cg, dep)
    assert _item(_check(client, cg, dep["id"]), "doc_insurance")["status"] == "blocked"


def test_new_inspection_on_authorized_departure_revokes_pass(client, cg, ready):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    r = client.post("/api/v1/inspections", headers=cg, json={"departure_id": ready["id"], "kind": "departure", "vehicle_id": ready["vehicle_id"]})
    assert r.status_code == 201
    dep = client.get(f"{API}/{ready['id']}", headers=cg).json()
    assert dep["status"] == "planned" and dep["exit_pass_number"] is None
    assert client.post(f"{API}/{ready['id']}/depart", headers=cg).status_code == 409


def test_revoked_token_stays_invalid_after_reissue(client, auth, cg, ready, crew):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    old = client.get(f"{API}/{ready['id']}/exit-pass", headers=cg).json()["token"]
    other = client.post("/api/v1/drivers", headers=auth(R.ADMIN), json={"first_name": "O", "last_name": "K", "license_categories": "D", "license_expiry": _future(300), "medical_visit_expiry": _future(300)}).json()
    client.patch(f"{API}/{ready['id']}", headers=cg, json={"driver_id": other["id"]})
    client.patch(f"{API}/{ready['id']}", headers=cg, json={"driver_id": crew["driver"]["id"]})
    assert client.post(f"{API}/{ready['id']}/exit-pass", headers=cg).status_code == 200
    assert client.get(f"/api/v1/exit-passes/verify?token={old}").json()["valid"] is False


@pytest.mark.parametrize("token", ["MS5BRC1YLjEyMw.é", "!!!.abc", "a" * 600, "", "x.y.z"])
def test_malformed_tokens_never_crash(client, token):
    r = client.get(f"/api/v1/exit-passes/verify?token={token}")
    assert r.status_code in (200, 422) and (r.status_code == 422 or r.json()["valid"] is False)


def test_distance_change_revokes_pass(client, cg, ready):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    dep = client.patch(f"{API}/{ready['id']}", headers=cg, json={"distance_km": 2000}).json()
    assert dep["status"] == "planned"


def test_undated_document_does_not_hide_expired_one(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, skip=("insurance",))
    client.post(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin, json={"name": "A", "document_type": "insurance", "expiry_date": _future(-5)})
    client.post(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin, json={"name": "A2", "document_type": "insurance"})
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    assert _item(_check(client, cg, dep["id"]), "doc_insurance")["status"] == "blocked"


def test_required_document_without_expiry_is_warning(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, skip=("insurance",))
    client.post(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin, json={"name": "A2", "document_type": "insurance"})
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew)
    _inspect(client, cg, dep)
    assert _item(_check(client, cg, dep["id"]), "doc_insurance")["status"] == "warning"


def test_list_query_count_is_bounded(client, auth, cg, vehicle, crew):
    from sqlalchemy import event
    from app.core.database import engine
    for h in range(2, 7):
        _departure(client, cg, vehicle, crew, hours=h)
    count = {"n": 0}

    def _count(*_a, **_k):
        count["n"] += 1

    event.listen(engine, "before_cursor_execute", _count)
    try:
        assert len(client.get(API, headers=cg).json()) == 5
    finally:
        event.remove(engine, "before_cursor_execute", _count)
    assert count["n"] <= 45


def test_station_manager_scope_on_departures(client, auth, make_user, company, vehicle, crew):
    admin = auth(R.ADMIN)
    abo = client.post("/api/v1/stations", headers=admin, json={"name": "Abobo", "code": "ABO"}).json()
    yop = client.post("/api/v1/stations", headers=admin, json={"name": "Yopougon", "code": "YOP"}).json()
    a = make_user(R.STATION_MANAGER, company, email="cga@itts-demo.com")
    b = make_user(R.STATION_MANAGER, company, email="cgb@itts-demo.com")
    from app.core.database import SessionLocal
    s = SessionLocal()
    s.get(models.User, a[0].id).station_id = abo["id"]
    s.get(models.User, b[0].id).station_id = yop["id"]
    s.commit(); s.close()
    dep = _departure(client, a[1], vehicle, crew)
    assert client.get(f"{API}/{dep['id']}", headers=b[1]).status_code == 404



# ───────────── Revue de sécurité phase 2 ─────────────

def test_pass_invalid_when_checklist_turns_red_after_issue(client, auth, cg, ready, vehicle):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    token = client.get(f"{API}/{ready['id']}/exit-pass", headers=cg).json()["token"]
    admin = auth(R.ADMIN)
    for doc in client.get(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin).json():
        if doc["document_type"] == "insurance":
            client.delete(f"/api/v1/vehicles/{vehicle.id}/documents/{doc['id']}", headers=admin)
    assert client.get(f"/api/v1/exit-passes/verify?token={token}").json()["valid"] is False
    assert client.post(f"{API}/{ready['id']}/depart", headers=cg).status_code == 409


def test_vehicle_in_maintenance_blocks(client, auth, cg, ready, vehicle):
    client.put(f"/api/v1/vehicles/{vehicle.id}", headers=auth(R.ADMIN), json={"status": "in_maintenance"})
    assert _item(_check(client, cg, ready["id"]), "vehicle_status")["status"] == "blocked"


def test_cannot_issue_too_early(client, auth, cg, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    dep = _departure(client, cg, vehicle, crew, hours=10, distance_km=100)
    _inspect(client, cg, dep)
    r = client.post(f"{API}/{dep['id']}/exit-pass", headers=cg)
    assert r.status_code == 409 and "tôt" in r.json()["detail"]


def test_inspection_crew_must_match_departure(client, auth, cg, ready):
    other = client.post("/api/v1/drivers", headers=auth(R.ADMIN), json={"first_name": "Ousmane", "last_name": "Koné", "license_categories": "D", "license_expiry": _future(300), "medical_visit_expiry": _future(300)}).json()
    client.patch(f"{API}/{ready['id']}", headers=cg, json={"driver_id": other["id"]})
    assert _item(_check(client, cg, ready["id"]), "inspection")["status"] == "blocked"


def test_inspection_cannot_serve_two_departures(client, cg, ready, vehicle, crew):
    insp_id = client.get(f"{API}/{ready['id']}", headers=cg).json()["inspection_id"]
    other = _departure(client, cg, vehicle, crew, hours=3)
    assert client.patch(f"{API}/{other['id']}", headers=cg, json={"inspection_id": insp_id}).status_code == 400


def test_departed_pass_is_no_longer_valid(client, cg, ready):
    client.post(f"{API}/{ready['id']}/exit-pass", headers=cg)
    token = client.get(f"{API}/{ready['id']}/exit-pass", headers=cg).json()["token"]
    client.post(f"{API}/{ready['id']}/depart", headers=cg)
    v = client.get(f"/api/v1/exit-passes/verify?token={token}").json()
    assert v["valid"] is False and "sorti" in v["reason"]


def test_notify_is_throttled(client, auth, cg, vehicle, crew):
    dep = _departure(client, cg, vehicle, crew)
    for _ in range(3):
        assert client.post(f"{API}/{dep['id']}/notify", headers=cg).status_code == 204
    admin = auth(R.ADMIN)
    alerts = [a for a in client.get("/api/v1/alerts", headers=admin).json() if a["alert_type"] == "departure_blocked"]
    assert len(alerts) == 1


def test_reader_cannot_edit_vehicle_documents(client, auth, vehicle):
    body = {"name": "Assurance", "document_type": "insurance", "expiry_date": _future(100)}
    assert client.post(f"/api/v1/vehicles/{vehicle.id}/documents", headers=auth(R.READER), json=body).status_code == 403
    assert client.put(f"/api/v1/vehicles/{vehicle.id}", headers=auth(R.ACCOUNTANT), json={"mileage": 1}).status_code == 403
    assert client.get(f"/api/v1/vehicles/{vehicle.id}", headers=auth(R.READER)).status_code == 200
