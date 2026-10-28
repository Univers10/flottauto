"""Liste des besoins des cars : création (manuelle ou issue d'un état des lieux), cycle de statuts, intervention."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import case, update
from sqlalchemy.orm import Session

from app import crud, models, schemas

R = models.Role
NeedStatus = models.NeedStatus

WRITERS = (R.SUPER_ADMIN, R.ADMIN, R.MANAGER, R.STATION_MANAGER, R.OPERATIONS_SUPERVISOR)
# Seuls ces rôles engagent une dépense (règle : le chef de gare demande, le superviseur valide).
VALIDATORS = (R.SUPER_ADMIN, R.ADMIN, R.OPERATIONS_SUPERVISOR)
CLOSED = (NeedStatus.DONE, NeedStatus.CANCELLED)
EDITABLE = (NeedStatus.OPEN, NeedStatus.VALIDATION_REQUESTED)

# Transitions permises aux rôles qui ne valident pas (chef de gare, gestionnaire).
# « Planifié » ne s'obtient qu'en créant l'intervention ; « Validé » est réservé au superviseur.
_TRANSITIONS = {
    NeedStatus.OPEN: {NeedStatus.VALIDATION_REQUESTED, NeedStatus.CANCELLED},
    NeedStatus.VALIDATION_REQUESTED: {NeedStatus.OPEN, NeedStatus.CANCELLED},
    NeedStatus.VALIDATED: set(),
    NeedStatus.SCHEDULED: {NeedStatus.DONE},
    NeedStatus.DONE: set(),
    NeedStatus.CANCELLED: set(),
}

_PRIORITY_ORDER = case(
    (models.VehicleNeed.priority == models.NeedPriority.BEFORE_DEPARTURE, 0),
    (models.VehicleNeed.priority == models.NeedPriority.THIS_WEEK, 1),
    else_=2,
)


def list_needs(
    db: Session,
    company_id: int,
    vehicle_id: int | None = None,
    status: models.NeedStatus | None = None,
    priority: models.NeedPriority | None = None,
    open_only: bool = False,
) -> list[models.VehicleNeed]:
    q = db.query(models.VehicleNeed).filter(models.VehicleNeed.company_id == company_id)
    if vehicle_id:
        q = q.filter(models.VehicleNeed.vehicle_id == vehicle_id)
    if status:
        q = q.filter(models.VehicleNeed.status == status)
    if priority:
        q = q.filter(models.VehicleNeed.priority == priority)
    if open_only:
        q = q.filter(models.VehicleNeed.status.notin_(CLOSED))
    return q.order_by(_PRIORITY_ORDER, models.VehicleNeed.created_at).all()


def get_need(db: Session, need_id: int, company_id: int) -> models.VehicleNeed:
    need = db.query(models.VehicleNeed).filter(models.VehicleNeed.id == need_id, models.VehicleNeed.company_id == company_id).first()
    if not need:
        raise HTTPException(status_code=404, detail="Need not found")
    return need


def add_need(
    db: Session,
    insp: models.Inspection,
    title: str,
    details: str | None,
    priority: models.NeedPriority,
    origin: models.NeedOrigin,
    origin_label: str,
    user: models.User,
    unique_open: bool = False,
) -> models.VehicleNeed | None:
    """Ajoute un besoin issu d'un état des lieux (dans la transaction en cours)."""
    # Un même défaut encore ouvert n'est pas recréé à chaque état des lieux.
    same = db.query(models.VehicleNeed.id).filter(
        models.VehicleNeed.vehicle_id == insp.vehicle_id,
        models.VehicleNeed.status.notin_(CLOSED),
    )
    same = same.filter(models.VehicleNeed.origin == origin) if unique_open else same.filter(models.VehicleNeed.title == title[:255])
    if same.first():
        return None
    need = models.VehicleNeed(
        company_id=insp.company_id,
        vehicle_id=insp.vehicle_id,
        title=title[:255],
        details=details,
        priority=priority,
        origin=origin,
        origin_label=origin_label,
        inspection_id=insp.id,
        created_by_id=user.id,
    )
    db.add(need)
    db.flush()
    return need


