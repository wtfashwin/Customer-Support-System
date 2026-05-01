from fastapi import APIRouter

from app.api.v1 import (
    agents,
    audit,
    conversations,
    document,
    embed,
    feedback,
    rag,
    search,
    ws,
)

api_router = APIRouter(prefix="/v1")
api_router.include_router(embed.router, prefix="/embed", tags=["embed"])
api_router.include_router(rag.router, prefix="/rag", tags=["rag"])
api_router.include_router(document.router, prefix="/document", tags=["document"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(ws.router, prefix="/ws", tags=["ws"])
