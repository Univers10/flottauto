"""Comptes maintenancier : création par l'admin et accès limité à la maintenance."""
from app import models

R = models.Role


def _login(client, email, password):
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_only_admin_creates_accounts(client, auth):
    body = {"email": "x@itts-demo.com", "password": "12345678", "role": "mechanic"}
    assert client.post("/api/v1/auth/users", headers=auth(R.MANAGER), json=body).status_code == 403
    assert client.post("/api/v1/auth/users", headers=auth(R.ADMIN), json=body).status_code == 201


def test_admin_cannot_create_super_admin(client, auth):
    body = {"email": "s@itts-demo.com", "password": "12345678", "role": "super_admin"}
    assert client.post("/api/v1/auth/users", headers=auth(R.ADMIN), json=body).status_code == 403


def test_users_filter_by_role(client, auth):
    client.post("/api/v1/auth/users", headers=auth(R.ADMIN), json={"email": "m@itts-demo.com", "password": "12345678", "role": "mechanic"})
    r = client.get("/api/v1/auth/users?role=mechanic", headers=auth(R.ADMIN))
    assert [u["email"] for u in r.json()] == ["m@itts-demo.com"]


def test_mechanic_access_matrix(client, auth, vehicle):
    meca = auth(R.MECHANIC)
    assert client.get("/api/v1/vehicles", headers=meca).status_code == 200
    assert client.post("/api/v1/vehicles", headers=meca, json={"registration": "ZZ", "brand": "a", "model": "b"}).status_code == 403
    for path in ["/api/v1/drivers", "/api/v1/dashboard/stats", "/api/v1/fuel", "/api/v1/tolls", "/api/v1/auth/users"]:
        assert client.get(path, headers=meca).status_code == 403, path
    assert client.get("/api/v1/alerts", headers=meca).status_code == 200


def test_mechanic_work_order_flow(client, auth, vehicle):
    meca = auth(R.MECHANIC)
    r = client.post("/api/v1/maintenance/work-orders", headers=meca, json={"vehicle_id": vehicle.id, "title": "Vidange"})
    assert r.status_code == 201
    wo = r.json()
    assert wo["created_by"]["email"].startswith("mechanic")
    assert client.put(f"/api/v1/maintenance/work-orders/{wo['id']}", headers=meca, json={"status": "in_progress", "total_cost": "120.50"}).status_code == 200
    photo = client.post(
        f"/api/v1/maintenance/work-orders/{wo['id']}/photos",
        headers=meca,
        files={"file": ("p.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg")},
    )
    assert photo.status_code == 201
    assert client.delete(f"/api/v1/maintenance/work-orders/{wo['id']}", headers=meca).status_code == 403
    # L'admin peut supprimer un OT qui a des photos (cascade).
    assert client.delete(f"/api/v1/maintenance/work-orders/{wo['id']}", headers=auth(R.ADMIN)).status_code == 204


def test_deactivated_account_is_rejected(client, auth):
    admin = auth(R.ADMIN)
    m = client.post("/api/v1/auth/users", headers=admin, json={"email": "d@itts-demo.com", "password": "12345678", "role": "mechanic"}).json()
    meca = _login(client, "d@itts-demo.com", "12345678")
    assert client.put(f"/api/v1/auth/users/{m['id']}", headers=admin, json={"is_active": False}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=meca).status_code == 401


def test_admin_cannot_deactivate_self(client, auth):
    admin = auth(R.ADMIN)
    me = client.get("/api/v1/auth/me", headers=admin).json()
    assert client.put(f"/api/v1/auth/users/{me['id']}", headers=admin, json={"is_active": False}).status_code == 400
