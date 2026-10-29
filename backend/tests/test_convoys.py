"""Convois : compte du convoi (chiffres de la maquette), contrat, départ lié et solde obligatoire."""
from datetime import date, datetime, timedelta

import pytest

from app import models
from test_departures import _check, _comply_crew, _comply_vehicle, _inspect, _item

R = models.Role
API = "/api/v1/convoys"

# Maquette « Pèlerinage annuel · Famille Camara » : 6 tronçons, 63 places, 5 jours facturés sur 6.
SEGMENTS = [
    {"from_label": "Abidjan", "to_label": "Danané", "km": 650, "price_per_seat": 10000},
    {"from_label": "Danané", "to_label": "Odienné", "km": 350, "price_per_seat": 7000},
    {"from_label": "Odienné", "to_label": "Minignan", "km": 70, "price_per_seat": 2500},
    {"from_label": "Minignan", "to_label": "Samatiguila", "km": 60, "price_per_seat": 2500},
    {"from_label": "Samatiguila", "to_label": "Odienné", "km": 45, "price_per_seat": 2500},
    {"from_label": "Odienné", "to_label": "Abidjan", "km": 800, "price_per_seat": 12000},
]


def _body(crew=None, vehicle=None, **extra):
    year = date.today().year + 1
    body = {
        "title": "Pèlerinage annuel · Famille Camara",
        "purpose": "pilgrimage",
        "client_name": "Moussa Camara",
        "client_phone": "0700000000",
        "broker_name": "Éric",
        "departure_at": datetime(year, 8, 8, 6, 0).isoformat(),
        "return_date": date(year, 8, 13).isoformat(),
        "meeting_point": "Gare d'Abobo",
        "seats_sold": 63,
        "billed_days": 5,
        "tolls_estimate": 40000,
        "segments": SEGMENTS,
    }
    if vehicle is not None:
        body["vehicle_id"] = vehicle.id
    if crew is not None:
        body["driver_id"] = crew["driver"]["id"]
        body["conveyor_id"] = crew["conveyor"]["id"]
    return {**body, **extra}


@pytest.fixture
def relief(client, auth):
    return client.post("/api/v1/drivers", headers=auth(R.ADMIN), json={"first_name": "Ousmane", "last_name": "Kone"}).json()


def _create(client, headers, **kw):
    r = client.post(API, headers=headers, json=_body(**kw))
    assert r.status_code == 201, r.text
    return r.json()


def test_account_matches_mockup(client, auth, vehicle, crew, relief):
    convoy = _create(client, auth(R.OPERATIONS_SUPERVISOR), crew=crew, vehicle=vehicle, relief_driver_id=relief["id"])
    a = convoy["account"]
    assert convoy["number"] == f"CV-{date.today().year + 1}-001" and convoy["status"] == "draft"
    assert a["km"] == 1975 and a["price_per_seat"] == 36500 and a["days"] == 6
    assert a["revenue"] == 2_799_500
    charges = {line["label"]: line["amount"] for line in a["charge_lines"]}
    assert charges["Carburant"] == 466_180  # 1 975 km × 33 L/100 = 652 L × 715 F
    assert charges["Ration chauffeurs"] == 120_000 and charges["Ration convoyeur"] == 30_000
    assert charges["Commission apporteur (5 %)"] == 139_975
    assert a["charges"] == 796_155 and a["margin"] == 2_003_345 and a["margin_pct"] == 71.6
    assert a["revenue_per_day"] == 466_583 and a["line_ratio"] == 3.2
    assert a["margin_per_km"] == 1014 and a["margin_per_day"] == 333_890
    assert a["break_even_seats"] == 9 and a["fuel_share_pct"] == 59
    assert a["floor_price"] == 796_155 + 147_342 * 6
    assert a["verdict"] == "profitable" and a["verdict_detail"].startswith("×3,2")
    assert any("6 jours d'immobilisation" in alert for alert in a["alerts"])  # 5 jours facturés sur 6
    assert a["balance"] == 2_799_500


def test_settings_drive_the_account_and_verdict(client, auth):
    admin = auth(R.ADMIN)
    client.put("/api/v1/settings/operations", headers=admin, json={"line_revenue_per_bus_day": 600000, "convoy_number_prefix": "ITTS-CV"})
    convoy = _create(client, admin)
    assert convoy["number"].startswith("ITTS-CV-")
    assert convoy["account"]["verdict"] == "weak" and "Négocier" in convoy["account"]["verdict_detail"]
    cheap = client.patch(f"{API}/{convoy['id']}", headers=admin, json={"segments": [SEGMENTS[0] | {"price_per_seat": 100}], "billed_days": 0}).json()
    assert cheap["account"]["verdict"] == "loss"
    empty = client.post(API, headers=admin, json={"title": "Mariage"}).json()
    assert empty["account"]["verdict"] == "incomplete" and empty["number"] == f"ITTS-CV-{date.today().year}-001"  # année du départ


