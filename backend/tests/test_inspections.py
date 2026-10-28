"""États des lieux (départ et arrivée) : saisie, photos privées, signatures, validation et effets."""
import pytest

from app import models

R = models.Role
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 128
SLOTS = ["front", "rear", "left", "right", "dashboard", "interior_front", "interior_rear", "hold"]
API = "/api/v1/inspections"


# ───────────────────────── Fixtures ─────────────────────────

def _create(client, headers, vehicle, crew, kind="departure", **extra):
    body = {"vehicle_id": vehicle.id, "kind": kind, "driver_id": crew["driver"]["id"], "conveyor_id": crew["conveyor"]["id"], **extra}
    r = client.post(API, headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _fill(client, headers, insp, statuses=None, mileage=168420):
    """Renseigne tous les points (OK par défaut), le compteur et les 8 photos."""
    statuses = statuses or {}
    items = [{"code": it["code"], "status": statuses.get(it["code"], "ok"), "note": "réserve" if statuses.get(it["code"]) == "reserve" else None} for it in insp["items"]]
    assert client.put(f"{API}/{insp['id']}/items", headers=headers, json=items).status_code == 200
    assert client.patch(f"{API}/{insp['id']}", headers=headers, json={"mileage": mileage, "fuel_level": "three_quarters"}).status_code == 200
    for slot in SLOTS:
        r = client.post(f"{API}/{insp['id']}/photos", headers=headers, data={"slot": slot}, files={"file": (f"{slot}.jpg", JPEG, "image/jpeg")})
        assert r.status_code == 201, r.text
    return client.get(f"{API}/{insp['id']}", headers=headers).json()


def _sign_all(client, headers, insp, driver_pin="1111", conveyor_pin="2222"):
    assert client.post(f"{API}/{insp['id']}/signatures", headers=headers, json={"role": "station_manager"}).status_code == 200
    assert client.post(f"{API}/{insp['id']}/signatures", headers=headers, json={"role": "driver", "pin": driver_pin}).status_code == 200
    assert client.post(f"{API}/{insp['id']}/signatures", headers=headers, json={"role": "conveyor", "pin": conveyor_pin}).status_code == 200


# ───────────────────────── Création et check-list ─────────────────────────

def test_create_departure_inspection_with_checklist(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew, route_label="Abobo → Odienné")
    assert insp["status"] == "draft" and insp["kind"] == "departure"
    assert insp["number"].startswith("EDL-") and insp["number"].endswith("-D")
    sections = {it["section"] for it in insp["items"]}
    assert sections == {"hygiene", "mechanical", "equipment", "technology"}
    assert all(it["status"] is None for it in insp["items"])
    assert insp["missing_photos"] == SLOTS
    assert insp["score"] is None and insp["verdict"] is None


def test_arrival_inspection_has_arrival_checklist(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew, kind="arrival")
    assert {it["section"] for it in insp["items"]} == {"arrival"}
    assert insp["number"].endswith("-A")


# ───────────────────────── Note et verdict ─────────────────────────

def test_two_reserves_give_88_and_fit_with_reserves(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew)
    insp = _fill(client, cg, insp, {"air_conditioning": "reserve", "tyres": "reserve"})
    assert insp["score"] == 88
    assert insp["verdict"] == "fit_with_reserves"


def test_mechanical_ko_is_unfit(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew), {"brakes": "ko"})
    assert insp["verdict"] == "unfit" and insp["score"] == 80


def test_missing_equipment_is_unfit(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew), {"extinguisher": "ko"})
    assert insp["verdict"] == "unfit"


def test_technology_ko_is_not_blocking(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew), {"usb_sound_screen": "ko"})
    assert insp["verdict"] == "fit_with_reserves"


