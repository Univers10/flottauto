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


@router.post("", response_model=schemas.VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_vehicle(db, payload, company_id=_company_id(current_user))


@router.get("", response_model=dict)
def list_vehicles(
    params: schemas.VehicleListParams = Depends(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    items, total = crud.list_vehicles(db, company_id, params)
    return {
        "items": [schemas.VehicleRead.model_validate(v) for v in items],
        "total": total,
        "page": params.page,
        "size": params.size,
    }


@router.get("/{vehicle_id}", response_model=schemas.VehicleRead)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicle = crud.get_vehicle(db, vehicle_id, _company_id(current_user))
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.put("/{vehicle_id}", response_model=schemas.VehicleRead)
def update_vehicle(
    vehicle_id: int,
    payload: schemas.VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicle = crud.get_vehicle(db, vehicle_id, _company_id(current_user))
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return crud.update_vehicle(db, vehicle, payload)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    vehicle = crud.get_vehicle(db, vehicle_id, _company_id(current_user))
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    crud.delete_vehicle(db, vehicle)
    return None


@router.post("/{vehicle_id}/photo", response_model=schemas.VehicleRead)
def upload_vehicle_photo(
    vehicle_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    company_dir = UPLOAD_DIR / str(company_id) / "vehicles" / str(vehicle_id)
    company_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "photo").suffix or ".jpg"
    safe_name = f"photo_{os.urandom(4).hex()}{ext}"

    file_path = company_dir / safe_name
    with open(file_path, "wb") as f:
        f.write(file.file.read())

    if vehicle.photo_url:
        old = company_dir / Path(vehicle.photo_url).name
        if old.exists():
            old.unlink()

    vehicle.photo_url = f"/uploads/{company_id}/vehicles/{vehicle_id}/{safe_name}"
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}/photo", response_model=schemas.VehicleRead)
def delete_vehicle_photo(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if vehicle.photo_url:
        company_dir = UPLOAD_DIR / str(company_id) / "vehicles" / str(vehicle_id)
        old = company_dir / Path(vehicle.photo_url).name
        if old.exists():
            old.unlink()
        vehicle.photo_url = None
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
    return vehicle


@router.post("/{vehicle_id}/documents", response_model=schemas.DocumentRead, status_code=status.HTTP_201_CREATED)
def create_vehicle_document(
    vehicle_id: int,
    payload: schemas.DocumentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    doc_data = payload.model_dump()
    doc_data["vehicle_id"] = vehicle_id
    return crud.create_document(db, schemas.DocumentCreate(**doc_data), company_id=company_id)


@router.post("/{vehicle_id}/documents/upload", response_model=schemas.DocumentRead, status_code=status.HTTP_201_CREATED)
def upload_vehicle_document(
    vehicle_id: int,
    name: str = Form(...),
    document_type: str = Form(...),
    expiry_date: str | None = Form(None),
    issue_date: str | None = Form(None),
    reminder_days: int = Form(30),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    company_dir = UPLOAD_DIR / str(company_id) / "vehicles" / str(vehicle_id)
    company_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "document").suffix or ".bin"
    safe_name = f"{Path(name).stem or 'doc'}_{os.urandom(4).hex()}{ext}"

    issue_date = issue_date or None
    expiry_date = expiry_date or None
    file_path = company_dir / safe_name
    with open(file_path, "wb") as f:
        f.write(file.file.read())

    file_url = f"/uploads/{company_id}/vehicles/{vehicle_id}/{safe_name}"
    doc_in = schemas.DocumentCreate(
        vehicle_id=vehicle_id,
        name=name or file.filename,
        document_type=document_type,
        file_url=file_url,
        issue_date=issue_date,
        expiry_date=expiry_date,
        reminder_days=reminder_days,
    )
    return crud.create_document(db, doc_in, company_id=company_id)


@router.get("/{vehicle_id}/documents", response_model=list[schemas.DocumentRead])
def list_vehicle_documents(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return crud.list_documents(db, company_id, vehicle_id=vehicle_id)


@router.delete("/{vehicle_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle_document(
    vehicle_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    doc = crud.get_document(db, document_id, company_id)
    if not doc or doc.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Document not found")
    crud.delete_document(db, doc)
    return None
