"""Contraventions : la compagnie paie l'amende ; celles à la charge du chauffeur forment sa dette,
qu'il rembourse petit à petit (versements ou retenues). Solde = amendes à sa charge − remboursements.
"""
from collections import defaultdict
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.services import convoys as convoy_svc


def _name(d: models.Driver | None) -> str | None:
    return f"{d.first_name} {d.last_name}".strip() if d else None


def read(f: models.Fine) -> schemas.FineRead:
    out = schemas.FineRead.model_validate(f)
    out.vehicle_label = convoy_svc.vehicle_label(f.vehicle)
    out.driver_name = _name(f.driver)
    return out


def get_fine(db: Session, company_id: int, fine_id: int) -> models.Fine:
    f = db.query(models.Fine).filter(models.Fine.id == fine_id, models.Fine.company_id == company_id).first()
    if f is None:
        raise HTTPException(status_code=404, detail="Contravention introuvable")
    return f


def _check_refs(db: Session, company_id: int, vehicle_id: int | None, driver_id: int | None) -> None:
    if vehicle_id is not None and not db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id, models.Vehicle.company_id == company_id).first():
        raise HTTPException(status_code=404, detail="Car introuvable")
    if driver_id is not None and not db.query(models.Driver).filter(models.Driver.id == driver_id, models.Driver.company_id == company_id).first():
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")


def list_fines(db: Session, company_id: int, driver_id: int | None = None, vehicle_id: int | None = None,
               status: models.FineStatus | None = None, start: date | None = None, end: date | None = None) -> list[models.Fine]:
    q = db.query(models.Fine).filter(models.Fine.company_id == company_id)
    if driver_id is not None:
        q = q.filter(models.Fine.driver_id == driver_id)
    if vehicle_id is not None:
        q = q.filter(models.Fine.vehicle_id == vehicle_id)
    if status is not None:
        q = q.filter(models.Fine.status == status)
    if start is not None:
        q = q.filter(models.Fine.fine_date >= start)
    if end is not None:
        q = q.filter(models.Fine.fine_date <= end)
    return q.options(selectinload(models.Fine.vehicle), selectinload(models.Fine.driver)).order_by(models.Fine.fine_date.desc(), models.Fine.id.desc()).all()


def create_fine(db: Session, company_id: int, user: models.User, payload: schemas.FineCreate) -> models.Fine:
    _check_refs(db, company_id, payload.vehicle_id, payload.driver_id)
    data = payload.model_dump()
    if data["status"] == models.FineStatus.PAID and data["paid_on"] is None:
        data["paid_on"] = date.today()
    f = models.Fine(company_id=company_id, created_by_id=user.id, **data)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def update_fine(db: Session, company_id: int, f: models.Fine, payload: schemas.FineUpdate) -> models.Fine:
    data = payload.model_dump(exclude_unset=True)
    _check_refs(db, company_id, data.get("vehicle_id"), data.get("driver_id"))
    for k, v in data.items():
        setattr(f, k, v)
    if f.status == models.FineStatus.PAID and f.paid_on is None:
        f.paid_on = date.today()
    if f.status == models.FineStatus.TO_PAY:
        f.paid_on = None
    db.commit()
    db.refresh(f)
    return f


def balances(db: Session, company_id: int, driver_id: int | None = None) -> dict[int, dict]:
    """Par chauffeur : amendes à sa charge, remboursé, solde (ce qu'il doit encore)."""
    out: dict[int, dict] = defaultdict(lambda: {"charged": 0, "repaid": 0, "fines": 0})
    fq = db.query(models.Fine).filter(models.Fine.company_id == company_id, models.Fine.charged_to_driver.is_(True), models.Fine.driver_id.isnot(None))
    rq = db.query(models.FineRepayment).filter(models.FineRepayment.company_id == company_id)
    if driver_id is not None:
        fq = fq.filter(models.Fine.driver_id == driver_id)
        rq = rq.filter(models.FineRepayment.driver_id == driver_id)
    for f in fq:
        out[f.driver_id]["charged"] += f.amount
        out[f.driver_id]["fines"] += 1
    for r in rq:
        out[r.driver_id]["repaid"] += r.amount
    for v in out.values():
        v["balance"] = v["charged"] - v["repaid"]
    return out


