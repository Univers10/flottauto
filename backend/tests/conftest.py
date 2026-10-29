"""Fixtures communes : base SQLite temporaire, client HTTP, sociétés et utilisateurs par rôle.

Les variables d'environnement sont posées AVANT l'import de l'app, car la config et le moteur
SQLAlchemy sont construits à l'import.
"""
import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="flottauto-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key-" + "x" * 48
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["PRIVATE_UPLOAD_DIR"] = str(_TMP / "private_uploads")
os.environ["ITTS_SHARED_SECRET"] = "itts-test-secret-0123456789abcdef0123"
os.environ["ITTS_COMPANY_ID"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import crud, models, schemas  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "password123"


@pytest.fixture(autouse=True)
def _reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _make_company(db, slug: str) -> models.Company:
    return crud.create_company(db, schemas.CompanyCreate(name=f"Société {slug}", slug=slug))


@pytest.fixture
def company(db) -> models.Company:
    return _make_company(db, "itts")


@pytest.fixture
def other_company(db) -> models.Company:
    return _make_company(db, "autre")


@pytest.fixture
def make_user(db):
    """Crée un utilisateur et renvoie (user, en-têtes d'auth)."""

    def _make(role: models.Role, company: models.Company, email: str | None = None):
        user = crud.create_user(
            db,
            schemas.UserCreate(email=email or f"{role.value}-{company.slug}@itts-demo.com", password=PASSWORD, role=role),
            company_id=company.id,
        )
        token = create_access_token({"sub": str(user.id)})
        return user, {"Authorization": f"Bearer {token}"}

    return _make


@pytest.fixture
def auth(make_user, company):
    """En-têtes d'auth par rôle dans la société principale : auth(models.Role.ADMIN)."""
    cache: dict = {}

    def _auth(role: models.Role):
        if role not in cache:
            cache[role] = make_user(role, company)[1]
        return cache[role]

    return _auth


@pytest.fixture
def vehicle(db, company) -> models.Vehicle:
    return crud.create_vehicle(db, schemas.VehicleCreate(registration="AB-586-CI", brand="Yutong", model="ZK6122"), company_id=company.id)


@pytest.fixture
def crew(client, auth):
    admin = auth(models.Role.ADMIN)
    driver = client.post("/api/v1/drivers", headers=admin, json={"first_name": "Seidou", "last_name": "Synayoko"}).json()
    conveyor = client.post("/api/v1/drivers", headers=admin, json={"first_name": "Awa", "last_name": "Koné", "staff_type": "conveyor"}).json()
    client.put(f"/api/v1/drivers/{driver['id']}/pin", headers=admin, json={"pin": "1111"})
    client.put(f"/api/v1/drivers/{conveyor['id']}/pin", headers=admin, json={"pin": "2222"})
    return {"driver": driver, "conveyor": conveyor}


@pytest.fixture
def cg(auth):
    return auth(models.Role.STATION_MANAGER)
