"""Stockage des fichiers téléversés : types autorisés, taille, chemins sûrs."""
import io

import pytest
from fastapi import HTTPException, UploadFile

from app import models
from app.core.config import get_settings
from app.utils import uploads

R = models.Role
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"0" * 100


def _file(name: str, data: bytes, ctype: str = "application/octet-stream") -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(data), headers={"content-type": ctype})


@pytest.mark.parametrize("data,ext", [(JPEG, ".jpg"), (PNG, ".png"), (WEBP, ".webp")])
def test_save_image_detects_real_type(data, ext):
    url = uploads.save_image(_file("photo.bin", data), 7, "inspections", 3, prefix="face_avant")
    assert url.startswith("/uploads/7/inspections/3/face_avant_") and url.endswith(ext)
    assert (get_settings().UPLOAD_DIR / url.removeprefix("/uploads/")).read_bytes() == data


def test_save_image_rejects_non_image():
    with pytest.raises(HTTPException) as exc:
        uploads.save_image(_file("x.jpg", b"<html><script>alert(1)</script>", "image/jpeg"), 1, "photos")
    assert exc.value.status_code == 400


def test_save_image_rejects_oversize():
    with pytest.raises(HTTPException) as exc:
        uploads.save_image(_file("x.jpg", JPEG + b"0" * 64), 1, "photos", max_bytes=50)
    assert exc.value.status_code == 413


@pytest.mark.parametrize("part", ["..", "../etc", "a/b", "", "é"])
def test_unsafe_path_parts_are_rejected(part):
    with pytest.raises(ValueError):
        uploads.save_image(_file("x.jpg", JPEG), 1, part)


@pytest.mark.parametrize("name,ok", [("carte.pdf", True), ("scan.PNG", True), ("devis.xlsx", True), ("page.html", False), ("logo.svg", False), ("run.exe", False), ("noext", False)])
def test_save_document_extension_allowlist(name, ok):
    lower = name.lower()
    data = PNG if lower.endswith(".png") else b"PK office" if lower.endswith("x") else b"%PDF-1.4 test"
    if ok:
        assert uploads.save_document(_file(name, data), 1, "docs").startswith("/uploads/1/docs/")
    else:
        with pytest.raises(HTTPException):
            uploads.save_document(_file(name, data), 1, "docs")


def test_vehicle_document_upload_rejects_html(client, auth, vehicle):
    r = client.post(
        f"/api/v1/vehicles/{vehicle.id}/documents/upload",
        headers=auth(R.ADMIN),
        data={"document_type": "insurance", "name": "Assurance"},
        files={"files": ("assurance.html", b"<script>alert(1)</script>", "text/html")},
    )
    assert r.status_code == 400


def test_vehicle_photo_must_be_an_image(client, auth, vehicle):
    admin = auth(R.ADMIN)
    bad = client.post(f"/api/v1/vehicles/{vehicle.id}/photo", headers=admin, files={"file": ("car.jpg", b"not an image", "image/jpeg")})
    assert bad.status_code == 400
    ok = client.post(f"/api/v1/vehicles/{vehicle.id}/photo", headers=admin, files={"file": ("car.jpg", JPEG, "image/jpeg")})
    assert ok.status_code == 200 and ok.json()["photo_url"].endswith(".jpg")


def test_document_content_must_match_extension():
    with pytest.raises(HTTPException):
        uploads.save_document(_file("facture.pdf", b"<html><script>alert(1)</script>"), 1, "docs")
