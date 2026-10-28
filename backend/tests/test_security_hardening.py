"""Correctifs issus de la revue de sécurité de la phase 0."""
import io

import pytest
from fastapi import UploadFile

from app import crud, models
from app.core.config import get_settings
from app.utils import uploads

R = models.Role
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


def _jpeg(name="p.jpg"):
    return UploadFile(filename=name, file=io.BytesIO(JPEG))


# H2 : un fichier d'une autre société ne peut pas être supprimé via photo_url.
def test_delete_upload_is_scoped_to_company():
    url = uploads.save_image(_jpeg(), 42, "drivers", 7)
    path = get_settings().UPLOAD_DIR / url.removeprefix("/uploads/")
    uploads.delete_upload(url, company_id=1)
    assert path.exists()
    uploads.delete_upload(url, company_id=42)
    assert not path.exists()


def test_vehicle_photo_url_cannot_be_set_by_client(client, auth, vehicle):
    admin = auth(R.ADMIN)
    r = client.put(f"/api/v1/vehicles/{vehicle.id}", headers=admin, json={"photo_url": "/uploads/42/drivers/7/x.pdf"})
    assert r.status_code == 200
    assert r.json()["photo_url"] is None


# H1 : le compteur d'échecs est incrémenté en base de façon atomique, avant bcrypt.
def test_pin_failure_counter_is_atomic(client, auth, db):
    admin = auth(R.ADMIN)
    d = client.post("/api/v1/drivers", headers=admin, json={"first_name": "A", "last_name": "B"}).json()
    client.put(f"/api/v1/drivers/{d['id']}/pin", headers=admin, json={"pin": "4821"})
    driver = db.get(models.Driver, d["id"])
    # Une lecture périmée (attempts=0 en mémoire) ne doit pas écraser le compteur réel.
    db.query(models.Driver).filter(models.Driver.id == driver.id).update({"pin_failed_attempts": 3})
    db.commit()
    stale = models.Driver(id=driver.id, pin_hash=driver.pin_hash, pin_failed_attempts=0)
    assert crud.register_pin_attempt(db, stale.id) == 4


# M2 : seuls les rôles qui font signer peuvent vérifier un PIN.
@pytest.mark.parametrize("role,expected", [(R.READER, 403), (R.ACCOUNTANT, 403), (R.STATION_MANAGER, 200), (R.OPERATIONS_SUPERVISOR, 200), (R.MANAGER, 200)])
def test_verify_pin_rights(client, auth, role, expected):
    admin = auth(R.ADMIN)
    d = client.post("/api/v1/drivers", headers=admin, json={"first_name": "A", "last_name": "B"}).json()
    client.put(f"/api/v1/drivers/{d['id']}/pin", headers=admin, json={"pin": "4821"})
    assert client.post(f"/api/v1/drivers/{d['id']}/verify-pin", headers=auth(role), json={"pin": "4821"}).status_code == expected


# L4 : le PIN n'accepte que les chiffres 0-9.
def test_pin_rejects_unicode_digits(client, auth):
    admin = auth(R.ADMIN)
    d = client.post("/api/v1/drivers", headers=admin, json={"first_name": "A", "last_name": "B"}).json()
    assert client.put(f"/api/v1/drivers/{d['id']}/pin", headers=admin, json={"pin": "١٢٣٤"}).status_code == 422


# L1 : un saut de ligne final dans un segment de chemin est refusé.
def test_path_part_with_trailing_newline_is_rejected():
    with pytest.raises(ValueError):
        uploads.save_image(_jpeg(), 1, "photos\n")


# L2 : nom ou code de gare à null refusés (pas d'erreur 500).
@pytest.mark.parametrize("payload", [{"name": None}, {"code": None}])
def test_station_null_fields_rejected(client, auth, payload):
    admin = auth(R.ADMIN)
    st = client.post("/api/v1/stations", headers=admin, json={"name": "Gare d'Abobo", "code": "ABO"}).json()
    assert client.put(f"/api/v1/stations/{st['id']}", headers=admin, json=payload).status_code == 422


# M4 : l'inscription publique crée toujours un admin, sans gare.
def test_register_forces_admin_role(client):
    body = {
        "payload": {"email": "boss@itts-demo.com", "password": "12345678", "role": "super_admin", "station_id": 999},
        "company_in": {"name": "Nouvelle", "slug": "nouvelle"},
    }
    r = client.post("/api/v1/auth/register", json=body)
    assert r.status_code == 200, r.text
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["role"] == "admin" and me["station_id"] is None


# M5 : un admin ne peut pas modifier un compte super admin.
def test_admin_cannot_modify_super_admin(client, auth, make_user, company):
    sa, _ = make_user(R.SUPER_ADMIN, company)
    r = client.put(f"/api/v1/auth/users/{sa.id}", headers=auth(R.ADMIN), json={"is_active": False})
    assert r.status_code == 403


# Revue de code : null explicite sur un champ obligatoire -> 422, pas 500.
def test_driver_staff_type_null_rejected(client, auth):
    admin = auth(R.ADMIN)
    d = client.post("/api/v1/drivers", headers=admin, json={"first_name": "A", "last_name": "B"}).json()
    assert client.put(f"/api/v1/drivers/{d['id']}", headers=admin, json={"staff_type": None}).status_code == 422


def test_station_blank_code_rejected(client, auth):
    assert client.post("/api/v1/stations", headers=auth(R.ADMIN), json={"name": "Gare", "code": "   "}).status_code == 422


# Revue de code : un lot de documents est validé entièrement avant tout enregistrement.
def test_multi_document_upload_is_all_or_nothing(client, auth, vehicle):
    admin = auth(R.ADMIN)
    files = [("files", ("a.pdf", b"%PDF-1.4 a", "application/pdf")), ("files", ("b.html", b"<b>x</b>", "text/html"))]
    r = client.post(f"/api/v1/vehicles/{vehicle.id}/documents/upload", headers=admin, data={"document_type": "insurance"}, files=files)
    assert r.status_code == 400
    assert client.get(f"/api/v1/vehicles/{vehicle.id}/documents", headers=admin).json() == []