def test_all_ok_is_fit(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    assert insp["verdict"] == "fit" and insp["score"] == 100 and insp["missing_photos"] == []


def test_unknown_item_code_rejected(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew)
    assert client.put(f"{API}/{insp['id']}/items", headers=cg, json=[{"code": "nope", "status": "ok"}]).status_code == 422


# ───────────────────────── Photos privées ─────────────────────────

def test_photos_are_private_and_company_scoped(client, cg, vehicle, crew, make_user, other_company):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    photo = insp["photos"][0]
    assert "/uploads/" not in str(photo)
    url = f"{API}/{insp['id']}/photos/{photo['id']}/file"
    r = client.get(url, headers=cg)
    assert r.status_code == 200 and r.content == JPEG
    assert r.headers["x-content-type-options"] == "nosniff"
    assert client.get(url).status_code == 401
    other = make_user(R.ADMIN, other_company)[1]
    assert client.get(url, headers=other).status_code == 404


def test_photo_slot_replaced_and_validated(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew)
    for _ in range(2):
        client.post(f"{API}/{insp['id']}/photos", headers=cg, data={"slot": "front"}, files={"file": ("f.jpg", JPEG, "image/jpeg")})
    assert len(client.get(f"{API}/{insp['id']}", headers=cg).json()["photos"]) == 1
    assert client.post(f"{API}/{insp['id']}/photos", headers=cg, data={"slot": "roof"}, files={"file": ("f.jpg", JPEG, "image/jpeg")}).status_code == 422
    assert client.post(f"{API}/{insp['id']}/photos", headers=cg, data={"slot": "rear"}, files={"file": ("f.jpg", b"nope", "image/jpeg")}).status_code == 400


# ───────────────────────── Signatures et validation ─────────────────────────

def test_cannot_sign_incomplete_inspection(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew)
    assert client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "station_manager"}).status_code == 409


def test_wrong_pin_refused(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    assert client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "driver", "pin": "9999"}).status_code == 403


def test_validation_requires_three_signatures(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "station_manager"})
    assert client.post(f"{API}/{insp['id']}/validate", headers=cg).status_code == 409
    _sign_all(client, cg, insp)
    r = client.post(f"{API}/{insp['id']}/validate", headers=cg)
    assert r.status_code == 200 and r.json()["status"] == "validated"
    assert {s["role"] for s in r.json()["signatures"]} == {"station_manager", "driver", "conveyor"}


def test_change_after_signing_clears_signatures(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    _sign_all(client, cg, insp)
    client.patch(f"{API}/{insp['id']}", headers=cg, json={"observations": "ajout"})
    assert client.get(f"{API}/{insp['id']}", headers=cg).json()["signatures"] == []


def test_validated_inspection_is_frozen(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    _sign_all(client, cg, insp)
    client.post(f"{API}/{insp['id']}/validate", headers=cg)
    assert client.patch(f"{API}/{insp['id']}", headers=cg, json={"observations": "x"}).status_code == 409
    assert client.put(f"{API}/{insp['id']}/items", headers=cg, json=[{"code": "brakes", "status": "ko"}]).status_code == 409
    assert client.post(f"{API}/{insp['id']}/photos", headers=cg, data={"slot": "front"}, files={"file": ("f.jpg", JPEG, "image/jpeg")}).status_code == 409


def test_conveyor_required_for_validation(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew, conveyor_id=None)
    insp = _fill(client, cg, insp)
    client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "station_manager"})
    client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "driver", "pin": "1111"})
    assert client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "conveyor", "pin": "2222"}).status_code == 409


# ───────────────────────── Effets de la validation ─────────────────────────

