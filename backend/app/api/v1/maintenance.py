
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.services import interventions as iv
from app.utils.uploads import save_document, save_image

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.post("/plans", response_model=schemas.MaintenancePlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: schemas.MaintenancePlanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_maintenance_plan(db, payload, company_id=_company_id(current_user))


@router.get("/plans", response_model=list[schemas.MaintenancePlanRead])
def list_plans(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_maintenance_plans(db, _company_id(current_user))


@router.post("/work-orders", response_model=schemas.WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order(
    payload: schemas.WorkOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    vehicle = crud.get_vehicle(db, payload.vehicle_id, company_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return crud.create_work_order(db, payload, company_id=company_id, created_by_id=current_user.id)


@router.get("/work-orders", response_model=list[schemas.WorkOrderRead])
def list_work_orders(
    vehicle_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.list_work_orders(db, _company_id(current_user), vehicle_id=vehicle_id, status=status)


@router.get("/work-orders/{work_order_id}", response_model=schemas.WorkOrderRead)
def get_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    wo = crud.get_work_order(db, work_order_id, _company_id(current_user))
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


@router.put("/work-orders/{work_order_id}", response_model=schemas.WorkOrderRead)
def update_work_order(
    work_order_id: int,
    payload: schemas.WorkOrderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*iv.WRITERS)),
):
    wo = crud.get_work_order(db, work_order_id, _company_id(current_user))
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.closed_at is not None:
        raise HTTPException(status_code=409, detail="Intervention clôturée : elle ne peut plus être modifiée")
    sent = payload.model_fields_set
    # Statut, dates et paiement ne bougent que par le circuit (devis, validation, réalisée, facture, clôture).
    if sent & iv.CIRCUIT_FIELDS:
        raise HTTPException(status_code=409, detail="Utilisez les étapes de l'intervention pour changer son avancement")
    # Les montants viennent des lignes dès qu'il y a un devis ou une validation.
    if sent & iv.AMOUNT_FIELDS and (wo.lines or wo.approved_at is not None):
        raise HTTPException(status_code=409, detail="Le coût vient des lignes du devis et de la facture")
    return crud.update_work_order(db, wo, payload)


@router.delete("/work-orders/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_role(models.Role.SUPER_ADMIN, models.Role.ADMIN, models.Role.MANAGER, models.Role.OPERATIONS_SUPERVISOR)
    ),
):
    wo = crud.get_work_order(db, work_order_id, _company_id(current_user))
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.closed_at is not None:
        raise HTTPException(status_code=409, detail="Intervention clôturée : elle est conservée avec ses justificatifs")
    crud.delete_work_order(db, wo)
    return None


@router.post("/work-orders/{work_order_id}/photos", response_model=schemas.WorkOrderPhotoRead, status_code=status.HTTP_201_CREATED)
def upload_work_order_photo(
    work_order_id: int,
    caption: str | None = Form(None),
    kind: models.ProofKind | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*iv.WRITERS)),
):
    company_id = _company_id(current_user)
    wo = crud.get_work_order(db, work_order_id, company_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.closed_at is not None:
        raise HTTPException(status_code=409, detail="Intervention clôturée")

    if kind == models.ProofKind.INVOICE:
        # La facture peut être un PDF ou une photo.
        file_url = save_document(file, company_id, "work_orders", work_order_id, prefix="facture")
    else:
        file_url = save_image(file, company_id, "work_orders", work_order_id, prefix=kind.value if kind else "photo")
    return crud.create_work_order_photo(db, work_order_id, company_id, file_url, caption, kind)


@router.get("/work-orders/{work_order_id}/photos", response_model=list[schemas.WorkOrderPhotoRead])
def list_work_order_photos(
    work_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    wo = crud.get_work_order(db, work_order_id, company_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return crud.list_work_order_photos(db, work_order_id, company_id)


@router.delete("/work-orders/{work_order_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order_photo(
    work_order_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(*iv.WRITERS)),
):
    company_id = _company_id(current_user)
    photo = crud.get_work_order_photo(db, photo_id, company_id)
    if not photo or photo.work_order_id != work_order_id:
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.work_order.closed_at is not None:
        raise HTTPException(status_code=409, detail="Intervention clôturée : justificatif conservé")
    crud.delete_work_order_photo(db, photo)
    return None


# ───────────── Intervention + facture : circuit de validation ─────────────

closer = require_role(*iv.CLOSERS)
writer = require_role(*iv.WRITERS)


def _intervention(db: Session, work_order_id: int, user: models.User) -> models.WorkOrder:
    return iv.get(db, work_order_id, _company_id(user))


@router.get("/work-orders/{work_order_id}/intervention", response_model=schemas.InterventionRead)
def get_intervention(work_order_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return iv.serialize(db, _intervention(db, work_order_id, current_user))


@router.put("/work-orders/{work_order_id}/lines", response_model=schemas.InterventionRead)
def set_lines(
    work_order_id: int,
    payload: schemas.WorkOrderLinesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return iv.serialize(db, iv.set_lines(db, _intervention(db, work_order_id, current_user), payload))


@router.post("/work-orders/{work_order_id}/send-quote", response_model=schemas.InterventionRead)
def send_quote(work_order_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return iv.serialize(db, iv.send_quote(db, _intervention(db, work_order_id, current_user)))


@router.post("/work-orders/{work_order_id}/approve", response_model=schemas.InterventionRead)
def approve(
    work_order_id: int,
    payload: schemas.InterventionApprove,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    """Validation du superviseur : dans FlottAuto (superviseur), ou reçue par WhatsApp (capture + nom)."""
    return iv.serialize(db, iv.approve(db, _intervention(db, work_order_id, current_user), current_user, payload))


@router.post("/work-orders/{work_order_id}/done", response_model=schemas.InterventionRead)
def mark_done(work_order_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(writer)):
    return iv.serialize(db, iv.mark_done(db, _intervention(db, work_order_id, current_user)))


@router.post("/work-orders/{work_order_id}/invoice", response_model=schemas.InterventionRead)
def submit_invoice(
    work_order_id: int,
    payload: schemas.InterventionInvoice,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(writer),
):
    return iv.serialize(db, iv.submit_invoice(db, _intervention(db, work_order_id, current_user), payload))


@router.post("/work-orders/{work_order_id}/close", response_model=schemas.InterventionRead)
def close_intervention(work_order_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(closer)):
    return iv.serialize(db, iv.close(db, _intervention(db, work_order_id, current_user), current_user))
