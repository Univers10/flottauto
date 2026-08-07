from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user
from app.core.database import get_db

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("", response_model=list[schemas.AlertRead])
def list_alerts(
    unread_only: bool = False,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_alerts(db, _company_id(current_user), unread_only=unread_only, limit=limit)


@router.post("/{alert_id}/read", response_model=schemas.AlertRead)
def mark_alert_read(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    alert = crud.mark_alert_read(db, alert_id, _company_id(current_user))
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/read-all")
def mark_all_alerts_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    updated = crud.mark_all_alerts_read(db, _company_id(current_user))
    return {"updated": updated}
