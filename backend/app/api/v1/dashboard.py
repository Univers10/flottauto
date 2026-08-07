from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import get_current_user
from app.core.database import get_db
from app.services import dashboard as dashboard_service
from app.services import alerts as alert_service

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return dashboard_service.compute_dashboard_stats(db, _company_id(current_user))


@router.post("/refresh-alerts")
def refresh_alerts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    created = alert_service.refresh_alerts(db, _company_id(current_user))
    return {"created": created}
