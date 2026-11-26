import secrets

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import require_role
from app.core.database import get_db
from app.services import convoys as svc

router = APIRouter()
# Contrat ouvert depuis le lien envoyé au client (sans compte).
public_router = APIRouter()

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


@router.post("/{convoy_id}/share", response_model=schemas.ConvoyRead)
def share_contract(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(cashier)):
    """Lien secret du contrat, à envoyer au client par WhatsApp ou par mail (lecture seule)."""
    convoy = _get(db, convoy_id, current_user)
    if convoy.status == models.ConvoyStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Validez d'abord le convoi : le contrat n'est pas encore généré")
    if not convoy.share_token:
        convoy.share_token = secrets.token_urlsafe(24)
        db.commit()
    return svc.serialize(db, svc.get_convoy(db, convoy.id, convoy.company_id))


@router.delete("/{convoy_id}/share", response_model=schemas.ConvoyRead)
def revoke_contract_link(convoy_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    """Le lien envoyé ne marche plus (envoyé à la mauvaise personne…)."""
    convoy = _get(db, convoy_id, current_user)
    convoy.share_token = None
    db.commit()
    return svc.serialize(db, svc.get_convoy(db, convoy.id, convoy.company_id))


@public_router.get("/{token}", response_model=schemas.PublicContract)
def public_contract(token: str, response: Response, db: Session = Depends(get_db)):
    """Contrat ouvert par le client depuis le lien reçu, sans compte. Ni charges, ni marge, ni notes internes."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex"
    convoy = None
    if 16 <= len(token) <= 64:
        convoy = db.query(models.Convoy).filter(models.Convoy.share_token == token).first()
    if convoy is None or convoy.status in (models.ConvoyStatus.DRAFT, models.ConvoyStatus.CANCELLED):
        raise HTTPException(status_code=404, detail="Contrat introuvable ou lien expiré")
    settings = crud.get_company_settings(db, convoy.company_id)
    full = svc.serialize(db, convoy, settings)
    a = full.account
    account = a.model_copy(update={
        "charge_lines": [], "charges": 0, "margin": 0, "margin_pct": None, "margin_per_km": None, "margin_per_day": None,
        "break_even_seats": None, "fuel_share_pct": None, "floor_price": 0, "line_ratio": None,
        "verdict": "incomplete", "verdict_label": "", "verdict_detail": "", "alerts": [],
    }) if a else None
    public = full.model_copy(update={
        "account": account, "notes": None, "share_token": None, "vehicle_documents": [],
        "fuel_cost": None, "driver_rations_cost": None, "conveyor_rations_cost": None, "tolls_estimate": 0,
        "commission_pct": None, "daily_rate": None, "broker_name": None, "broker_phone": None,
    })
    return {"convoy": public, "settings": schemas.ContractSettings.model_validate(settings)}
