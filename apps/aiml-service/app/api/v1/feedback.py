from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.rbac import CurrentUser, require_scopes
from app.db.models import Feedback
from app.db.session import get_db

router = APIRouter()


class FeedbackRequest(BaseModel):
    messageId: str = Field(..., min_length=1)
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


class FeedbackResponse(BaseModel):
    id: str
    createdAt: datetime


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    body: FeedbackRequest,
    user: CurrentUser = Depends(require_scopes("aiml:write")),
    db: AsyncSession = Depends(get_db),
) -> FeedbackResponse:
    row = Feedback(
        message_id=body.messageId,
        user_id=user.sub,
        rating=body.rating,
        comment=body.comment,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return FeedbackResponse(id=str(row.id), createdAt=row.created_at)
