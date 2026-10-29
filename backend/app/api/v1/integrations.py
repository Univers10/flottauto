import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import require_role
from app.core.database import get_db
from app.services import itts_bridge as svc

router = APIRouter()

ADMINS = (models.Role.SUPER_ADMIN, models.Role.ADMIN, models.Role.OPERATIONS_SUPERVISOR)


# ───────────── Appels d'ITTS Gestion (signés HMAC, sans compte utilisateur) ─────────────

@router.post("/itts/events", response_model=schemas.IttsEventResult)
def receive_event(raw: bytes = Depends(svc.verify_request), db: Session = Depends(get_db)):
    # 422 = rejet définitif : ITTS ne renvoie pas l'événement (contrat §2).
    try:
        event = schemas.IttsEvent.model_validate(json.loads(raw))
    except ValidationError as exc:
        fields = sorted({".".join(str(p) for p in err["loc"]) for err in exc.errors()})
        raise HTTPException(status_code=422, detail={"message": "Événement invalide", "fields": fields[:20]})
    except (ValueError, RecursionError):
        raise HTTPException(status_code=422, detail={"message": "JSON invalide"})
    return {"status": svc.handle_event(db, raw, event)}


@router.get("/itts/departures/{itts_departure_id}/authorization", response_model=schemas.IttsAuthorization)
def departure_authorization(
    itts_departure_id: str,
    bus_id: str = Query(..., min_length=1, max_length=64, description="Car ITTS qui va réellement sortir"),
    _raw: bytes = Depends(svc.verify_request),
    db: Session = Depends(get_db),
):
    """Interrogé par ITTS juste avant de passer un départ à « parti »."""
    return svc.authorization(db, itts_departure_id, bus_id)


# ───────────── Administration (Paramètres → Intégration ITTS) ─────────────

@router.get("/itts/status")
def bridge_status(db: Session = Depends(get_db), current_user: models.User = Depends(require_role(*ADMINS))):
    return svc.status(db, current_user.company_id)


@router.post("/itts/bus-mappings")
def map_bus(
    payload: schemas.IttsBusMapping,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*ADMINS)),
):
    if current_user.company_id != svc.company_id():
        raise HTTPException(status_code=403, detail="Cette société n'est pas reliée à ITTS Gestion")
    return {"replayed": svc.map_bus(db, current_user.company_id, payload)}