def test_confirm_requires_contract_fields_then_creates_departure(client, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    draft = client.post(API, headers=admin, json={"title": "Funérailles"}).json()
    r = client.post(f"{API}/{draft['id']}/confirm", headers=admin)
    assert r.status_code == 400 and "le client" in r.json()["detail"] and "le car" in r.json()["detail"]
    # Brouillon numéroté cette année, voyage l'an prochain : le contrat prend l'année du voyage.
    assert draft["number"] == f"CV-{date.today().year}-001"
    filled = client.patch(f"{API}/{draft['id']}", headers=admin, json=_body(crew=crew, vehicle=vehicle)).json()
    assert client.post(f"{API}/{filled['id']}/confirm", headers=admin).json()["number"] == f"CV-{date.today().year + 1}-001"
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    confirmed = client.post(f"{API}/{convoy['id']}/confirm", headers=admin).json()
    assert confirmed["status"] == "confirmed" and confirmed["contract_generated_at"] and confirmed["departure_id"]
    dep = client.get(f"/api/v1/departures/{confirmed['departure_id']}", headers=admin).json()
    assert dep["convoy_id"] == convoy["id"] and dep["vehicle_id"] == vehicle.id and dep["distance_km"] == 650
    assert dep["route_label"].startswith(f"Convoi {convoy['number']} · Abidjan – Danané")
    assert client.post(f"{API}/{convoy['id']}/confirm", headers=admin).status_code == 409


def test_departure_blocked_until_balance_paid(client, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    dep_id = client.post(f"{API}/{convoy['id']}/confirm", headers=admin).json()["departure_id"]
    item = _item(_check(client, admin, dep_id), "convoy_paid")
    assert item["status"] == "blocked" and "2 799 500 F" in item["detail"]
    after = client.post(f"{API}/{convoy['id']}/payments", headers=auth(R.ACCOUNTANT), json={"amount": 1_000_000, "method": "wave"}).json()
    assert after["account"]["paid"] == 1_000_000 and after["account"]["balance"] == 1_799_500
    client.post(f"{API}/{convoy['id']}/payments", headers=admin, json={"amount": 1_799_500, "method": "cash", "reference": "Reçu 12"})
    assert _item(_check(client, admin, dep_id), "convoy_paid")["status"] == "ok"


def test_changes_after_contract_follow_departure(client, auth, db, vehicle, crew, company):
    admin = auth(R.ADMIN)
    other = models.Vehicle(company_id=company.id, registration="AA-530-CI", fleet_number="530", seats=63, brand="Car", model="N°530")
    db.add(other)
    db.commit()
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    dep_id = client.post(f"{API}/{convoy['id']}/confirm", headers=admin).json()["departure_id"]
    updated = client.patch(f"{API}/{convoy['id']}", headers=admin, json={"vehicle_id": other.id}).json()
    assert updated["vehicle_label"] == "Car N°530 · 63 places"
    assert client.get(f"/api/v1/departures/{dep_id}", headers=admin).json()["vehicle_id"] == other.id
    assert client.patch(f"{API}/{convoy['id']}", headers=admin, json={"vehicle_id": None}).status_code == 400
    cancelled = client.post(f"{API}/{convoy['id']}/cancel", headers=admin).json()
    assert cancelled["status"] == "cancelled"
    assert client.get(f"/api/v1/departures/{dep_id}", headers=admin).json()["status"] == "cancelled"
    assert client.patch(f"{API}/{convoy['id']}", headers=admin, json={"title": "x"}).status_code == 409


def test_vehicle_documents_checked_at_return_date(client, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id, expiry_days=30)  # expire avant le convoi de l'an prochain
    _comply_crew(client, admin, crew)
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    docs = {d["code"]: d["status"] for d in convoy["vehicle_documents"]}
    assert docs["doc_insurance"] == "blocked" and docs["doc_registration_card"] == "ok"


def test_validation_and_roles(client, auth, vehicle, crew, make_user, other_company):
    admin = auth(R.ADMIN)
    same = {"driver_id": crew["driver"]["id"], "relief_driver_id": crew["driver"]["id"]}
    assert client.post(API, headers=admin, json=_body(**same)).status_code == 400
    assert client.post(API, headers=admin, json=_body(return_date="2000-01-01")).status_code == 400
    assert client.post(API, headers=auth(R.STATION_MANAGER), json=_body()).status_code == 403
    convoy = _create(client, admin)
    assert client.get(API, headers=auth(R.READER)).status_code == 200
    assert client.get(f"{API}?q=Camara", headers=admin).json()[0]["id"] == convoy["id"]
    _, foreign = make_user(R.ADMIN, other_company)
    assert client.get(f"{API}/{convoy['id']}", headers=foreign).status_code == 404
    assert client.post(API, headers=foreign, json=_body(vehicle=vehicle)).status_code == 400
    assert client.delete(f"{API}/{convoy['id']}", headers=admin).status_code == 204


def test_payment_removal_and_complete(client, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    paid = client.post(f"{API}/{convoy['id']}/payments", headers=admin, json={"amount": 500, "method": "mtn"}).json()
    payment_id = paid["payments"][0]["id"]
    assert client.delete(f"{API}/{convoy['id']}/payments/{payment_id}", headers=admin).json()["account"]["paid"] == 0
    assert client.post(f"{API}/{convoy['id']}/complete", headers=admin).status_code == 409
    client.post(f"{API}/{convoy['id']}/confirm", headers=admin)
    assert client.post(f"{API}/{convoy['id']}/complete", headers=admin).json()["status"] == "done"
    assert client.delete(f"{API}/{convoy['id']}", headers=admin).status_code == 409


# ───────────────────────── Régressions (revue) ─────────────────────────

def _soon(hours=2):
    return (datetime.now() + timedelta(hours=hours)).replace(microsecond=0)


def test_removing_a_payment_after_the_pass_blocks_the_exit(client, auth, db, vehicle, crew):
    """Convoi soldé, bon émis, paiement supprimé : le bon ne vaut plus, ni au portail ni pour ITTS."""
    from app.services import departures as dep_svc

    admin = auth(R.ADMIN)
    _comply_vehicle(client, admin, vehicle.id)
    _comply_crew(client, admin, crew)
    start = _soon()
    convoy = _create(client, admin, crew=crew, vehicle=vehicle, departure_at=start.isoformat(),
                     return_date=(start.date() + timedelta(days=1)).isoformat(), billed_days=2)
    dep_id = client.post(f"{API}/{convoy['id']}/confirm", headers=admin).json()["departure_id"]
    paid = client.post(f"{API}/{convoy['id']}/payments", headers=admin,
                       json={"amount": convoy["account"]["revenue"], "method": "cash"}).json()
    _inspect(client, admin, {"id": dep_id, "vehicle_id": vehicle.id})
    assert client.post(f"/api/v1/departures/{dep_id}/exit-pass", headers=admin).status_code == 200, _check(client, admin, dep_id)
    client.delete(f"{API}/{convoy['id']}/payments/{paid['payments'][0]['id']}", headers=admin)
    db.expire_all()
    dep = db.get(models.Departure, dep_id)
    assert dep_svc.verify_token(db, dep_svc.make_token(dep))["valid"] is False


def test_contract_needs_prices_and_freezes_rates(client, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    free = _create(client, admin, crew=crew, vehicle=vehicle, billed_days=0,
                   segments=[s | {"price_per_seat": 0} for s in SEGMENTS])
    r = client.post(f"{API}/{free['id']}/confirm", headers=admin)
    assert r.status_code == 400 and "tarifs" in r.json()["detail"]
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    confirmed = client.post(f"{API}/{convoy['id']}/confirm", headers=admin).json()
    assert confirmed["daily_rate"] == 100000 and float(confirmed["commission_pct"]) == 5
    client.put("/api/v1/settings/operations", headers=admin, json={"immobilization_daily_rate": 200000})
    assert client.get(f"{API}/{convoy['id']}", headers=admin).json()["account"]["revenue"] == 2_799_500


def test_overpayment_warns_and_conveyor_removal_follows_departure(client, auth, vehicle, crew):
    admin = auth(R.ADMIN)
    convoy = _create(client, admin, crew=crew, vehicle=vehicle)
    dep_id = client.post(f"{API}/{convoy['id']}/confirm", headers=admin).json()["departure_id"]
    over = client.post(f"{API}/{convoy['id']}/payments", headers=admin, json={"amount": 3_000_000, "method": "wave"}).json()
    assert any("Trop-perçu" in a for a in over["account"]["alerts"])
    client.patch(f"{API}/{convoy['id']}", headers=admin, json={"conveyor_id": None})
    assert client.get(f"/api/v1/departures/{dep_id}", headers=admin).json()["conveyor_id"] is None


def test_numbering_is_numeric_past_999(client, auth, db, company):
    year = date.today().year
    db.add(models.Convoy(company_id=company.id, number=f"CV-{year}-999", title="a"))
    db.add(models.Convoy(company_id=company.id, number=f"CV-{year}-1000", title="b"))
    db.commit()
    assert client.post(API, headers=auth(R.ADMIN), json={"title": "c"}).json()["number"] == f"CV-{year}-1001"
