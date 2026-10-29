"""Intervention + facture : besoin → devis → validation du superviseur → réalisée → facture → clôture.

Règles (maquette 4) :
- pas de validation du superviseur = dépense non remboursée ;
- facture absente à minuit le jour des travaux = alerte et dépense gelée ;
- écart facture (ou devis) / montant validé > 5 % = nouvelle validation obligatoire ;
- ancienne pièce non rapportée = intervention signalée dans les rapports.
"""
import re
import statistics
import unicodedata
from datetime import datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app import crud, models, schemas
from app.services import convoys as convoy_svc
from app.services import needs as needs_svc

R = models.Role
WO = models.WorkOrderStatus
Proof = models.ProofKind
Channel = models.ApprovalChannel

# Le superviseur valide la dépense (mêmes rôles que la validation des besoins).
APPROVERS = needs_svc.VALIDATORS
# Le chef de gare clôture ; la hiérarchie au-dessus aussi.
CLOSERS = APPROVERS + (R.MANAGER, R.STATION_MANAGER)
# Saisie du circuit (lignes, justificatifs, réalisée, facture) : encadrement et maintenancier.
WRITERS = CLOSERS + (R.MECHANIC,)
# Enregistrer une validation reçue par WhatsApp : pas le maintenancier qui fait les travaux.
WHATSAPP_RECORDERS = CLOSERS
CIRCUIT_FIELDS = {"status", "started_at", "completed_at", "payment_method", "payment_reference"}
AMOUNT_FIELDS = {"total_cost", "amount_paid", "remaining_due", "not_covered"}
GAP_TOLERANCE = 0.05

ROLE_LABELS = {
    R.SUPER_ADMIN: "Super administrateur",
    R.ADMIN: "Administrateur",
    R.MANAGER: "Gestionnaire",
    R.DRIVER: "Conducteur",
    R.MECHANIC: "Maintenancier",
    R.ACCOUNTANT: "Caisse / comptable",
    R.READER: "Lecteur",
    R.STATION_MANAGER: "Chef de gare",
    R.OPERATIONS_SUPERVISOR: "Superviseur",
    R.CONVEYOR: "Convoyeur",
}

PROOF_LABELS = {
    Proof.INVOICE: "la facture",
    Proof.NEW_PART: "la photo de la pièce neuve posée",
    Proof.OLD_PART: "la photo de l'ancienne pièce",
    Proof.APPROVAL_CAPTURE: "la capture de la validation WhatsApp",
}

# Organe réparé, déduit du titre et des lignes : sert à repérer les pannes qui reviennent.
COMPONENTS = [
    ("Embrayage", ("embray", "butee", "volant moteur")),
    ("Freins", ("frein", "plaquette", "garniture", "tambour", "machoire")),
    ("Pneus", ("pneu", "jante", "equilibrage", "chambre a air", "vulcanis")),
    ("Boîte de vitesses", ("boite", "vitesse", "cardan")),
    ("Direction", ("direction", "rotule", "fusee", "fusier", "biellette")),
    ("Suspension", ("suspension", "amortisseur", "ressort", "lame", "silent")),
    ("Électricité", ("batterie", "alternateur", "demarreur", "electri", "feu ", "phare", "clignot", "ampoule")),
    ("Refroidissement", ("radiateur", "durite", "pompe a eau", "ventilat", "refroid")),
    ("Climatisation", ("clim",)),
    ("Moteur", ("moteur", "injecteur", "culasse", "joint de culasse", "turbo", "courroie")),
    ("Vidange et graissage", ("vidange", "huile", "graissage", "filtre")),
    ("Carrosserie", ("carrosserie", "portiere", "vitre", "pare-brise", "retroviseur", "tolerie")),
]


# Entretien courant : se répète normalement, ce n'est pas une panne qui revient.
ROUTINE_COMPONENTS = {"Vidange et graissage"}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 -]", " ", text)).strip()


def _price_key(label: str) -> str:
    """Clé de comparaison des prix : mots significatifs, sans quantités ni mots vides."""
    words = [w for w in re.sub(r"\d+", " ", _norm(label)).split() if len(w) > 2 and w not in {"achat", "les", "des", "pour", "avec"}]
    return " ".join(sorted(words))


def component_of(text: str) -> str | None:
    t = f" {_norm(text)} "
    for name, keys in COMPONENTS:
        if any(k in t for k in keys):
            return name
    return None


