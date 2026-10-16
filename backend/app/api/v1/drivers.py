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


def _parse_date(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.post("", response_model=schemas.DriverRead, status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: schemas.DriverCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_driver(db, payload, company_id=_company_id(current_user))


@router.get("", response_model=list[schemas.DriverRead])
def list_drivers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_drivers(db, _company_id(current_user), skip=skip, limit=limit)


@router.get("/{driver_id}", response_model=schemas.DriverRead)
def get_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    driver = crud.get_driver(db, driver_id, _company_id(current_user))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


@router.put("/{driver_id}", response_model=schemas.DriverRead)
def update_driver(
    driver_id: int,
    payload: schemas.DriverUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    driver = crud.get_driver(db, driver_id, _company_id(current_user))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return crud.update_driver(db, driver, payload)


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    driver = crud.get_driver(db, driver_id, _company_id(current_user))
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    crud.delete_driver(db, driver)
    return None


@router.post("/{driver_id}/documents", response_model=schemas.DocumentRead, status_code=status.HTTP_201_CREATED)
def create_driver_document(
    driver_id: int,
    payload: schemas.DocumentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    driver = crud.get_driver(db, driver_id, company_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    doc_data = payload.model_dump()
    doc_data["driver_id"] = driver_id
    doc_data["vehicle_id"] = None
    return crud.create_document(db, schemas.DocumentCreate(**doc_data), company_id=company_id)


@router.post("/{driver_id}/documents/upload", response_model=list[schemas.DocumentRead], status_code=status.HTTP_201_CREATED)
def upload_driver_documents(
    driver_id: int,
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
    driver = crud.get_driver(db, driver_id, company_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    upload_files = [f for f in (files or []) if f and getattr(f, "filename", None)]
    if not upload_files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")

    company_dir = UPLOAD_DIR / str(company_id) / "drivers" / str(driver_id)
    company_dir.mkdir(parents=True, exist_ok=True)
    issue_date = _parse_date(issue_date)
    expiry_date = _parse_date(expiry_date)
    docs: list[schemas.DocumentRead] = []

    for index, upload in enumerate(upload_files, start=1):
        prefix = Path(name).stem if name else Path(upload.filename or "doc").stem
        if len(upload_files) > 1:
            prefix = f"{prefix}_{index}" if prefix else f"doc_{index}"
        ext = Path(upload.filename or "document").suffix or ".bin"
        safe_name = f"{prefix or 'doc'}_{os.urandom(4).hex()}{ext}"
        file_path = company_dir / safe_name
        with open(file_path, "wb") as f:
            f.write(upload.file.read())
        file_url = f"/uploads/{company_id}/drivers/{driver_id}/{safe_name}"
        doc_name = name or upload.filename or "Document"
        if len(upload_files) > 1 and name:
            doc_name = f"{name} ({index})"
        elif len(upload_files) > 1:
            doc_name = upload.filename or f"Document {index}"
        doc_in = schemas.DocumentCreate(
            driver_id=driver_id,
            name=doc_name,
            document_type=document_type,
            file_url=file_url,
            issue_date=issue_date,
            expiry_date=expiry_date,
            reminder_days=reminder_days,
        )
        docs.append(crud.create_document(db, doc_in, company_id=company_id))

    return docs


@router.get("/{driver_id}/documents", response_model=list[schemas.DocumentRead])
def list_driver_documents(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    driver = crud.get_driver(db, driver_id, company_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return crud.list_documents(db, company_id, driver_id=driver_id)


@router.put("/{driver_id}/documents/{document_id}", response_model=schemas.DocumentRead)
def update_driver_document(
    driver_id: int,
    document_id: int,
    payload: schemas.DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    doc = crud.get_document(db, document_id, company_id)
    if not doc or doc.driver_id != driver_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return crud.update_document(db, doc, payload)


@router.delete("/{driver_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver_document(
    driver_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    doc = crud.get_document(db, document_id, company_id)
    if not doc or doc.driver_id != driver_id:
        raise HTTPException(status_code=404, detail="Document not found")
    crud.delete_document(db, doc)
    return None