def _validate(client, headers, vehicle, crew, statuses=None, kind="departure", mileage=168420, **extra):
    insp = _fill(client, headers, _create(client, headers, vehicle, crew, kind=kind, **extra), statuses, mileage=mileage)
    _sign_all(client, headers, insp)
    r = client.post(f"{API}/{insp['id']}/validate", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_reserves_become_vehicle_needs(client, cg, vehicle, crew):
    _validate(client, cg, vehicle, crew, {"tyres": "reserve", "air_conditioning": "reserve"})
    needs = client.get(f"/api/v1/needs?vehicle_id={vehicle.id}", headers=cg).json()["items"]
    assert len(needs) == 2
    assert {n["origin"] for n in needs} == {"departure_inspection"}
    tyre = next(n for n in needs if "Pneus" in n["title"])
    assert tyre["priority"] == "before_departure"


def test_validation_updates_vehicle_mileage_and_rejects_rollback(client, cg, vehicle, crew):
    _validate(client, cg, vehicle, crew, mileage=168420)
    assert client.get(f"/api/v1/vehicles/{vehicle.id}", headers=cg).json()["mileage"] == 168420
    insp = _fill(client, cg, _create(client, cg, vehicle, crew), mileage=1000)
    _sign_all(client, cg, insp)
    assert client.post(f"{API}/{insp['id']}/validate", headers=cg).status_code == 409
    assert client.get(f"/api/v1/vehicles/{vehicle.id}", headers=cg).json()["mileage"] == 168420


def test_implausible_mileage_jump_rejected(client, cg, vehicle, crew):
    _validate(client, cg, vehicle, crew, mileage=168420)
    insp = _fill(client, cg, _create(client, cg, vehicle, crew), mileage=468420)
    _sign_all(client, cg, insp)
    assert client.post(f"{API}/{insp['id']}/validate", headers=cg).status_code == 409


def test_oil_change_soon_creates_single_need(client, cg, auth, vehicle, crew):
    client.put(f"/api/v1/vehicles/{vehicle.id}", headers=auth(R.ADMIN), json={"last_oil_change_km": 160000, "mileage": 169000})
    _validate(client, cg, vehicle, crew, mileage=169500)
    _validate(client, cg, vehicle, crew, mileage=169600)
    needs = client.get(f"/api/v1/needs?vehicle_id={vehicle.id}", headers=cg).json()["items"]
    oil = [n for n in needs if n["origin"] == "odometer"]
    assert len(oil) == 1 and oil[0]["priority"] == "before_departure"


def test_arrival_day_report(client, cg, auth, vehicle, crew, db):
    dep = _validate(client, cg, vehicle, crew, mileage=168420)
    arr = _create(client, cg, vehicle, crew, kind="arrival")
    assert arr["departure_inspection_id"] == dep["id"]
    arr = _fill(client, cg, arr, {"cleanliness_after": "reserve", "new_damages": "reserve"}, mileage=169222)
    _sign_all(client, cg, arr)
    validated = client.post(f"{API}/{arr['id']}/validate", headers=cg).json()
    assert validated["km_of_day"] == 802
    assert validated["report_late"] is False
    report = client.get(f"{API}/{arr['id']}/day-report", headers=cg).json()
    assert report["km_of_day"] == 802
    assert "needs_total" in report and "deadlines" in report and "day_expenses" in report
    origins = {n["origin"] for n in client.get(f"/api/v1/needs?vehicle_id={vehicle.id}", headers=cg).json()["items"]}
    assert "arrival_inspection" in origins


# ───────────────────────── Droits et isolation ─────────────────────────

def test_rights(client, auth, vehicle, crew):
    body = {"vehicle_id": vehicle.id, "kind": "departure", "driver_id": crew["driver"]["id"]}
    for role in (R.STATION_MANAGER, R.OPERATIONS_SUPERVISOR, R.ADMIN, R.MANAGER):
        assert client.post(API, headers=auth(role), json=body).status_code == 201, role
    for role in (R.MECHANIC, R.CONVEYOR, R.READER, R.ACCOUNTANT):
        assert client.post(API, headers=auth(role), json=body).status_code == 403, role
    assert client.get(API, headers=auth(R.READER)).status_code == 200
    assert client.get(API, headers=auth(R.MECHANIC)).status_code == 403


def test_isolation(client, cg, vehicle, crew, make_user, other_company):
    insp = _create(client, cg, vehicle, crew)
    other = make_user(R.ADMIN, other_company)[1]
    assert client.get(f"{API}/{insp['id']}", headers=other).status_code == 404
    assert client.get(API, headers=other).json() == []
    other_vehicle = client.post("/api/v1/vehicles", headers=other, json={"registration": "X", "brand": "a", "model": "b"}).json()
    r = client.post(API, headers=cg, json={"vehicle_id": other_vehicle["id"], "kind": "departure"})
    assert r.status_code == 404


def test_crew_must_belong_to_company(client, cg, vehicle, make_user, other_company):
    other = make_user(R.ADMIN, other_company)[1]
    d = client.post("/api/v1/drivers", headers=other, json={"first_name": "X", "last_name": "Y"}).json()
    assert client.post(API, headers=cg, json={"vehicle_id": vehicle.id, "kind": "departure", "driver_id": d["id"]}).status_code == 400


# ───────────── Revue de code phase 1 ─────────────

def test_arrived_at_is_server_time(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew, kind="arrival", arrived_at="2030-01-01T00:00:00")
    assert not insp["arrived_at"].startswith("2030")
    r = client.patch(f"{API}/{insp['id']}", headers=cg, json={"arrived_at": "2030-01-01T00:00:00"})
    assert not client.get(f"{API}/{insp['id']}", headers=cg).json()["arrived_at"].startswith("2030")


def test_arrival_links_departure_validated_after_creation(client, cg, vehicle, crew):
    arr = _create(client, cg, vehicle, crew, kind="arrival")
    assert arr["departure_inspection_id"] is None
    dep = _validate(client, cg, vehicle, crew, mileage=100)
    arr = _fill(client, cg, arr, mileage=350)
    _sign_all(client, cg, arr)
    validated = client.post(f"{API}/{arr['id']}/validate", headers=cg).json()
    assert validated["departure_inspection_id"] == dep["id"] and validated["km_of_day"] == 250


def test_arrival_mileage_below_departure_rejected(client, cg, vehicle, crew):
    _validate(client, cg, vehicle, crew, mileage=500)
    arr = _fill(client, cg, _create(client, cg, vehicle, crew, kind="arrival"), mileage=400)
    _sign_all(client, cg, arr)
    assert client.post(f"{API}/{arr['id']}/validate", headers=cg).status_code == 409


def test_same_person_cannot_be_driver_and_conveyor(client, cg, vehicle, crew):
    body = {"vehicle_id": vehicle.id, "kind": "departure", "driver_id": crew["driver"]["id"], "conveyor_id": crew["driver"]["id"]}
    assert client.post(API, headers=cg, json=body).status_code == 400


def test_validate_twice_rejected(client, cg, vehicle, crew):
    insp = _validate(client, cg, vehicle, crew, {"tyres": "reserve"})
    assert client.post(f"{API}/{insp['id']}/validate", headers=cg).status_code == 409
    assert len(client.get(f"/api/v1/needs?vehicle_id={vehicle.id}", headers=cg).json()["items"]) == 1


def test_same_open_defect_not_duplicated(client, cg, vehicle, crew):
    _validate(client, cg, vehicle, crew, {"tyres": "reserve"})
    _validate(client, cg, vehicle, crew, {"tyres": "reserve"})
    titles = [n["title"] for n in client.get(f"/api/v1/needs?vehicle_id={vehicle.id}", headers=cg).json()["items"]]
    assert len(titles) == 1


def test_numbers_are_unique_same_day(client, cg, vehicle, crew):
    numbers = {_create(client, cg, vehicle, crew)["number"] for _ in range(3)}
    assert len(numbers) == 3


def test_score_frozen_at_validation(client, cg, vehicle, crew, monkeypatch):
    insp = _validate(client, cg, vehicle, crew, {"tyres": "reserve"})
    from app.services import checklists
    monkeypatch.setattr(checklists, "RESERVE_PENALTY", 50)
    assert client.get(f"{API}/{insp['id']}", headers=cg).json()["score"] == 94


def test_report_late_after_sixty_minutes(client, cg, vehicle, crew, db):
    from datetime import timedelta
    arr = _create(client, cg, vehicle, crew, kind="arrival")
    row = db.get(models.Inspection, arr["id"])
    row.arrived_at = row.arrived_at - timedelta(minutes=90)
    db.commit()
    arr = _fill(client, cg, arr)
    _sign_all(client, cg, arr)
    assert client.post(f"{API}/{arr['id']}/validate", headers=cg).json()["report_late"] is True


def test_list_has_no_n_plus_one(client, cg, vehicle, crew):
    from sqlalchemy import event
    from app.core.database import engine
    for _ in range(5):
        _create(client, cg, vehicle, crew)
    count = {"n": 0}

    def _count(*_args, **_kw):
        count["n"] += 1

    event.listen(engine, "before_cursor_execute", _count)
    try:
        assert len(client.get(API, headers=cg).json()) == 5
    finally:
        event.remove(engine, "before_cursor_execute", _count)
    assert count["n"] <= 8



# ───────────── Revue de sécurité phase 1 ─────────────

def test_pin_attempts_are_logged_and_throttled_per_collector(client, cg, vehicle, crew, db, auth):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    for _ in range(4):
        client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "driver", "pin": "9999"})
    # Le blocage du PIN du chauffeur (5 essais) n'est pas atteint ; on vise maintenant le convoyeur.
    for _ in range(4):
        client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "conveyor", "pin": "9999"})
    failures = db.query(models.PinAttempt).filter(models.PinAttempt.success.is_(False)).count()
    assert failures == 8
    # Seuil de 10 échecs par heure pour un même collecteur.
    client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "conveyor", "pin": "9999"})
    client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "driver", "pin": "9999"})
    r = client.post(f"{API}/{insp['id']}/signatures", headers=cg, json={"role": "driver", "pin": "1111"})
    assert r.status_code == 429


