from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user, require_role
from app.core.database import get_db

router = APIRouter()

STATION_WRITERS = (models.Role.SUPER_ADMIN, models.Role.ADMIN, models.Role.OPERATIONS_SUPERVISOR)


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("", response_model=list[schemas.StationRead])
def list_stations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_stations(db, _company_id(current_user))


@router.post("", response_model=schemas.StationRead, status_code=status.HTTP_201_CREATED)
def create_station(
    payload: schemas.StationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*STATION_WRITERS)),
):
    company_id = _company_id(current_user)
    if crud.get_station_by_code(db, payload.code.strip(), company_id):
        raise HTTPException(status_code=409, detail="Une gare utilise déjà ce code")
    return crud.create_station(db, payload, company_id)


@router.put("/{station_id}", response_model=schemas.StationRead)
def update_station(
    station_id: int,
    payload: schemas.StationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*STATION_WRITERS)),
):
    company_id = _company_id(current_user)
    station = crud.get_station(db, station_id, company_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if payload.code:
        existing = crud.get_station_by_code(db, payload.code.strip(), company_id)
        if existing and existing.id != station.id:
            raise HTTPException(status_code=409, detail="Une gare utilise déjà ce code")
    return crud.update_station(db, station, payload)
