"""Consommation réelle (L/100 km) calculée sur les pleins à ras, et signalement des écarts."""
from datetime import date, timedelta

from app import models
from app.services import consumption as svc


def _fill(db, company, vehicle, day, liters, mileage=None, full=True):
    db.add(models.FuelExpense(company_id=company.id, vehicle_id=vehicle.id, fuel_type=models.FuelType.DIESEL, liters=liters,
                              amount=liters * 750, refuel_date=day, mileage=mileage, full_tank=full))


def test_liters_between_two_full_tanks_over_km(db, company, vehicle):
    d = date(2026, 11, 2)
    _fill(db, company, vehicle, d, 200, 100_000)  # first full tank: start of the measure
    _fill(db, company, vehicle, d + timedelta(days=1), 60, None, full=False)  # partial fill, counted
    _fill(db, company, vehicle, d + timedelta(days=2), 140, 100_800)  # 200 L for 800 km
    db.commit()
    items = svc.intervals(db.query(models.FuelExpense).all())
    assert [(i.liters, i.km) for i in items] == [(200.0, 800)]
    assert svc.l_100km(items) == 25.0


def test_vehicle_sheet_flags_more_than_15_percent_over_the_theoretical_value(client, auth, db, company, vehicle):
    vehicle.fuel_consumption_l_100km = 30
    d = date(2026, 11, 2)
    _fill(db, company, vehicle, d, 300, 50_000)
    _fill(db, company, vehicle, d + timedelta(days=3), 360, 51_000)  # 36 L/100 km: +20 %
    db.commit()
    r = client.get(f"/api/v1/vehicles/{vehicle.id}/consumption", headers=auth(models.Role.MANAGER))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["measured_l_100km"] == 36.0
    assert body["theoretical_l_100km"] == 30.0
    assert body["gap_pct"] == 20
    assert body["anomaly"] is True


def test_no_measure_keeps_the_theoretical_value(db, company, vehicle):
    vehicle.fuel_consumption_l_100km = 28
    _fill(db, company, vehicle, date(2026, 11, 2), 100, 10_000)  # a single full tank: no interval
    db.commit()
    sheet = svc.vehicle_consumption(db, vehicle)
    assert sheet["measured_l_100km"] is None and sheet["anomaly"] is False
    assert svc.effective_l_100km(db, vehicle) == 28.0


def test_report_shows_l_100km_per_car_for_the_period(client, auth, db, company, vehicle):
    vehicle.fuel_consumption_l_100km = 30
    _fill(db, company, vehicle, date(2026, 10, 30), 100, 20_000)
    _fill(db, company, vehicle, date(2026, 11, 4), 300, 21_000)  # interval ending in November: 30 L/100 km
    db.commit()
    r = client.get("/api/v1/reports/summary?start=2026-11-01&end=2026-11-30", headers=auth(models.Role.MANAGER))
    row = next(v for v in r.json()["vehicles"] if v["vehicle_id"] == vehicle.id)
    assert row["l_100km"] == 30.0
    assert row["consumption_anomaly"] is False
