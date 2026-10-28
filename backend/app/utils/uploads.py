"""Stockage des fichiers téléversés sous UPLOAD_DIR/<company_id>/<sous-dossiers>/.

Les fichiers sont servis tels quels sous /uploads, sur le même domaine que l'interface :
on n'accepte donc que des images et des documents dont la signature correspond à
l'extension (jamais de HTML, SVG ou exécutable).
"""
import os
import re
import unicodedata
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import get_settings

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

_SAFE_PART = re.compile(r"[A-Za-z0-9_-]+")
_IMAGE_EXTENSIONS = {".jpg", ".png", ".webp"}
# Signature attendue en tête de fichier pour chaque extension de document autorisée.
_DOCUMENT_SIGNATURES = {
    ".pdf": (b"%PDF-",),
    ".docx": (b"PK\x03\x04",),
    ".xlsx": (b"PK\x03\x04",),
    ".doc": (b"\xd0\xcf\x11\xe0",),
    ".xls": (b"\xd0\xcf\x11\xe0",),
}
DOCUMENT_EXTENSIONS = set(_DOCUMENT_SIGNATURES) | _IMAGE_EXTENSIONS | {".jpeg"}


def _image_extension(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


def _slug(value: str, fallback: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_")[:40]
    return value or fallback


def _relative_dir(company_id: int, parts: tuple[str | int, ...]) -> list[str]:
    clean = [str(company_id)]
    for part in parts:
        part = str(part)
        if not _SAFE_PART.fullmatch(part):
            raise ValueError(f"Segment de chemin refusé : {part!r}")
        clean.append(part)
    return clean


def _read_limited(file: UploadFile, max_bytes: int) -> bytes:
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (max {max_bytes // (1024 * 1024)} Mo)")
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide")
    return data


def _write(rel: list[str], prefix: str, ext: str, data: bytes) -> str:
    directory = get_settings().UPLOAD_DIR.joinpath(*rel)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}_{os.urandom(6).hex()}{ext}"
    (directory / name).write_bytes(data)
    return f"/uploads/{'/'.join(rel)}/{name}"


def _check_image(file: UploadFile, max_bytes: int) -> tuple[bytes, str]:
    data = _read_limited(file, max_bytes)
    ext = _image_extension(data[:16])
    if ext is None:
        raise HTTPException(status_code=400, detail="Le fichier n'est pas une image JPEG, PNG ou WebP")
    return data, ext


def _check_document(file: UploadFile, max_bytes: int) -> tuple[bytes, str]:
    ext = Path(file.filename or "").suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    if ext not in DOCUMENT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Type de fichier non autorisé (PDF, image, Word ou Excel)")
    data = _read_limited(file, max_bytes)
    if ext in _IMAGE_EXTENSIONS:
        ok = _image_extension(data[:16]) is not None
    else:
        ok = data.startswith(_DOCUMENT_SIGNATURES[ext])
    if not ok:
        raise HTTPException(status_code=400, detail=f"Le contenu de « {file.filename} » ne correspond pas à son type")
    return data, ext


def save_image(
    file: UploadFile, company_id: int, *parts: str | int, prefix: str = "photo", max_bytes: int = MAX_IMAGE_BYTES
) -> str:
    """Enregistre une image JPEG, PNG ou WebP (type détecté sur le contenu) et renvoie son URL /uploads/…"""
    rel = _relative_dir(company_id, parts)
    data, ext = _check_image(file, max_bytes)
    return _write(rel, _slug(prefix, "photo"), ext, data)


def save_document(
    file: UploadFile, company_id: int, *parts: str | int, prefix: str | None = None, max_bytes: int = MAX_DOCUMENT_BYTES
) -> str:
    """Enregistre un justificatif (PDF, image, Word, Excel) et renvoie son URL /uploads/…"""
    return save_documents([(file, prefix)], company_id, *parts, max_bytes=max_bytes)[0]


def save_documents(
    files: list[tuple[UploadFile, str | None]], company_id: int, *parts: str | int, max_bytes: int = MAX_DOCUMENT_BYTES
) -> list[str]:
    """Valide TOUS les fichiers avant d'en écrire un seul (tout ou rien). Renvoie les URL dans l'ordre."""
    rel = _relative_dir(company_id, parts)
    checked = []
    for file, prefix in files:
        data, ext = _check_document(file, max_bytes)
        stem = prefix if prefix is not None else Path(file.filename or "").stem
        checked.append((_slug(stem, "doc"), ext, data))
    return [_write(rel, stem, ext, data) for stem, ext, data in checked]


def delete_upload(url: str | None, company_id: int) -> None:
    """Supprime le fichier d'une URL /uploads/<company_id>/… — jamais en dehors du dossier de la société."""
    if not url or not url.startswith(f"/uploads/{company_id}/"):
        return
    company_root = (get_settings().UPLOAD_DIR / str(company_id)).resolve()
    path = (get_settings().UPLOAD_DIR / url.removeprefix("/uploads/")).resolve()
    if company_root in path.parents and path.is_file():
        path.unlink()