def _user_label(user: models.User | None) -> str | None:
    if user is None:
        return None
    name = " ".join(x for x in (user.first_name, user.last_name) if x) or user.email
    return f"{ROLE_LABELS.get(user.role, '')} · {name}".strip(" ·")


def _line_amount(line: models.WorkOrderLine) -> int:
    return line.quantity * line.unit_price


def quote_total(wo: models.WorkOrder) -> int:
    return sum(_line_amount(line) for line in wo.lines)


def _invoice_total(wo: models.WorkOrder) -> int:
    return sum(line.invoice_amount if line.invoice_amount is not None else _line_amount(line) for line in wo.lines)


def _naive(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=None) if value is not None and value.tzinfo is not None else value


def _fresh_capture(wo: models.WorkOrder) -> bool:
    """Capture WhatsApp jointe après la dernière validation (une nouvelle validation demande une nouvelle capture)."""
    since = wo.approved_at
    return any(
        p.kind == Proof.APPROVAL_CAPTURE and (since is None or (_naive(p.created_at) or since) > since)
        for p in wo.photos
    )


def committed_amount(wo: models.WorkOrder) -> int:
    """Montant engagé : le plus haut du devis et de la facture (même saisie mais pas encore déposée)."""
    invoiced = wo.invoice_total or 0
    if any(line.invoice_amount is not None for line in wo.lines):
        invoiced = max(invoiced, _invoice_total(wo))
    return max(quote_total(wo), invoiced)


def _proofs(wo: models.WorkOrder) -> dict[str, bool]:
    kinds = {p.kind for p in wo.photos if p.kind}
    return {k.value: k in kinds for k in Proof}


def _is_legacy(wo: models.WorkOrder) -> bool:
    return wo.status == WO.VALIDATED and wo.closed_at is None and not wo.lines


def _needs_reapproval(wo: models.WorkOrder) -> bool:
    if wo.approved_amount is None:
        return False
    return committed_amount(wo) > wo.approved_amount * (1 + GAP_TOLERANCE)


def _invoice_missing(wo: models.WorkOrder, now: datetime) -> bool:
    """Travaux faits un jour précédent, toujours sans facture : minuit est passé."""
    return (
        wo.status in (WO.DONE,)
        and wo.completed_at is not None
        and wo.invoice_submitted_at is None
        and wo.completed_at.date() < now.date()
    )


def _get(db: Session, work_order_id: int, company_id: int) -> models.WorkOrder:
    wo = (
        db.query(models.WorkOrder)
        .filter(models.WorkOrder.id == work_order_id, models.WorkOrder.company_id == company_id)
        .options(selectinload(models.WorkOrder.lines), selectinload(models.WorkOrder.photos))
        .first()
    )
    if wo is None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    return wo


def get(db: Session, work_order_id: int, company_id: int) -> models.WorkOrder:
    return _get(db, work_order_id, company_id)


def _impact(db: Session, wo: models.WorkOrder, now: datetime) -> schemas.InterventionImpact:
    orders = db.query(models.WorkOrder).filter(
        models.WorkOrder.company_id == wo.company_id, models.WorkOrder.vehicle_id == wo.vehicle_id
    ).options(selectinload(models.WorkOrder.lines)).all()
    month_start = datetime(now.year, now.month, 1)
    year_ago = now - timedelta(days=365)

    def cost(o: models.WorkOrder) -> int:
        return int(o.total_cost or 0)

    def when(o: models.WorkOrder) -> datetime:
        return o.completed_at or o.created_at

    component = component_of(" ".join([wo.title, *(line.label for line in wo.lines)]))
    count = 0
    if component:
        count = sum(
            1 for o in orders
            if when(o) and when(o) >= year_ago and component_of(" ".join([o.title, *(line.label for line in o.lines)])) == component
        )
    repeated = component and component not in ROUTINE_COMPONENTS and count >= 3
    warning = f"{component} : {count} fois en 12 mois, contrôler la conduite" if repeated else None
    return schemas.InterventionImpact(
        total_cost=sum(cost(o) for o in orders),
        this_month=sum(cost(o) for o in orders if when(o) and when(o) >= month_start),
        component=component,
        component_count_12m=count,
        warning=warning,
    )


PriceBase = dict[str, list[tuple[int, int]]]  # libellé → [(id intervention, prix unitaire)]


