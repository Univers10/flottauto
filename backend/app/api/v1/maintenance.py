import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user
from app.core.database import get_db

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.post("/plans", response_model=schemas.MaintenancePlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: schemas.MaintenancePlanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_maintenance_plan(db, payload, company_id=_company_id(current_user))


@router.get("/plans", response_model=list[schemas.MaintenancePlanRead])
def list_plans(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_maintenance_plans(db, _company_id(current_user))


@router.post("/work-orders", response_model=schemas.WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order(
    payload: schemas.WorkOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, payload.vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return crud.create_work_order(db, payload, company_id=company_id)


@router.get("/work-orders", response_model=list[schemas.WorkOrderRead])
def list_work_orders(
    vehicle_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_work_orders(db, _company_id(current_user), vehicle_id=vehicle_id, status=status)


@router.get("/work-orders/{work_order_id}", response_model=schemas.WorkOrderRead)
def get_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wo = crud.get_work_order(db, work_order_id, _company_id(current_user))
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


@router.put("/work-orders/{work_order_id}", response_model=schemas.WorkOrderRead)
def update_work_order(
    work_order_id: int,
    payload: schemas.WorkOrderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wo = crud.get_work_order(db, work_order_id, _company_id(current_user))
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return crud.update_work_order(db, wo, payload)


@router.delete("/work-orders/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wo = crud.get_work_order(db, work_order_id, _company_id(current_user))
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    crud.delete_work_order(db, wo)
    return None


@router.post("/work-orders/{work_order_id}/photos", response_model=schemas.WorkOrderPhotoRead, status_code=status.HTTP_201_CREATED)
def upload_work_order_photo(
    work_order_id: int,
    caption: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    wo = crud.get_work_order(db, work_order_id, company_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    order_dir = UPLOAD_DIR / str(company_id) / "work_orders" / str(work_order_id)
    order_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "photo").suffix or ".jpg"
    safe_name = f"photo_{os.urandom(4).hex()}{ext}"
    file_path = order_dir / safe_name
    with open(file_path, "wb") as f:
        f.write(file.file.read())

    file_url = f"/uploads/{company_id}/work_orders/{work_order_id}/{safe_name}"
    return crud.create_work_order_photo(db, work_order_id, company_id, file_url, caption)


@router.get("/work-orders/{work_order_id}/photos", response_model=list[schemas.WorkOrderPhotoRead])
def list_work_order_photos(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    wo = crud.get_work_order(db, work_order_id, company_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return crud.list_work_order_photos(db, work_order_id, company_id)


@router.delete("/work-orders/{work_order_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order_photo(
    work_order_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    photo = crud.get_work_order_photo(db, photo_id, company_id)
    if not photo or photo.work_order_id != work_order_id:
        raise HTTPException(status_code=404, detail="Photo not found")
    crud.delete_work_order_photo(db, photo)
    return None
