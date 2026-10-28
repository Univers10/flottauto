from functools import lru_cache
from pathlib import Path

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

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