def balance_list(db: Session, company_id: int) -> list[dict]:
    rows = balances(db, company_id)
    drivers = {d.id: d for d in db.query(models.Driver).filter(models.Driver.company_id == company_id, models.Driver.id.in_(list(rows) or [0]))}
    items = [{"driver_id": i, "driver_name": _name(drivers.get(i)), **v} for i, v in rows.items() if i in drivers]
    return sorted(items, key=lambda x: (-x["balance"], x["driver_name"] or ""))


def statement(db: Session, company_id: int, driver_id: int) -> dict:
    """Relevé du chauffeur : amendes et remboursements dans l'ordre, avec le solde après chaque ligne."""
    driver = db.query(models.Driver).filter(models.Driver.id == driver_id, models.Driver.company_id == company_id).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")
    fines = [f for f in list_fines(db, company_id, driver_id=driver_id) if f.charged_to_driver]
    reps = db.query(models.FineRepayment).filter(models.FineRepayment.company_id == company_id, models.FineRepayment.driver_id == driver_id).all()
    lines = [
        {"date": f.fine_date, "kind": "fine", "id": f.id, "label": f.reason, "detail": convoy_svc.vehicle_label(f.vehicle), "amount": f.amount}
        for f in fines
    ] + [
        {"date": r.repayment_date, "kind": "repayment", "id": r.id, "label": "Retenue sur salaire" if r.method == models.RepaymentMethod.PAYROLL else "Versement",
         "detail": r.notes, "amount": -r.amount}
        for r in reps
    ]
    lines.sort(key=lambda x: (x["date"], 0 if x["kind"] == "fine" else 1, x["id"]))
    running = 0
    for line in lines:
        running += line["amount"]
        line["balance"] = running
    total = balances(db, company_id, driver_id).get(driver_id, {"charged": 0, "repaid": 0, "fines": 0, "balance": 0})
    return {"driver_id": driver_id, "driver_name": _name(driver), **total, "lines": list(reversed(lines))}


def add_repayment(db: Session, company_id: int, user: models.User, payload: schemas.FineRepaymentCreate) -> models.FineRepayment:
    _check_refs(db, company_id, None, payload.driver_id)
    due = balances(db, company_id, payload.driver_id).get(payload.driver_id, {"balance": 0})["balance"]
    if payload.amount > due:
        raise HTTPException(status_code=400, detail=f"Le chauffeur ne doit que {due} F")
    r = models.FineRepayment(company_id=company_id, created_by_id=user.id, **payload.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def report(db: Session, company_id: int, start: date, end: date) -> dict:
    """Contraventions par chauffeur sur une période (nombre, montant, à sa charge, remboursé) et solde actuel."""
    fines = list_fines(db, company_id, start=start, end=end)
    reps = db.query(models.FineRepayment).filter(
        models.FineRepayment.company_id == company_id, models.FineRepayment.repayment_date >= start, models.FineRepayment.repayment_date <= end
    ).all()
    current = balances(db, company_id)
    rows: dict[int | None, dict] = defaultdict(lambda: {"count": 0, "amount": 0, "charged": 0, "repaid": 0})
    names: dict[int | None, str | None] = {None: None}
    for f in fines:
        r = rows[f.driver_id]
        r["count"] += 1
        r["amount"] += f.amount
        r["charged"] += f.amount if f.charged_to_driver and f.driver_id else 0
        names[f.driver_id] = _name(f.driver)
    for rep in reps:
        rows[rep.driver_id]["repaid"] += rep.amount
        names.setdefault(rep.driver_id, _name(rep.driver))
    items = [
        {"driver_id": i, "driver_name": names.get(i) or "Sans chauffeur", **v, "balance": current.get(i, {}).get("balance", 0) if i else 0}
        for i, v in rows.items()
    ]
    items.sort(key=lambda x: -x["amount"])
    return {
        "start": start, "end": end,
        "count": len(fines), "amount": sum(f.amount for f in fines),
        "to_pay": sum(f.amount for f in fines if f.status == models.FineStatus.TO_PAY),
        "repaid": sum(r.amount for r in reps),
        "drivers": items,
    }