def price_base(db: Session, company_id: int) -> PriceBase:
    """Prix unitaires de la société, par libellé : lignes détaillées et interventions d'une seule pièce."""
    base: PriceBase = {}
    lines = (
        db.query(models.WorkOrderLine.work_order_id, models.WorkOrderLine.label, models.WorkOrderLine.unit_price)
        .join(models.WorkOrder)
        .filter(models.WorkOrder.company_id == company_id, models.WorkOrderLine.unit_price > 0)
        .all()
    )
    for wo_id, label, price in lines:
        base.setdefault(_price_key(label), []).append((wo_id, price))
    history = (
        db.query(models.WorkOrder.id, models.WorkOrder.title, models.WorkOrder.total_cost)
        .filter(models.WorkOrder.company_id == company_id, models.WorkOrder.total_cost > 0)
        .outerjoin(models.WorkOrderLine)
        .filter(models.WorkOrderLine.id.is_(None))
        .all()
    )
    for wo_id, title, total in history:
        base.setdefault(_price_key(title), []).append((wo_id, int(total)))
    base.pop("", None)
    return base


def _price_check(db: Session, wo: models.WorkOrder, base: PriceBase | None = None) -> tuple[int, list[schemas.PriceFlag]]:
    """Compare les prix de l'intervention à ceux des autres interventions de la société."""
    if not wo.lines:
        return 0, []
    if base is None:
        base = price_base(db, wo.company_id)
    others = {k: [p for i, p in v if i != wo.id] for k, v in base.items()}
    compared = sum(len(v) for v in others.values())
    flags = []
    for line in wo.lines:
        past = others.get(_price_key(line.label))
        if not past or len(past) < 2 or not line.unit_price:
            continue
        usual = int(statistics.median(past))
        if line.unit_price > usual * 1.2:
            flags.append(schemas.PriceFlag(label=line.label, unit_price=line.unit_price, usual_price=usual))
    return compared, flags


def _reported(db: Session, wo: models.WorkOrder) -> tuple[datetime | None, str | None]:
    need = db.query(models.VehicleNeed).filter(models.VehicleNeed.work_order_id == wo.id).first()
    if need is not None:
        creator = db.get(models.User, need.created_by_id) if need.created_by_id else None
        label = need.origin_label or (ROLE_LABELS.get(creator.role) if creator else None)
        return need.created_at, label
    return wo.reported_at or wo.created_at, ROLE_LABELS.get(wo.created_by.role) if wo.created_by else None


def _hm(value: datetime | None) -> str:
    return value.strftime("%d/%m %H:%M") if value else ""


FLAG_LABELS = {
    "needs_reapproval": "Écart facture / devis > 5 % sans nouvelle validation",
    "not_approved": "Réalisée sans validation du superviseur",
    "invoice_missing": "Facture absente (dépense gelée)",
    "invoice_late": "Facture déposée en retard",
    "old_part_missing": "Ancienne pièce non rapportée",
}


def compute_flags(wo: models.WorkOrder, now: datetime | None = None) -> tuple[list[str], str]:
    """Signalements et statut de la dépense : (flags, expense_status)."""
    now = now or _now()
    legacy = _is_legacy(wo)
    proofs = _proofs(wo)
    flags: list[str] = []
    needs_reapproval = _needs_reapproval(wo)
    if needs_reapproval:
        flags.append("needs_reapproval")
    if wo.approved_at is None and wo.status in (WO.DONE, WO.VALIDATED) and not legacy:
        flags.append("not_approved")
    invoice_missing = _invoice_missing(wo, now)
    if invoice_missing:
        flags.append("invoice_missing")
    late = (
        wo.invoice_submitted_at is not None and wo.completed_at is not None
        and wo.invoice_submitted_at.date() > wo.completed_at.date()
    )
    if late:
        flags.append("invoice_late")
    if not legacy and wo.status in (WO.DONE, WO.VALIDATED) and not proofs[Proof.OLD_PART.value]:
        flags.append("old_part_missing")

    if legacy:
        expense = "reimbursable"
    elif "not_approved" in flags:
        expense = "not_reimbursed"
    elif invoice_missing or needs_reapproval:
        expense = "frozen"
    elif wo.closed_at is not None:
        expense = "reimbursable"
    else:
        expense = "pending"
    return flags, expense


