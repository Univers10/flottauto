"""Intervention + facture : circuit devis → validation → réalisée → facture → clôture (maquette 4)."""
from datetime import datetime, timedelta

from app import models
from app.services import alerts as alert_svc

R = models.Role
WO = "/api/v1/maintenance/work-orders"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100
PDF = b"%PDF-1.4 facture"

LINES = [
    {"label": "Disque d'embrayage", "quantity": 1, "unit_price": 45000},
    {"label": "Butée d'embrayage", "quantity": 1, "unit_price": 60000},
    {"label": "Main-d'œuvre mécanicien", "quantity": 1, "unit_price": 25000},
]


def _wo(client, headers, vehicle, title="Embrayage : butée et disque"):
    r = client.post(WO, headers=headers, json={"vehicle_id": vehicle.id, "title": title})
    assert r.status_code == 201, r.text
    return r.json()


def _proof(client, headers, wo_id, kind):
    name, data = ("facture.pdf", PDF) if kind == "invoice" else ("photo.png", PNG)
    r = client.post(f"{WO}/{wo_id}/photos", headers=headers, data={"kind": kind}, files={"file": (name, data)})
    assert r.status_code == 201, r.text
    return r.json()


def _lines(client, headers, wo_id, lines=LINES):
    r = client.put(f"{WO}/{wo_id}/lines", headers=headers, json={"lines": lines})
    assert r.status_code == 200, r.text
    return r.json()


def test_full_circuit_matches_the_mockup(client, auth, vehicle):
    cg, sup = auth(R.STATION_MANAGER), auth(R.OPERATIONS_SUPERVISOR)
    wo = _wo(client, cg, vehicle)
    iv = client.get(f"{WO}/{wo['id']}/intervention", headers=cg).json()
    assert iv["next_action"] == "quote" and iv["blockers"]

    iv = _lines(client, cg, wo["id"])
    assert iv["quote_total"] == 130_000
    iv = client.post(f"{WO}/{wo['id']}/send-quote", headers=cg).json()
    assert iv["next_action"] == "approve"

    # Le chef de gare ne valide pas lui-même dans l'app.
    assert client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "in_app"}).status_code == 403
    iv = client.post(f"{WO}/{wo['id']}/approve", headers=sup, json={"channel": "in_app"}).json()
    assert iv["approved_amount"] == 130_000 and iv["next_action"] == "done"

    iv = client.post(f"{WO}/{wo['id']}/done", headers=cg).json()
    assert iv["next_action"] == "invoice"
    assert client.post(f"{WO}/{wo['id']}/invoice", headers=cg, json={}).status_code == 400  # facture manquante
    _proof(client, cg, wo["id"], "invoice")
    iv = client.post(f"{WO}/{wo['id']}/invoice", headers=cg, json={"payment_method": "wave", "payment_reference": "TX1"}).json()
    assert iv["invoice_total"] == 130_000 and iv["gap"] == 0 and iv["next_action"] == "close"
    assert "Joignez la photo de la pièce neuve posée." in iv["blockers"]

    assert client.post(f"{WO}/{wo['id']}/close", headers=cg).status_code == 400
    _proof(client, cg, wo["id"], "new_part")
    _proof(client, cg, wo["id"], "old_part")
    assert client.post(f"{WO}/{wo['id']}/close", headers=auth(R.MECHANIC)).status_code == 403
    iv = client.post(f"{WO}/{wo['id']}/close", headers=cg).json()
    assert iv["status"] == "validated" and iv["expense_status"] == "reimbursable"
    assert all(s["done"] for s in iv["steps"]) and iv["flags"] == []
    # Clôturée : plus rien ne bouge.
    assert client.put(f"{WO}/{wo['id']}/lines", headers=cg, json={"lines": LINES}).status_code == 409
    assert client.put(f"{WO}/{wo['id']}", headers=cg, json={"title": "x"}).status_code == 409


def test_whatsapp_approval_needs_capture_and_name(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    wo = _wo(client, cg, vehicle)
    _lines(client, cg, wo["id"])
    r = client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "whatsapp", "approver_name": "M. Koffi"})
    assert r.status_code == 400 and "capture" in r.json()["detail"]
    _proof(client, cg, wo["id"], "approval_capture")
    assert client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "whatsapp"}).status_code == 400
    iv = client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "whatsapp", "approver_name": "M. Koffi"}).json()
    step = next(s for s in iv["steps"] if s["key"] == "approve")
    assert step["done"] and "WhatsApp" in step["detail"] and "capture jointe" in step["detail"]