def create_need(db: Session, company_id: int, user: models.User, payload: schemas.VehicleNeedCreate) -> models.VehicleNeed:
    if not crud.get_vehicle(db, payload.vehicle_id, company_id):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    need = models.VehicleNeed(**payload.model_dump(), company_id=company_id, origin=models.NeedOrigin.MANUAL, created_by_id=user.id)
    db.add(need)
    db.commit()
    db.refresh(need)
    return need


def update_need(db: Session, need: models.VehicleNeed, payload: schemas.VehicleNeedUpdate, user: models.User) -> models.VehicleNeed:
    data = payload.model_dump(exclude_unset=True)
    new_status = data.pop("status", None)
    is_validator = user.role in VALIDATORS

    if new_status == NeedStatus.VALIDATED and not is_validator:
        raise HTTPException(status_code=403, detail="Seul le superviseur des opérations valide une dépense")
    if data and not is_validator and need.status not in EDITABLE:
        raise HTTPException(status_code=403, detail="Besoin déjà validé : seul le superviseur peut le modifier")
    if new_status is not None and new_status != need.status:
        if need.work_order_id is not None and new_status not in (NeedStatus.DONE, NeedStatus.CANCELLED):
            raise HTTPException(status_code=409, detail="Une intervention existe déjà pour ce besoin")
        if not is_validator and new_status not in _TRANSITIONS[need.status]:
            raise HTTPException(status_code=409, detail="Changement de statut non permis")
        if new_status == NeedStatus.SCHEDULED and need.work_order_id is None:
            raise HTTPException(status_code=409, detail="Créez l'intervention pour planifier ce besoin")
        need.status = new_status
        if new_status == NeedStatus.VALIDATED:
            need.validated_by_id = user.id
            need.validated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    for field, value in data.items():
        setattr(need, field, value)
    db.commit()
    db.refresh(need)
    return need


def to_work_order(db: Session, need: models.VehicleNeed, user: models.User) -> models.WorkOrder:
    """Un besoin validé devient une intervention (ordre de travail)."""
    if need.work_order_id is not None:
        raise HTTPException(status_code=409, detail="Une intervention existe déjà pour ce besoin")
    if need.status != NeedStatus.VALIDATED:
        raise HTTPException(status_code=409, detail="Le besoin doit d'abord être validé par le superviseur")
    # Réservation atomique : deux demandes simultanées ne créent qu'une intervention.
    claimed = db.execute(
        update(models.VehicleNeed)
        .where(
            models.VehicleNeed.id == need.id,
            models.VehicleNeed.status == NeedStatus.VALIDATED,
            models.VehicleNeed.work_order_id.is_(None),
        )
        .values(status=NeedStatus.SCHEDULED)
    ).rowcount
    if not claimed:
        db.rollback()
        raise HTTPException(status_code=409, detail="Une intervention existe déjà pour ce besoin")
    description = "\n".join(filter(None, [need.details, f"Origine : {need.origin_label}" if need.origin_label else None]))
    wo = crud.create_work_order(
        db,
        schemas.WorkOrderCreate(
            vehicle_id=need.vehicle_id,
            type=models.WorkOrderType.PREVENTIVE if need.origin == models.NeedOrigin.ODOMETER else models.WorkOrderType.CURATIVE,
            title=need.title,
            description=description or None,
        ),
        company_id=need.company_id,
        created_by_id=user.id,
        # L'intervention est planifiée : le car reste en service jusqu'à sa réalisation.
        set_vehicle_status=False,
    )
    db.refresh(need)
    need.work_order_id = wo.id
    db.commit()
    db.refresh(need)
    return wo
