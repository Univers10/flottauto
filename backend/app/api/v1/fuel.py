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


@router.get("", response_model=list[schemas.FuelExpenseRead])
def list_fuel_expenses(
    vehicle_id: int | None = None,
    driver_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_fuel_expenses(db, _company_id(current_user), vehicle_id=vehicle_id, driver_id=driver_id)


@router.post("", response_model=schemas.FuelExpenseRead, status_code=201)
def create_fuel_expense(
    payload: schemas.FuelExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, payload.vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return crud.create_fuel_expense(db, payload, company_id)


@router.get("/{fuel_id}", response_model=schemas.FuelExpenseRead)
def get_fuel_expense(
    fuel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fuel = crud.get_fuel_expense(db, fuel_id, _company_id(current_user))
    if not fuel:
        raise HTTPException(status_code=404, detail="Fuel expense not found")
    return fuel


@router.put("/{fuel_id}", response_model=schemas.FuelExpenseRead)
def update_fuel_expense(
    fuel_id: int,
    payload: schemas.FuelExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fuel = crud.get_fuel_expense(db, fuel_id, _company_id(current_user))
    if not fuel:
        raise HTTPException(status_code=404, detail="Fuel expense not found")
    return crud.update_fuel_expense(db, fuel, payload)


@router.delete("/{fuel_id}", status_code=204)
def delete_fuel_expense(
    fuel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fuel = crud.get_fuel_expense(db, fuel_id, _company_id(current_user))
    if not fuel:
        raise HTTPException(status_code=404, detail="Fuel expense not found")
    crud.delete_fuel_expense(db, fuel)
    return None
