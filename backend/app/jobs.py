"""Tâches planifiées (lancées par un minuteur systemd sur le serveur, voir deploy/).

    python -m app.jobs nightly    # alertes : papiers, permis, entretiens, factures absentes à minuit
"""
import logging
import sys

from sqlalchemy.orm import Session

from app import models
from app.core.database import SessionLocal
from app.services import alerts as alert_service

log = logging.getLogger("flottauto.jobs")


def run_nightly(db: Session) -> dict[int, int | None]:
    """Génère les alertes de chaque société. Renvoie {company_id: alertes créées, None si échec}."""
    report: dict[int, int | None] = {}
    for company_id in [c.id for c in db.query(models.Company).order_by(models.Company.id)]:
        try:
            report[company_id] = alert_service.refresh_alerts(db, company_id)
            db.commit()
        except Exception:
            db.rollback()
            log.exception("Alertes de la société %s en échec", company_id)
            report[company_id] = None
    return report


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if argv != ["nightly"]:
        print(__doc__)
        return 2
    db = SessionLocal()
    try:
        report = run_nightly(db)
    finally:
        db.close()
    for company_id, created in report.items():
        log.info("Société %s : %s", company_id, "ÉCHEC" if created is None else f"{created} alerte(s) créée(s)")
    return 1 if any(v is None for v in report.values()) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
