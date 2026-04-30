from app.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)


def init_telemetry(app) -> None:  # pragma: no cover - thin glue
    if not settings.otel_exporter_otlp_endpoint:
        log.info("otel_disabled", reason="OTEL_EXPORTER_OTLP_ENDPOINT not set")
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource.create({"service.name": "aiml-service"}))
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint))
        )
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)
        HTTPXClientInstrumentor().instrument()
        log.info("otel_initialized", endpoint=settings.otel_exporter_otlp_endpoint)
    except Exception as exc:
        log.warning("otel_init_failed", error=str(exc))
