"""Rapports : point hebdomadaire du lundi (coût par car, à surveiller, convois, à prévoir)."""
from datetime import date, datetime, timedelta

from app import models
from app.services import reports as svc

R = models.Role
API = "/api/v1/reports/summary"


def _week():
    return svc.week_of(date.today())


def test_week_costs_per_car(client, auth, db, vehicle, company):
    start, end = _week()
    db.add(models.FuelExpense(company_id=company.id, vehicle_id=vehicle.id, fuel_type=models.FuelType.DIESEL, liters=100,
                              amount=75000, refuel_date=start, mileage=168_420))
    db.add(models.TollExpense(company_id=company.id, vehicle_id=vehicle.id, toll_name="Singrobo", amount=5000,
                              expense_date=start, mileage=169_222))
    db.add(models.WorkOrder(company_id=company.id, vehicle_id=vehicle.id, title="Pneu", total_cost=40000,
                            status=models.WorkOrderStatus.VALIDATED, completed_at=datetime.combine(start, datetime.min.time())))
    # Hors période : ignoré.
    db.add(models.FuelExpense(company_id=company.id, vehicle_id=vehicle.id, fuel_type=models.FuelType.DIESEL, liters=10,
                              amount=9999, refuel_date=start - timedelta(days=1)))
    db.add(models.VehicleNeed(company_id=company.id, vehicle_id=vehicle.id, title="Vidange", priority=models.NeedPriority.BEFORE_DEPARTURE,
                              estimated_cost=112_320))
    db.commit()

    r = client.get(API, headers=auth(R.ADMIN), params={"start": start.isoformat(), "end": end.isoformat()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["label"].startswith("Semaine du")
    t = body["totals"]
    assert (t["fuel"], t["tolls"], t["maintenance"], t["expenses"]) == (75000, 5000, 40000, 120000)
    assert t["km"] == 802 and t["needs_to_plan"] == 112_320 and t["needs_before_departure"] == 1
    row = body["vehicles"][0]
    assert row["km"] == 802 and row["cost_per_km"] == round(120000 / 802)


def test_watch_list_flags_interventions(client, auth, db, vehicle):
    cg = auth(R.STATION_MANAGER)
    wo = client.post("/api/v1/maintenance/work-orders", headers=cg, json={"vehicle_id": vehicle.id, "title": "Frein"}).json()
    client.put(f"/api/v1/maintenance/work-orders/{wo['id']}/lines", headers=cg,
               json={"lines": [{"label": "Plaquettes", "quantity": 1, "unit_price": 30000}]})
    client.post(f"/api/v1/maintenance/work-orders/{wo['id']}/done", headers=cg)
    body = client.get(API, headers=auth(R.ADMIN)).json()
    item = next(w for w in body["watch"] if w["id"] == wo["id"])
    assert "Réalisée sans validation du superviseur" in item["reasons"]
    assert "Ancienne pièce non rapportée" in item["reasons"]
    assert item["expense_status"] == "not_reimbursed"
    assert body["interventions"]["awaiting_invoice"] == 1


def test_default_period_is_current_week_and_roles(client, auth):
    start, end = _week()
    body = client.get(API, headers=auth(R.ACCOUNTANT)).json()
    assert body["start"] == start.isoformat() and body["end"] == end.isoformat()
    assert client.get(API, headers=auth(R.MECHANIC)).status_code == 403
    assert client.get(API, headers=auth(R.DRIVER)).status_code == 403


def test_bad_period_is_refused(client, auth):
    h = auth(R.ADMIN)
    assert client.get(API, headers=h, params={"start": "2026-10-10", "end": "2026-10-01"}).status_code == 400
    assert client.get(API, headers=h, params={"start": "2024-01-01", "end": "2026-10-01"}).status_code == 400


def test_reports_are_per_company(client, auth, make_user, other_company, db, vehicle, company):
    start, _ = _week()
    db.add(models.FuelExpense(company_id=company.id, vehicle_id=vehicle.id, fuel_type=models.FuelType.DIESEL, liters=10,
                              amount=10000, refuel_date=start))
    db.commit()
    _, other = make_user(R.ADMIN, other_company)
    assert client.get(API, headers=other).json()["totals"]["fuel"] == 0