def test_invoice_gap_over_5_percent_needs_new_approval(client, auth, vehicle):
    cg, sup = auth(R.STATION_MANAGER), auth(R.OPERATIONS_SUPERVISOR)
    wo = _wo(client, cg, vehicle)
    _lines(client, cg, wo["id"])
    client.post(f"{WO}/{wo['id']}/approve", headers=sup, json={"channel": "in_app"})
    client.post(f"{WO}/{wo['id']}/done", headers=cg)
    # La facture dépasse : 45 000 → 60 000 sur le disque (+15 000, soit 11,5 %).
    _lines(client, cg, wo["id"], [LINES[0] | {"invoice_amount": 60000}, *LINES[1:]])
    for kind in ("invoice", "new_part"):
        _proof(client, cg, wo["id"], kind)
    iv = client.post(f"{WO}/{wo['id']}/invoice", headers=cg, json={}).json()
    assert iv["gap"] == 15_000 and "needs_reapproval" in iv["flags"] and iv["expense_status"] == "frozen"
    assert iv["next_action"] == "approve"
    r = client.post(f"{WO}/{wo['id']}/close", headers=cg)
    assert r.status_code == 409 and "5 %" in r.json()["detail"]
    iv = client.post(f"{WO}/{wo['id']}/approve", headers=sup, json={"channel": "in_app"}).json()
    assert iv["approved_amount"] == 145_000 and "needs_reapproval" not in iv["flags"]
    assert client.post(f"{WO}/{wo['id']}/close", headers=cg).status_code == 200


def test_small_gap_is_tolerated(client, auth, vehicle):
    cg, sup = auth(R.STATION_MANAGER), auth(R.OPERATIONS_SUPERVISOR)
    wo = _wo(client, cg, vehicle)
    _lines(client, cg, wo["id"])
    client.post(f"{WO}/{wo['id']}/approve", headers=sup, json={"channel": "in_app"})
    client.post(f"{WO}/{wo['id']}/done", headers=cg)
    _lines(client, cg, wo["id"], [LINES[0] | {"invoice_amount": 50000}, *LINES[1:]])  # +5 000 = 3,8 %
    for kind in ("invoice", "new_part"):
        _proof(client, cg, wo["id"], kind)
    iv = client.post(f"{WO}/{wo['id']}/invoice", headers=cg, json={}).json()
    assert iv["gap"] == 5_000 and "needs_reapproval" not in iv["flags"]