def serialize(db: Session, wo: models.WorkOrder) -> schemas.InterventionRead:
    now = _now()
    legacy = _is_legacy(wo)
    qt = quote_total(wo)
    proofs = _proofs(wo)
    reported_at, reported_by = _reported(db, wo)
    approver = wo.approver_name if wo.approval_channel == Channel.WHATSAPP else None
    approver_label = (
        f"{approver}, par WhatsApp" if approver else _user_label(wo.approved_by)
    ) if wo.approved_at else None
    flags, expense = compute_flags(wo, now)
    needs_reapproval = "needs_reapproval" in flags
    invoice_missing = "invoice_missing" in flags
    late = "invoice_late" in flags

    # Étapes du circuit
    gap = (wo.invoice_total - wo.approved_amount) if wo.invoice_total is not None and wo.approved_amount is not None else None
    invoice_detail = None
    if wo.invoice_submitted_at and wo.completed_at:
        hours = max(0, int((wo.invoice_submitted_at - wo.completed_at).total_seconds() // 3600))
        invoice_detail = f"{hours} h après" + (" · en retard" if late else " (délai : le jour même)")
    elif invoice_missing:
        invoice_detail = "Absente : dépense gelée"
    steps_raw = [
        ("reported", "Besoin signalé", True, reported_at, reported_by),
        ("quote", "Devis envoyé", wo.quote_sent_at is not None, wo.quote_sent_at, convoy_svc.money(qt) if qt else None),
        ("approve", "Validé", wo.approved_at is not None, wo.approved_at,
         (approver_label + (" (capture jointe)" if wo.approval_channel == Channel.WHATSAPP and proofs[Proof.APPROVAL_CAPTURE.value] else "")) if approver_label else None),
        ("done", "Réalisée", wo.status in (WO.DONE, WO.VALIDATED) and wo.completed_at is not None, wo.completed_at,
         " · ".join(filter(None, [wo.external_garage, wo.location])) if wo.completed_at else None),
        ("invoice", "Facture déposée", wo.invoice_submitted_at is not None, wo.invoice_submitted_at, invoice_detail),
        ("close", "Clôture", wo.closed_at is not None, wo.closed_at,
         _user_label(wo.closed_by) if wo.closed_at else "En attente du chef de gare"),
    ]
    next_action = None
    if not legacy and wo.closed_at is None:
        if needs_reapproval:
            next_action = "approve"
        else:
            for key, _label, done, _at, _detail in steps_raw[1:]:
                if not done:
                    next_action = key
                    break
        # Travaux urgents faits sans devis ni validation : on passe à la facture.
        if next_action in ("quote", "approve") and wo.status == WO.DONE and not needs_reapproval:
            next_action = "invoice" if wo.invoice_submitted_at is None else "close"
    steps = [
        schemas.InterventionStep(key=k, label=lbl, done=done or legacy, current=(k == next_action), at=at, detail=detail)
        for k, lbl, done, at, detail in steps_raw
    ]

    data = schemas.WorkOrderRead.model_validate(wo).model_dump()
    compared, price_flags = _price_check(db, wo)
    return schemas.InterventionRead(
        **data,
        location=wo.location,
        garage_phone=wo.garage_phone,
        reported_at=reported_at,
        reported_by_label=reported_by,
        quote_sent_at=wo.quote_sent_at,
        approved_at=wo.approved_at,
        approver_label=approver_label,
        approval_channel=wo.approval_channel,
        approved_amount=wo.approved_amount,
        invoice_submitted_at=wo.invoice_submitted_at,
        invoice_total=wo.invoice_total,
        payment_method=wo.payment_method,
        payment_reference=wo.payment_reference,
        closed_at=wo.closed_at,
        closed_by_label=_user_label(wo.closed_by),
        vehicle_label=convoy_svc.vehicle_label(wo.vehicle) or "",
        lines=[
            schemas.WorkOrderLineRead(
                id=line.id, label=line.label, quantity=line.quantity, unit_price=line.unit_price,
                quote_amount=_line_amount(line), invoice_amount=line.invoice_amount,
            )
            for line in wo.lines
        ],
        quote_total=qt,
        gap=gap,
        legacy=legacy,
        steps=steps,
        next_action=next_action,
        proofs=proofs,
        flags=flags,
        expense_status=expense,
        blockers=_blockers(wo, next_action, proofs, needs_reapproval),
        impact=_impact(db, wo, now),
        price_compared=compared,
        price_flags=price_flags,
    )


def _blockers(wo: models.WorkOrder, action: str | None, proofs: dict[str, bool], needs_reapproval: bool) -> list[str]:
    """Ce qui manque pour l'étape suivante, en phrases simples."""
    out: list[str] = []
    if action == "quote" and quote_total(wo) <= 0:
        out.append("Ajoutez les lignes du devis (pièces et main-d'œuvre) avec leur prix.")
    if action == "approve":
        if needs_reapproval:
            out.append(f"Écart de plus de 5 % avec le montant validé ({convoy_svc.money(wo.approved_amount or 0)}) : nouvelle validation du superviseur.")
        elif quote_total(wo) <= 0:
            out.append("Ajoutez les lignes du devis avant la validation.")
    if action == "invoice" and not proofs[Proof.INVOICE.value]:
        out.append("Joignez la photo ou le PDF de la facture.")
    if action == "close":
        for kind in (Proof.INVOICE, Proof.NEW_PART):
            if not proofs[kind.value]:
                out.append(f"Joignez {PROOF_LABELS[kind]}.")
        if wo.approval_channel == Channel.WHATSAPP and not proofs[Proof.APPROVAL_CAPTURE.value]:
            out.append(f"Joignez {PROOF_LABELS[Proof.APPROVAL_CAPTURE]}.")
    return out


def _editable(wo: models.WorkOrder) -> None:
    if wo.closed_at is not None or _is_legacy(wo):
        raise HTTPException(status_code=409, detail="Intervention clôturée : elle ne peut plus être modifiée")


def set_lines(db: Session, wo: models.WorkOrder, payload: schemas.WorkOrderLinesUpdate) -> models.WorkOrder:
    _editable(wo)
    if wo.invoice_submitted_at is not None:
        raise HTTPException(status_code=409, detail="Facture déjà déposée : les lignes ne changent plus")
    wo.lines.clear()
    db.flush()
    for i, line in enumerate(payload.lines):
        wo.lines.append(models.WorkOrderLine(position=i, **line.model_dump()))
    db.flush()
    if wo.status != WO.VALIDATED:
        wo.total_cost = quote_total(wo) or None
    db.commit()
    return _get(db, wo.id, wo.company_id)


def send_quote(db: Session, wo: models.WorkOrder) -> models.WorkOrder:
    _editable(wo)
    if quote_total(wo) <= 0:
        raise HTTPException(status_code=400, detail="Ajoutez les lignes du devis avec leur prix")
    wo.quote_sent_at = _now()
    if wo.status == WO.OPENED:
        wo.status = WO.DIAGNOSED
    db.commit()
    return _get(db, wo.id, wo.company_id)


def approve(db: Session, wo: models.WorkOrder, user: models.User, payload: schemas.InterventionApprove) -> models.WorkOrder:
    _editable(wo)
    amount = committed_amount(wo)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Ajoutez les lignes du devis avant la validation")
    if payload.channel == Channel.IN_APP:
        if user.role not in APPROVERS:
            raise HTTPException(status_code=403, detail="Seul le superviseur valide une dépense dans FlottAuto")
        wo.approver_name = None
    else:
        # Validation reçue par WhatsApp : enregistrée par l'agent, avec le nom du superviseur et la capture.
        if user.role not in WHATSAPP_RECORDERS:
            raise HTTPException(status_code=403, detail="Seuls le chef de gare et l'encadrement enregistrent une validation WhatsApp")
        if not (payload.approver_name or "").strip():
            raise HTTPException(status_code=400, detail="Indiquez le nom du superviseur qui a validé sur WhatsApp")
        if not _fresh_capture(wo):
            raise HTTPException(status_code=400, detail="Joignez d'abord la capture de cette validation WhatsApp")
        wo.approver_name = payload.approver_name.strip()
    if wo.quote_sent_at is None:
        wo.quote_sent_at = _now()
    wo.approved_at = _now()
    wo.approved_by_id = user.id
    wo.approval_channel = payload.channel
    wo.approved_amount = amount
    if wo.status in (WO.OPENED, WO.DIAGNOSED):
        wo.status = WO.IN_PROGRESS
        wo.started_at = wo.started_at or _now()
    db.commit()
    return _get(db, wo.id, wo.company_id)


def mark_done(db: Session, wo: models.WorkOrder) -> models.WorkOrder:
    _editable(wo)
    if wo.status not in (WO.OPENED, WO.DIAGNOSED, WO.IN_PROGRESS):
        raise HTTPException(status_code=409, detail="Travaux déjà déclarés réalisés")
    wo.status = WO.DONE
    wo.completed_at = _now()
    db.commit()
    return _get(db, wo.id, wo.company_id)


def submit_invoice(db: Session, wo: models.WorkOrder, payload: schemas.InterventionInvoice) -> models.WorkOrder:
    _editable(wo)
    if wo.status != WO.DONE:
        raise HTTPException(status_code=409, detail="Déclarez d'abord les travaux réalisés")
    if wo.invoice_submitted_at is not None:
        raise HTTPException(status_code=409, detail="Facture déjà déposée")
    if not wo.lines:
        raise HTTPException(status_code=400, detail="Ajoutez les lignes de la facture")
    if not _proofs(wo)[Proof.INVOICE.value]:
        raise HTTPException(status_code=400, detail="Joignez la photo ou le PDF de la facture")
    for line in wo.lines:
        if line.invoice_amount is None:
            line.invoice_amount = _line_amount(line)
    wo.invoice_total = _invoice_total(wo)
    wo.total_cost = wo.invoice_total
    wo.invoice_submitted_at = _now()
    if payload.payment_method is not None:
        wo.payment_method = payload.payment_method
    if payload.payment_reference is not None:
        wo.payment_reference = payload.payment_reference.strip() or None
    db.commit()
    _dismiss_invoice_alert(db, wo)
    return _get(db, wo.id, wo.company_id)


def close(db: Session, wo: models.WorkOrder, user: models.User) -> models.WorkOrder:
    _editable(wo)
    if wo.invoice_submitted_at is None:
        raise HTTPException(status_code=409, detail="La facture n'est pas encore déposée")
    if _needs_reapproval(wo):
        raise HTTPException(status_code=409, detail="Écart de plus de 5 % avec le montant validé : nouvelle validation du superviseur")
    missing = _blockers(wo, "close", _proofs(wo), False)
    if missing:
        raise HTTPException(status_code=400, detail=" ".join(missing))
    # Clôture, besoin d'origine et libération du car dans la même transaction.
    wo.closed_at = _now()
    wo.closed_by_id = user.id
    wo.status = WO.VALIDATED
    need = db.query(models.VehicleNeed).filter(models.VehicleNeed.work_order_id == wo.id).first()
    if need is not None and need.status != models.NeedStatus.DONE:
        need.status = models.NeedStatus.DONE
    db.flush()
    vehicle = wo.vehicle
    if vehicle is not None and vehicle.status == models.VehicleStatus.IN_MAINTENANCE:
        still_open = db.query(models.WorkOrder.id).filter(
            models.WorkOrder.vehicle_id == vehicle.id, models.WorkOrder.status != WO.VALIDATED
        ).first()
        if still_open is None:
            vehicle.status = models.VehicleStatus.AVAILABLE
    db.commit()
    return _get(db, wo.id, wo.company_id)


def _dismiss_invoice_alert(db: Session, wo: models.WorkOrder) -> None:
    db.query(models.Alert).filter(
        models.Alert.company_id == wo.company_id,
        models.Alert.alert_type == models.AlertType.INVOICE_MISSING,
        models.Alert.title == _invoice_alert_title(wo),
        models.Alert.dismissed_at.is_(None),
    ).update({models.Alert.dismissed_at: _now(), models.Alert.is_read: True}, synchronize_session=False)
    db.commit()


def _invoice_alert_title(wo: models.WorkOrder) -> str:
    return f"Facture absente : intervention N°{wo.id}"


def generate_invoice_missing_alerts(db: Session, company_id: int) -> int:
    """Facture absente à minuit : alerte au superviseur (une par intervention)."""
    midnight = datetime.combine(_now().date(), time.min)
    orders = db.query(models.WorkOrder).filter(
        models.WorkOrder.company_id == company_id,
        models.WorkOrder.status == WO.DONE,
        models.WorkOrder.completed_at < midnight,
        models.WorkOrder.invoice_submitted_at.is_(None),
    ).all()
    created = 0
    for wo in orders:
        title = _invoice_alert_title(wo)
        exists = db.query(models.Alert.id).filter(
            models.Alert.company_id == company_id,
            models.Alert.alert_type == models.AlertType.INVOICE_MISSING,
            models.Alert.title == title,
        ).first()
        if exists:
            continue
        crud.create_alert(db, {
            "company_id": company_id,
            "vehicle_id": wo.vehicle_id,
            "alert_type": models.AlertType.INVOICE_MISSING,
            "severity": "critical",
            "title": title,
            "message": f"{wo.title} ({convoy_svc.vehicle_label(wo.vehicle) or ''}) : travaux du {wo.completed_at:%d/%m/%Y} sans facture. Dépense gelée.",
            "due_date": wo.completed_at.date(),
        })
        created += 1
    return created
