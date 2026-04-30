from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth.rbac import CurrentUser, require_scopes
from app.config import settings
from app.core.exceptions import ValidationFailed
from app.services.openai_client import embed_texts

router = APIRouter()


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    model: str
    tokens: int


@router.post("", response_model=EmbedResponse)
async def embed(
    body: EmbedRequest,
    user: CurrentUser = Depends(require_scopes("aiml:write")),
) -> EmbedResponse:
    if len(body.texts) > settings.embed_max_items:
        raise ValidationFailed(
            f"texts exceeds max {settings.embed_max_items} items"
        )
    for idx, text in enumerate(body.texts):
        if len(text) > settings.embed_max_chars:
            raise ValidationFailed(
                f"texts[{idx}] exceeds max {settings.embed_max_chars} chars"
            )

    result = await embed_texts(body.texts)
    return EmbedResponse(
        vectors=result.vectors,
        model=result.model,
        tokens=result.tokens,
    )
