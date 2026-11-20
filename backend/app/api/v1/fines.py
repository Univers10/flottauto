from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.deps import get_current_user
from app.core.database import get_db
from app.services import fines as svc
from app.services import reports as report_svc
from app.utils.uploads import delete_upload, save_image

router = APIRouter()


def _company_id(current_user: models.User) -> int:
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="User has no company")
    return current_user.company_id


@router.get("", response_model=list[schemas.FineRead])
def list_fines(
    driver_id: int | None = None,
    vehicle_id: int | None = None,
    status: models.FineStatus | None = None,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return [svc.read(f) for f in svc.list_fines(db, _company_id(current_user), driver_id, vehicle_id, status, start, end)]


@router.post("", response_model=schemas.FineRead, status_code=status.HTTP_201_CREATED)
def create_fine(payload: schemas.FineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return svc.read(svc.create_fine(db, _company_id(current_user), current_user, payload))


@router.get("/balances")
def balances(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Solde de chaque chauffeur (ce qu'il doit encore sur ses contraventions)."""
    return svc.balance_list(db, _company_id(current_user))


@router.get("/report")
def fines_report(start: date, end: date, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if end < start or (end - start).days > report_svc.MAX_DAYS:
        raise HTTPException(status_code=400, detail="Période invalide (13 mois au plus)")
    return svc.report(db, _company_id(current_user), start, end)


@router.get("/drivers/{driver_id}")
def driver_statement(driver_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Relevé du chauffeur : amendes à sa charge, remboursements, solde après chaque ligne."""
    return svc.statement(db, _company_id(current_user), driver_id)


@router.post("/repayments", response_model=schemas.FineRepaymentRead, status_code=status.HTTP_201_CREATED)
def add_repayment(payload: schemas.FineRepaymentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return svc.add_repayment(db, _company_id(current_user), current_user, payload)


@router.delete("/repayments/{repayment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repayment(repayment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    r = db.query(models.FineRepayment).filter(
        models.FineRepayment.id == repayment_id, models.FineRepayment.company_id == _company_id(current_user)
    ).first()
    if r is None:
        raise HTTPException(status_code=404, detail="Remboursement introuvable")
    db.delete(r)
    db.commit()


@router.get("/{fine_id}", response_model=schemas.FineRead)
def get_fine(fine_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return svc.read(svc.get_fine(db, _company_id(current_user), fine_id))


@router.put("/{fine_id}", response_model=schemas.FineRead)
def update_fine(fine_id: int, payload: schemas.FineUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    company_id = _company_id(current_user)
    return svc.read(svc.update_fine(db, company_id, svc.get_fine(db, company_id, fine_id), payload))


@router.post("/{fine_id}/photo", response_model=schemas.FineRead)
def upload_fine_photo(
    fine_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    """Photo du procès-verbal."""
    company_id = _company_id(current_user)
    f = svc.get_fine(db, company_id, fine_id)
    old = f.photo_url
    f.photo_url = save_image(file, company_id, "fines", fine_id, prefix="pv")
    db.commit()
    if old:
        delete_upload(old, company_id)
    db.refresh(f)
    return svc.read(f)


@router.delete("/{fine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fine(fine_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    f = svc.get_fine(db, _company_id(current_user), fine_id)
    if f.photo_url:
        delete_upload(f.photo_url, f.company_id)
    db.delete(f)
    db.commit()
