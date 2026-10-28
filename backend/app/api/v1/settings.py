from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user, require_role
from app.core.database import get_db

router = APIRouter()

SETTINGS_WRITERS = (models.Role.SUPER_ADMIN, models.Role.ADMIN, models.Role.OPERATIONS_SUPERVISOR)


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("/operations", response_model=schemas.OperationsSettingsRead)
def get_operations_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.get_company_settings(db, _company_id(current_user))


@router.put("/operations", response_model=schemas.OperationsSettingsRead)
def update_operations_settings(
    payload: schemas.OperationsSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*SETTINGS_WRITERS)),
):
    settings = crud.get_company_settings(db, _company_id(current_user))
    return crud.update_company_settings(db, settings, payload)
