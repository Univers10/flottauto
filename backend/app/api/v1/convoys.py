from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import require_role
from app.core.database import get_db
from app.services import convoys as svc

router = APIRouter()

reader = require_role(*svc.READERS)
writer = require_role(*svc.WRITERS)
cashier = require_role(*svc.CASHIERS)


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


def _get(db: Session, convoy_id: int, user: models.User) -> models.Convoy:
    return svc.get_convoy(db, convoy_id, _company_id(user))


@router.get("", response_model=list[schemas.ConvoyRead])
def list_convoys(
    status: models.ConvoyStatus | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(reader),
):
    company_id = _company_id(current_user)
    settings = crud.get_company_settings(db, company_id)
    return [svc.serialize(db, c, settings) for c in svc.list_convoys(db, company_id, status, q)]


@router.post("", response_model=schemas.ConvoyRead, status_code=status.HTTP_201_CREATED)
def create_convoy(payload: schemas.ConvoyCreate, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return svc.serialize(db, svc.create_convoy(db, _company_id(current_user), current_user, payload))


@router.get("/{convoy_id}", response_model=schemas.ConvoyRead)
def get_convoy(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(reader)):
    return svc.serialize(db, _get(db, convoy_id, current_user))


@router.patch("/{convoy_id}", response_model=schemas.ConvoyRead)
def update_convoy(
    convoy_id: int,
    payload: schemas.ConvoyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return svc.serialize(db, svc.update_convoy(db, _get(db, convoy_id, current_user), payload))


@router.delete("/{convoy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_convoy(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    svc.delete_convoy(db, _get(db, convoy_id, current_user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{convoy_id}/confirm", response_model=schemas.ConvoyRead)
def confirm_convoy(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    """« Valider et générer le contrat » : crée aussi le départ du convoi."""
    return svc.serialize(db, svc.confirm_convoy(db, _get(db, convoy_id, current_user), current_user))


@router.post("/{convoy_id}/complete", response_model=schemas.ConvoyRead)
def complete_convoy(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return svc.serialize(db, svc.close_convoy(db, _get(db, convoy_id, current_user), cancel=False))


@router.post("/{convoy_id}/cancel", response_model=schemas.ConvoyRead)
def cancel_convoy(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return svc.serialize(db, svc.close_convoy(db, _get(db, convoy_id, current_user), cancel=True))


@router.post("/{convoy_id}/payments", response_model=schemas.ConvoyRead, status_code=status.HTTP_201_CREATED)
def add_payment(
    convoy_id: int,
    payload: schemas.ConvoyPaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(cashier),
):
    return svc.serialize(db, svc.add_payment(db, _get(db, convoy_id, current_user), current_user, payload))


@router.delete("/{convoy_id}/payments/{payment_id}", response_model=schemas.ConvoyRead)
def delete_payment(convoy_id: int, payment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return svc.serialize(db, svc.delete_payment(db, _get(db, convoy_id, current_user), payment_id))
