from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.services import inspections as svc
from app.utils.uploads import private_path

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


writer = require_role(*svc.WRITERS)


@router.get("", response_model=list[schemas.InspectionListItem])
def list_inspections(
    vehicle_id: int | None = None,
    station_id: int | None = None,
    kind: models.InspectionKind | None = None,
    status: models.InspectionStatus | None = None,
    day: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = svc.list_inspections(db, _company_id(current_user), vehicle_id, station_id, kind, status, day, user=current_user)
    return [svc.serialize_list_item(r) for r in rows]


@router.post("", response_model=schemas.InspectionRead, status_code=status.HTTP_201_CREATED)
def create_inspection(
    payload: schemas.InspectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return svc.serialize(svc.create_inspection(db, _company_id(current_user), current_user, payload))


@router.get("/{inspection_id}", response_model=schemas.InspectionRead)
def get_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return svc.serialize(svc.get_inspection(db, inspection_id, _company_id(current_user), current_user))


@router.patch("/{inspection_id}", response_model=schemas.InspectionRead)
def update_inspection(
    inspection_id: int,
    payload: schemas.InspectionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    insp = svc.get_inspection(db, inspection_id, _company_id(current_user), current_user)
    return svc.serialize(svc.update_inspection(db, insp, payload, current_user))


@router.put("/{inspection_id}/items", response_model=schemas.InspectionRead)
def set_items(
    inspection_id: int,
    items: list[schemas.InspectionItemSet],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    insp = svc.get_inspection(db, inspection_id, _company_id(current_user), current_user)
    return svc.serialize(svc.set_items(db, insp, items))


@router.post("/{inspection_id}/photos", response_model=schemas.InspectionPhotoRead, status_code=status.HTTP_201_CREATED)
def upload_photo(
    inspection_id: int,
    slot: str = Form(...),
    captured_at: datetime | None = Form(None),
    is_fresh: bool = Form(True),
    damage: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    insp = svc.get_inspection(db, inspection_id, _company_id(current_user), current_user)
    return svc.add_photo(db, insp, slot, file, captured_at, is_fresh, damage)


@router.get("/{inspection_id}/photos/{photo_id}/file")
def photo_file(
    inspection_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Photo servie seulement aux comptes de la société (stockage privé, jamais sous /uploads)."""
    company_id = _company_id(current_user)
    insp = svc.get_inspection(db, inspection_id, company_id, current_user)
    photo = next((p for p in insp.photos if p.id == photo_id), None)
    path = private_path(photo.file_key, company_id) if photo else None
    if path is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    return FileResponse(
        path,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Disposition": "inline"},
    )


@router.post("/{inspection_id}/signatures", response_model=schemas.InspectionRead)
def sign(
    inspection_id: int,
    payload: schemas.SignatureCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    insp = svc.get_inspection(db, inspection_id, _company_id(current_user), current_user)
    return svc.serialize(svc.sign(db, insp, payload, current_user, request.client.host if request.client else None))


@router.post("/{inspection_id}/validate", response_model=schemas.InspectionRead)
def validate(
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    insp = svc.get_inspection(db, inspection_id, _company_id(current_user), current_user)
    return svc.serialize(svc.validate(db, insp, current_user))


@router.get("/{inspection_id}/day-report")
def day_report(
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return svc.day_report(db, svc.get_inspection(db, inspection_id, _company_id(current_user), current_user))
