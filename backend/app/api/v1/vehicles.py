from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user
from app.core.database import get_db
from app.utils.uploads import delete_upload, save_documents, save_image

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


def _parse_date(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


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

    new_url = save_image(file, company_id, "vehicles", vehicle_id, prefix="photo")
    delete_upload(vehicle.photo_url, company_id)
    vehicle.photo_url = new_url
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
        delete_upload(vehicle.photo_url, company_id)
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
    doc_data["driver_id"] = None
    return crud.create_document(db, schemas.DocumentCreate(**doc_data), company_id=company_id)


@router.post("/{vehicle_id}/documents/upload", response_model=list[schemas.DocumentRead], status_code=status.HTTP_201_CREATED)
def upload_vehicle_documents(
    vehicle_id: int,
    name: str | None = Form(None),
    document_type: str = Form(...),
    expiry_date: str | None = Form(None),
    issue_date: str | None = Form(None),
    reminder_days: int = Form(30),
    files: list[UploadFile] | None = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    upload_files = [f for f in (files or []) if f and getattr(f, "filename", None)]
    if not upload_files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")

    issue_date = _parse_date(issue_date)
    expiry_date = _parse_date(expiry_date)
    docs: list[schemas.DocumentRead] = []

    prefixes = []
    for index, upload in enumerate(upload_files, start=1):
        prefix = Path(name).stem if name else Path(upload.filename or "doc").stem
        if len(upload_files) > 1:
            prefix = f"{prefix}_{index}" if prefix else f"doc_{index}"
        prefixes.append(prefix or "doc")
    # Tout ou rien : un fichier refusé n'enregistre aucun document du lot.
    file_urls = save_documents(list(zip(upload_files, prefixes)), company_id, "vehicles", vehicle_id)

    for index, (upload, file_url) in enumerate(zip(upload_files, file_urls), start=1):
        doc_name = name or upload.filename or "Document"
        if len(upload_files) > 1 and name:
            doc_name = f"{name} ({index})"
        elif len(upload_files) > 1:
            doc_name = upload.filename or f"Document {index}"
        doc_in = schemas.DocumentCreate(
            vehicle_id=vehicle_id,
            name=doc_name,
            document_type=document_type,
            file_url=file_url,
            issue_date=issue_date,
            expiry_date=expiry_date,
            reminder_days=reminder_days,
        )
        docs.append(crud.create_document(db, doc_in, company_id=company_id))

    return docs


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


@router.put("/{vehicle_id}/documents/{document_id}", response_model=schemas.DocumentRead)
def update_vehicle_document(
    vehicle_id: int,
    document_id: int,
    payload: schemas.DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    doc = crud.get_document(db, document_id, company_id)
    if not doc or doc.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return crud.update_document(db, doc, payload)


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
