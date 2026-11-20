"""Plusieurs rôles par utilisateur : ses droits sont l'union de ses rôles."""
from app import models

R = models.Role


def test_admin_gives_extra_roles_and_rights_are_the_union(client, auth, make_user, company):
    admin = auth(R.ADMIN)
    r = client.post(
        "/api/v1/auth/users",
        headers=admin,
        json={"email": "awa@itts-demo.com", "password": "Motdepasse-2026", "role": "mechanic", "extra_roles": ["accountant"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["roles"] == ["mechanic", "accountant"]

    login = client.post("/api/v1/auth/login", data={"username": "awa@itts-demo.com", "password": "Motdepasse-2026"}).json()
    h = {"Authorization": f"Bearer {login['access_token']}"}
    # Mechanic alone has no access to the fuel module; as accountant she has.
    assert client.get("/api/v1/fuel", headers=h).status_code == 200
    # Reports: denied to the mechanic, allowed to the accountant.
    assert client.get("/api/v1/reports/summary", headers=h).status_code == 200
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["role"] == "mechanic" and me["extra_roles"] == ["accountant"]


def test_extra_roles_can_be_changed_but_never_super_admin(client, auth, make_user, company):
    admin = auth(R.ADMIN)
    user, h = make_user(R.READER, company, email="lecteur@itts-demo.com")
    # Reader alone: cannot write a fine.
    assert client.post("/api/v1/fines/repayments", headers=h, json={"driver_id": 1, "amount": 1, "repayment_date": "2026-11-10"}).status_code == 403

    r = client.put(f"/api/v1/auth/users/{user.id}", headers=admin, json={"extra_roles": ["manager", "manager", "reader"]})
    assert r.status_code == 200, r.text
    # Duplicates and the main role are dropped.
    assert r.json()["extra_roles"] == ["manager"]
    # Now a manager too: the write goes through (404: no such driver, not 403).
    assert client.post("/api/v1/fines/repayments", headers=h, json={"driver_id": 999, "amount": 1, "repayment_date": "2026-11-10"}).status_code == 404

    bad = client.put(f"/api/v1/auth/users/{user.id}", headers=admin, json={"extra_roles": ["super_admin"]})
    assert bad.status_code == 422


def test_nobody_changes_his_own_roles(client, auth, make_user, company):
    admin_user, h = make_user(R.ADMIN, company, email="chef@itts-demo.com")
    r = client.put(f"/api/v1/auth/users/{admin_user.id}", headers=h, json={"extra_roles": ["accountant"]})
    assert r.status_code == 400