def test_station_manager_scoped_to_own_station(client, auth, make_user, company, vehicle, crew):
    admin = auth(R.ADMIN)
    abo = client.post("/api/v1/stations", headers=admin, json={"name": "Abobo", "code": "ABO"}).json()
    yop = client.post("/api/v1/stations", headers=admin, json={"name": "Yopougon", "code": "YOP"}).json()
    cg_abo = make_user(R.STATION_MANAGER, company, email="cg-abo@itts-demo.com")
    cg_yop = make_user(R.STATION_MANAGER, company, email="cg-yop@itts-demo.com")
    from app.core.database import SessionLocal
    s = SessionLocal()
    s.get(models.User, cg_abo[0].id).station_id = abo["id"]
    s.get(models.User, cg_yop[0].id).station_id = yop["id"]
    s.commit(); s.close()
    insp = _create(client, cg_abo[1], vehicle, crew, station_id=yop["id"])
    assert insp["station_id"] == abo["id"]
    assert client.get(f"{API}/{insp['id']}", headers=cg_yop[1]).status_code == 404
    assert client.get(API, headers=cg_yop[1]).json() == []
    assert client.get(f"{API}/{insp['id']}", headers=admin).status_code == 200


def test_photo_freshness_is_server_side(client, cg, vehicle, crew):
    insp = _create(client, cg, vehicle, crew)
    data = {"slot": "front", "is_fresh": "true", "captured_at": "2020-01-01T10:00:00Z"}
    r = client.post(f"{API}/{insp['id']}/photos", headers=cg, data=data, files={"file": ("f.jpg", JPEG, "image/jpeg")})
    assert r.json()["is_fresh"] is False


def test_photo_not_cached(client, cg, vehicle, crew):
    insp = _fill(client, cg, _create(client, cg, vehicle, crew))
    r = client.get(f"{API}/{insp['id']}/photos/{insp['photos'][0]['id']}/file", headers=cg)
    assert "no-store" in r.headers["cache-control"]
