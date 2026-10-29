from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.api.deps import get_current_user
from app.core.database import get_db
from app.services import reports as svc

router = APIRouter()


@router.get("/summary")
def summary(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Bilan d'une période ; par défaut la semaine en cours (lundi → dimanche)."""
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    if start is None:
        start, default_end = svc.week_of(date.today())
        end = end or default_end
    end = end or start + timedelta(days=6)
    return svc.summary(db, current_user.company_id, start, end)
