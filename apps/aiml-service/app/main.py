from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.v1 import api_router
from app.api.v1.health import router as health_router
from app.config import settings
from app.core.exceptions import AIMLError
from app.core.logging import configure_logging, get_logger, request_id_ctx
from app.core.middleware import AuditMiddleware, RequestIdMiddleware
from app.core.telemetry import init_telemetry
from app.db.session import dispose_engine
from app.services.cache import close_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log = get_logger("aiml.startup")
    log.info("startup", environment=settings.environment, port=settings.aiml_port)
    init_telemetry(app)
    try:
        yield
    finally:
        log.info("shutdown")
        await dispose_engine()
        await close_redis()


def _envelope(code: str, message: str, status: int, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "code": code,
                "message": message,
                "requestId": request_id,
            }
        },
    )


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="AIML Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-request-id"],
    )
    app.add_middleware(AuditMiddleware)
    app.add_middleware(RequestIdMiddleware)

    app.include_router(health_router)
    app.include_router(api_router)

    @app.exception_handler(AIMLError)
    async def _aiml_handler(request: Request, exc: AIMLError) -> JSONResponse:
        rid = request.headers.get("x-request-id") or request_id_ctx.get("")
        return _envelope(exc.code, exc.message, exc.status_code, rid)

    @app.exception_handler(ValidationError)
    async def _validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
        rid = request.headers.get("x-request-id") or request_id_ctx.get("")
        return _envelope("validation_failed", str(exc), 400, rid)

    @app.exception_handler(Exception)
    async def _fallback_handler(request: Request, exc: Exception) -> JSONResponse:
        rid = request.headers.get("x-request-id") or request_id_ctx.get("")
        get_logger("aiml.error").error("unhandled", error=str(exc), error_type=exc.__class__.__name__)
        return _envelope("internal_error", "Internal server error", 500, rid)

    return app


app = create_app()
