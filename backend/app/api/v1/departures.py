from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.services import departures as svc

router = APIRouter()
public_router = APIRouter()

writer = require_role(*svc.WRITERS)


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


def _get(db: Session, departure_id: int, user: models.User) -> models.Departure:
    return svc.get_departure(db, departure_id, _company_id(user), user)


@router.get("", response_model=list[schemas.DepartureRead])
def list_departures(
    day: date | None = None,
    station_id: int | None = None,
    status: models.DepartureStatus | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    rows = svc.list_departures(db, company_id, day, station_id, status, current_user)
    settings = crud.get_company_settings(db, company_id)
    return [svc.serialize(db, d, settings) for d in rows]


@router.post("", response_model=schemas.DepartureRead, status_code=status.HTTP_201_CREATED)
def create_departure(
    payload: schemas.DepartureCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return svc.serialize(db, svc.create_departure(db, _company_id(current_user), current_user, payload))


@router.get("/{departure_id}", response_model=schemas.DepartureRead)
def get_departure(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return svc.serialize(db, _get(db, departure_id, current_user))


@router.patch("/{departure_id}", response_model=schemas.DepartureRead)
def update_departure(
    departure_id: int,
    payload: schemas.DepartureUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    dep = _get(db, departure_id, current_user)
    return svc.serialize(db, svc.update_departure(db, dep, payload, current_user))


@router.post("/{departure_id}/cancel", response_model=schemas.DepartureRead)
def cancel(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return svc.serialize(db, svc.cancel_departure(db, _get(db, departure_id, current_user)))


@router.post("/{departure_id}/depart", response_model=schemas.DepartureRead)
def depart(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return svc.serialize(db, svc.mark_departed(db, _get(db, departure_id, current_user)))


@router.post("/{departure_id}/exit-pass", response_model=schemas.DepartureRead)
def issue_exit_pass(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    """Émet le bon de sortie si la check-list n'a aucun point rouge. Aucun rôle ne peut forcer un départ bloqué."""
    return svc.serialize(db, svc.issue_exit_pass(db, _get(db, departure_id, current_user), current_user))


@router.get("/{departure_id}/exit-pass", response_model=schemas.ExitPassRead)
def get_exit_pass(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return svc.exit_pass(_get(db, departure_id, current_user))


@router.post("/{departure_id}/notify", status_code=status.HTTP_204_NO_CONTENT)
def notify_supervisor(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    svc.notify_supervisor(db, _get(db, departure_id, current_user))


@router.get("/{departure_id}/replacements", response_model=list[schemas.ReplacementProposal])
def replacements(departure_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return svc.replacement_candidates(db, _get(db, departure_id, current_user))


@router.post("/{departure_id}/replace", response_model=schemas.DepartureRead)
def replace(
    departure_id: int,
    payload: schemas.DepartureReplace,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return svc.serialize(db, svc.replace_vehicle(db, _get(db, departure_id, current_user), payload.vehicle_id))


@public_router.get("/verify", response_model=schemas.ExitPassVerification)
def verify_exit_pass(token: str, response: Response, db: Session = Depends(get_db)):
    """Vérification du QR au portail de la gare, sans connexion. Aucune donnée personnelle n'est renvoyée."""
    response.headers["Cache-Control"] = "no-store"
    if len(token) > 512:
        return {"valid": False, "reason": "Bon de sortie invalide"}
    return svc.verify_token(db, token)
