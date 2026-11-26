"""Contraventions : la compagnie paie, le chauffeur rembourse ; son solde suit chaque écriture."""
from app import models


def _driver(client, h, first="Seidou", last="Synayoko"):
    return client.post("/api/v1/drivers", headers=h, json={"first_name": first, "last_name": last}).json()


def _fine(client, h, vehicle_id, driver_id, amount, **kw):
    body = {"vehicle_id": vehicle_id, "driver_id": driver_id, "fine_date": "2026-11-05", "reason": "Excès de vitesse", "place": "Singrobo", "amount": amount, **kw}
    r = client.post("/api/v1/fines", headers=h, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_driver_balance_follows_fines_and_repayments(client, auth, vehicle):
    h = auth(models.Role.MANAGER)
    d = _driver(client, h)
    _fine(client, h, vehicle.id, d["id"], 25_000)
    _fine(client, h, vehicle.id, d["id"], 10_000, status="paid")
    # Absorbed by the company: not in the driver's debt.
    _fine(client, h, vehicle.id, d["id"], 5_000, charged_to_driver=False)

    r = client.post("/api/v1/fines/repayments", headers=h, json={"driver_id": d["id"], "amount": 15_000, "repayment_date": "2026-11-10", "method": "payroll"})
    assert r.status_code == 201, r.text

    st = client.get(f"/api/v1/fines/drivers/{d['id']}", headers=h).json()
    assert (st["charged"], st["repaid"], st["balance"]) == (35_000, 15_000, 20_000)
    assert st["lines"][0]["kind"] == "repayment" and st["lines"][0]["balance"] == 20_000

    # Never repay more than what is owed.
    too_much = client.post("/api/v1/fines/repayments", headers=h, json={"driver_id": d["id"], "amount": 25_000, "repayment_date": "2026-11-11"})
    assert too_much.status_code == 400

    balances = client.get("/api/v1/fines/balances", headers=h).json()
    assert balances[0]["driver_id"] == d["id"] and balances[0]["balance"] == 20_000


def test_paid_status_sets_the_payment_date_and_report_groups_by_driver(client, auth, vehicle):
    h = auth(models.Role.MANAGER)
    d = _driver(client, h)
    f = _fine(client, h, vehicle.id, d["id"], 30_000)
    paid = client.put(f"/api/v1/fines/{f['id']}", headers=h, json={"status": "paid"}).json()
    assert paid["status"] == "paid" and paid["paid_on"] is not None
    assert paid["vehicle_label"] and paid["driver_name"] == "Seidou Synayoko"

    rep = client.get("/api/v1/fines/report?start=2026-11-01&end=2026-11-30", headers=h).json()
    assert rep["count"] == 1 and rep["amount"] == 30_000
    assert rep["drivers"][0]["driver_id"] == d["id"] and rep["drivers"][0]["balance"] == 30_000


def test_roles_and_companies(client, auth, make_user, other_company, vehicle):
    h = auth(models.Role.MANAGER)
    d = _driver(client, h)
    f = _fine(client, h, vehicle.id, d["id"], 12_000)
    # Field staff: no access; reader: read only.
    assert client.get("/api/v1/fines", headers=auth(models.Role.MECHANIC)).status_code == 403
    assert client.get("/api/v1/fines", headers=auth(models.Role.READER)).status_code == 200
    assert client.post("/api/v1/fines/repayments", headers=auth(models.Role.READER), json={"driver_id": d["id"], "amount": 1, "repayment_date": "2026-11-10"}).status_code == 403
    # Another company sees nothing.
    other = make_user(models.Role.MANAGER, other_company)[1]
    assert client.get(f"/api/v1/fines/{f['id']}", headers=other).status_code == 404
    assert client.get("/api/v1/fines", headers=other).json() == []


def test_several_photos_per_fine(client, auth, vehicle):
    h = auth(models.Role.MANAGER)
    d = _driver(client, h)
    f = _fine(client, h, vehicle.id, d["id"], 25_000)
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 128
    for name in ("pv.jpg", "recu.jpg", "car.jpg"):
        r = client.post(f"/api/v1/fines/{f['id']}/photo", headers=h, files={"file": (name, jpeg, "image/jpeg")})
        assert r.status_code == 200, r.text
    photos = r.json()["photos"]
    assert len(photos) == 3 and r.json()["photo_url"] == photos[0]["file_url"]
    after = client.delete(f"/api/v1/fines/{f['id']}/photos/{photos[0]['id']}", headers=h).json()
    assert len(after["photos"]) == 2 and after["photo_url"] == photos[1]["file_url"]
    assert client.delete(f"/api/v1/fines/{f['id']}", headers=h).status_code == 204
