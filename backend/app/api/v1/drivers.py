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
    return crud.create_document(db, schemas.DocumentCreate(**doc_data), company_id=company_id)


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
