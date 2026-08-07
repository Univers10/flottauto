from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user
from app.core.database import get_db

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("", response_model=list[schemas.TollExpenseRead])
def list_toll_expenses(
    vehicle_id: int | None = None,
    driver_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_toll_expenses(db, _company_id(current_user), vehicle_id=vehicle_id, driver_id=driver_id)


@router.post("", response_model=schemas.TollExpenseRead, status_code=201)
def create_toll_expense(
    payload: schemas.TollExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, payload.vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return crud.create_toll_expense(db, payload, company_id)


@router.get("/{toll_id}", response_model=schemas.TollExpenseRead)
def get_toll_expense(
    toll_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    toll = crud.get_toll_expense(db, toll_id, _company_id(current_user))
    if not toll:
        raise HTTPException(status_code=404, detail="Toll expense not found")
    return toll


@router.put("/{toll_id}", response_model=schemas.TollExpenseRead)
def update_toll_expense(
    toll_id: int,
    payload: schemas.TollExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    toll = crud.get_toll_expense(db, toll_id, _company_id(current_user))
    if not toll:
        raise HTTPException(status_code=404, detail="Toll expense not found")
    return crud.update_toll_expense(db, toll, payload)


@router.delete("/{toll_id}", status_code=204)
def delete_toll_expense(
    toll_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    toll = crud.get_toll_expense(db, toll_id, _company_id(current_user))
    if not toll:
        raise HTTPException(status_code=404, detail="Toll expense not found")
    crud.delete_toll_expense(db, toll)
    return None
