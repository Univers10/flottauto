"""Tâche de nuit : alertes générées pour toutes les sociétés, sans doublon, une erreur n'arrête pas les autres."""
from datetime import date, timedelta

from app import crud, models, schemas
from app import jobs


def _expiring_document(db, company):
    vehicle = crud.create_vehicle(
        db, schemas.VehicleCreate(registration=f"NUIT-{company.slug}", brand="Yutong", model="ZK6122"), company_id=company.id
    )
    db.add(models.Document(
        company_id=company.id, vehicle_id=vehicle.id, name="Assurance", document_type="insurance",
        expiry_date=date.today() + timedelta(days=5),
    ))
    db.commit()


def _alerts(db, company):
    return db.query(models.Alert).filter(models.Alert.company_id == company.id).count()


def test_nightly_alerts_for_every_company(db, company, other_company):
    _expiring_document(db, company)
    _expiring_document(db, other_company)
    report = jobs.run_nightly(db)
    assert report[company.id] >= 1 and report[other_company.id] >= 1
    assert _alerts(db, company) >= 1 and _alerts(db, other_company) >= 1
    assert sum(jobs.run_nightly(db).values()) == 0  # relancer ne crée pas de doublon


def test_one_failing_company_does_not_stop_the_others(db, company, other_company, monkeypatch):
    _expiring_document(db, other_company)
    real = jobs.alert_service.refresh_alerts

    def flaky(session, company_id):
        if company_id == company.id:
            raise RuntimeError("panne")
        return real(session, company_id)

    monkeypatch.setattr(jobs.alert_service, "refresh_alerts", flaky)
    report = jobs.run_nightly(db)
    assert report[company.id] is None and report[other_company.id] >= 1
