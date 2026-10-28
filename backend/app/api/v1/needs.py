from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.services import needs as svc

router = APIRouter()

writer = require_role(*svc.WRITERS)


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("", response_model=schemas.VehicleNeedList)
def list_needs(
    vehicle_id: int | None = None,
    status: models.NeedStatus | None = None,
    priority: models.NeedPriority | None = None,
    open_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    items = svc.list_needs(db, _company_id(current_user), vehicle_id, status, priority, open_only)
    return {"items": items, "total_estimated": sum(n.estimated_cost or 0 for n in items)}


@router.post("", response_model=schemas.VehicleNeedRead, status_code=status.HTTP_201_CREATED)
def create_need(
    payload: schemas.VehicleNeedCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return svc.create_need(db, _company_id(current_user), current_user, payload)


@router.patch("/{need_id}", response_model=schemas.VehicleNeedRead)
def update_need(
    need_id: int,
    payload: schemas.VehicleNeedUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    need = svc.get_need(db, need_id, _company_id(current_user))
    return svc.update_need(db, need, payload, current_user)


@router.post("/{need_id}/work-order", response_model=schemas.WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order(
    need_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    need = svc.get_need(db, need_id, _company_id(current_user))
    return svc.to_work_order(db, need, current_user)