def test_work_without_approval_is_not_reimbursed(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    wo = _wo(client, cg, vehicle)
    _lines(client, cg, wo["id"])
    iv = client.post(f"{WO}/{wo['id']}/done", headers=cg).json()
    assert "not_approved" in iv["flags"] and iv["expense_status"] == "not_reimbursed"
    assert iv["next_action"] == "invoice"


def test_missing_invoice_after_midnight_freezes_and_alerts(client, auth, db, vehicle, company):
    cg, sup = auth(R.STATION_MANAGER), auth(R.OPERATIONS_SUPERVISOR)
    wo = _wo(client, cg, vehicle)
    _lines(client, cg, wo["id"])
    client.post(f"{WO}/{wo['id']}/approve", headers=sup, json={"channel": "in_app"})
    client.post(f"{WO}/{wo['id']}/done", headers=cg)
    row = db.get(models.WorkOrder, wo["id"])
    row.completed_at = datetime.utcnow() - timedelta(days=1)
    db.commit()
    iv = client.get(f"{WO}/{wo['id']}/intervention", headers=cg).json()
    assert "invoice_missing" in iv["flags"] and iv["expense_status"] == "frozen"
    assert alert_svc.refresh_alerts(db, company.id) >= 1
    assert alert_svc.refresh_alerts(db, company.id) == 0  # pas de doublon
    alerts = db.query(models.Alert).filter(models.Alert.alert_type == models.AlertType.INVOICE_MISSING).all()
    assert len(alerts) == 1 and alerts[0].severity == "critical"
    # Facture déposée en retard : alerte classée, retard signalé.
    _proof(client, cg, wo["id"], "invoice")
    iv = client.post(f"{WO}/{wo['id']}/invoice", headers=cg, json={}).json()
    assert "invoice_late" in iv["flags"]
    db.expire_all()
    assert db.get(models.Alert, alerts[0].id).dismissed_at is not None


def test_impact_counts_repeated_component_and_flags_prices(client, auth, db, vehicle, company):
    cg = auth(R.STATION_MANAGER)
    # Historique importé : deux embrayages et un « disque d'embrayage » payé 40 000 et 42 000.
    for title, cost in (("disque d'embrayage", 40000), ("disque d'embrayage", 42000), ("vidange", 30000)):
        db.add(models.WorkOrder(company_id=company.id, vehicle_id=vehicle.id, title=title, total_cost=cost,
                                status=models.WorkOrderStatus.VALIDATED, completed_at=datetime.utcnow() - timedelta(days=30)))
    db.commit()
    wo = _wo(client, cg, vehicle)
    iv = _lines(client, cg, wo["id"], [LINES[0] | {"unit_price": 90000}, *LINES[1:]])
    impact = iv["impact"]
    assert impact["component"] == "Embrayage" and impact["component_count_12m"] == 3
    assert "contrôler la conduite" in impact["warning"]
    assert impact["total_cost"] == 40000 + 42000 + 30000 + 175000
    assert [f["label"] for f in iv["price_flags"]] == ["Disque d'embrayage"] and iv["price_flags"][0]["usual_price"] == 41000


def test_legacy_history_is_read_only_and_complete(client, auth, db, vehicle, company):
    db.add(models.WorkOrder(company_id=company.id, vehicle_id=vehicle.id, title="pneu", total_cost=50000,
                            status=models.WorkOrderStatus.VALIDATED))
    db.commit()
    wo_id = db.query(models.WorkOrder).first().id
    iv = client.get(f"{WO}/{wo_id}/intervention", headers=auth(R.ADMIN)).json()
    assert iv["legacy"] and iv["next_action"] is None and iv["expense_status"] == "reimbursable"
    assert client.put(f"{WO}/{wo_id}/lines", headers=auth(R.ADMIN), json={"lines": LINES}).status_code == 409


def test_status_validated_only_through_closing(client, auth, vehicle):
    cg = auth(R.STATION_MANAGER)
    wo = _wo(client, cg, vehicle)
    r = client.put(f"{WO}/{wo['id']}", headers=cg, json={"status": "validated"})
    assert r.status_code == 409


def test_other_company_cannot_see_intervention(client, auth, make_user, other_company, vehicle):
    wo = _wo(client, auth(R.STATION_MANAGER), vehicle)
    _, other = make_user(R.ADMIN, other_company)
    assert client.get(f"{WO}/{wo['id']}/intervention", headers=other).status_code == 404
    assert client.post(f"{WO}/{wo['id']}/done", headers=other).status_code == 404


def test_circuit_cannot_be_bypassed(client, auth, vehicle):
    cg, sup = auth(R.STATION_MANAGER), auth(R.OPERATIONS_SUPERVISOR)
    wo = _wo(client, cg, vehicle)
    _lines(client, cg, wo["id"])
    # Lecteur, conducteur, caisse : aucune écriture dans le circuit.
    for role in (R.READER, R.DRIVER, R.ACCOUNTANT):
        h = auth(role)
        assert client.put(f"{WO}/{wo['id']}/lines", headers=h, json={"lines": LINES}).status_code == 403
        assert client.post(f"{WO}/{wo['id']}/done", headers=h).status_code == 403
    # Le PUT générique ne touche ni l'avancement, ni les dates, ni le paiement, ni les montants.
    for body in ({"status": "done"}, {"completed_at": "2026-10-29T10:00:00"}, {"payment_reference": "X"}, {"amount_paid": "1"}):
        assert client.put(f"{WO}/{wo['id']}", headers=cg, json=body).status_code == 409, body
    # Le maintenancier n'enregistre pas de validation WhatsApp.
    _proof(client, auth(R.MECHANIC), wo["id"], "approval_capture")
    r = client.post(f"{WO}/{wo['id']}/approve", headers=auth(R.MECHANIC), json={"channel": "whatsapp", "approver_name": "X"})
    assert r.status_code == 403
    # Une nouvelle validation WhatsApp demande une nouvelle capture.
    client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "whatsapp", "approver_name": "M. Koffi"})
    client.post(f"{WO}/{wo['id']}/done", headers=cg)
    _lines(client, cg, wo["id"], [LINES[0] | {"invoice_amount": 90000}, *LINES[1:]])
    r = client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "whatsapp", "approver_name": "M. Koffi"})
    assert r.status_code == 400 and "capture" in r.json()["detail"]
    _proof(client, cg, wo["id"], "approval_capture")
    assert client.post(f"{WO}/{wo['id']}/approve", headers=cg, json={"channel": "whatsapp", "approver_name": "M. Koffi"}).status_code == 200
    # Clôturée : suppression refusée, preuves conservées.
    for kind in ("invoice", "new_part"):
        _proof(client, cg, wo["id"], kind)
    client.post(f"{WO}/{wo['id']}/invoice", headers=cg, json={})
    assert client.post(f"{WO}/{wo['id']}/close", headers=cg).status_code == 200
    assert client.delete(f"{WO}/{wo['id']}", headers=sup).status_code == 409
