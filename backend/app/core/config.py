from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    UPLOAD_DIR: Path = BACKEND_DIR / "uploads"
    # Fichiers sensibles (photos d'états des lieux) : jamais servis en statique, seulement par route authentifiée.
    PRIVATE_UPLOAD_DIR: Path = BACKEND_DIR / "private_uploads"
    # Adresse publique de l'interface : le QR du bon de sortie y renvoie pour vérification.
    PUBLIC_APP_URL: str = "http://localhost:3000"
    # Pont avec ITTS Gestion (docs/integration-itts.md) : désactivé tant que ces deux valeurs manquent.
    ITTS_SHARED_SECRET: str | None = None
    ITTS_COMPANY_ID: int | None = None

    @field_validator("ITTS_SHARED_SECRET")
    @classmethod
    def _strong_itts_secret(cls, value: str | None) -> str | None:
        value = (value or "").strip() or None
        if value is not None and len(value) < 32:
            raise ValueError("ITTS_SHARED_SECRET doit contenir au moins 32 caractères")
        return value

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
