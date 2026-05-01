"""Azure Document Intelligence wrapper (CP8)."""

from __future__ import annotations

import asyncio
from typing import Any

from app.config import settings
from app.core.exceptions import NotConfigured, UpstreamError


def _client():
    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.core.credentials import AzureKeyCredential

    if not settings.azure_di_endpoint or not settings.azure_di_key:
        raise NotConfigured("Azure DI credentials missing")

    return DocumentIntelligenceClient(
        endpoint=settings.azure_di_endpoint,
        credential=AzureKeyCredential(settings.azure_di_key),
    )


def _to_dict(result: Any) -> dict[str, Any]:
    pages = []
    for page in getattr(result, "pages", []) or []:
        pages.append(
            {
                "page": getattr(page, "page_number", 0),
                "width": getattr(page, "width", 0),
                "height": getattr(page, "height", 0),
                "text": " ".join((getattr(line, "content", "") or "") for line in getattr(page, "lines", []) or []),
            }
        )

    tables = []
    for tbl in getattr(result, "tables", []) or []:
        rows: list[list[str]] = []
        # Group cells by row index
        by_row: dict[int, dict[int, str]] = {}
        for cell in getattr(tbl, "cells", []) or []:
            by_row.setdefault(cell.row_index, {})[cell.column_index] = cell.content or ""
        for ri in sorted(by_row):
            cols = by_row[ri]
            rows.append([cols.get(ci, "") for ci in sorted(cols)])
        tables.append(
            {
                "page": getattr(tbl, "bounding_regions", [{}])[0].page_number if getattr(tbl, "bounding_regions", None) else None,
                "rows": rows,
            }
        )

    kvs = []
    for kv in getattr(result, "key_value_pairs", []) or []:
        if not kv.key:
            continue
        kvs.append(
            {
                "key": kv.key.content if kv.key else "",
                "value": kv.value.content if kv.value else "",
                "confidence": getattr(kv, "confidence", 0.0),
            }
        )

    return {
        "text": getattr(result, "content", "") or "",
        "pages": pages,
        "tables": tables,
        "key_value_pairs": kvs,
        "model": "prebuilt-layout",
    }


async def analyze_document(data: bytes) -> dict[str, Any]:
    def _run() -> dict[str, Any]:
        try:
            client = _client()
            poller = client.begin_analyze_document(
                "prebuilt-layout",
                analyze_request=data,
                content_type="application/octet-stream",
            )
            result = poller.result()
            return _to_dict(result)
        except NotConfigured:
            raise
        except Exception as exc:
            raise UpstreamError(f"Azure DI failed: {exc}") from exc

    return await asyncio.to_thread(_run)
