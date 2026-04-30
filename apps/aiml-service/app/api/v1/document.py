from fastapi import APIRouter, Depends, File, UploadFile

from app.auth.rbac import CurrentUser, require_scopes
from app.config import settings
from app.core.exceptions import (
    NotConfigured,
    PayloadTooLarge,
    UnsupportedMediaType,
)

router = APIRouter()

ALLOWED_CT = {"application/pdf", "image/png", "image/jpeg", "image/tiff"}


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_scopes("aiml:write")),
):
    if not settings.azure_di_endpoint or not settings.azure_di_key:
        raise NotConfigured("Azure Document Intelligence is not configured")

    if file.content_type not in ALLOWED_CT:
        raise UnsupportedMediaType(
            f"content_type {file.content_type!r} not allowed"
        )

    data = await file.read()
    if len(data) > settings.document_max_bytes:
        raise PayloadTooLarge(
            f"file exceeds {settings.document_max_bytes} bytes"
        )

    from app.services.azure_di import analyze_document

    return await analyze_document(data)
