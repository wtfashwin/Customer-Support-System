import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth.jwt import extract_scopes, verify_token
from app.core.exceptions import MissingScope, Unauthenticated
from app.core.logging import get_logger

router = APIRouter()
log = get_logger(__name__)


class HandoffSession:
    """Bidirectional message relay between an authed agent and a customer.
    For now, both sides are the same WS connection; the relay keeps a queue
    so out-of-band server-side events (typing indicators, presence) can be
    pushed without blocking the inbound read loop."""

    def __init__(self, ws: WebSocket, sub: str) -> None:
        self.ws = ws
        self.sub = sub
        self.queue: asyncio.Queue[dict] = asyncio.Queue()


async def _auth_handshake(ws: WebSocket) -> str:
    raw = await asyncio.wait_for(ws.receive_text(), timeout=5.0)
    payload = json.loads(raw)
    if payload.get("type") != "auth":
        raise Unauthenticated("First frame must be type=auth")
    token = payload.get("token", "")
    if token.lower().startswith("bearer "):
        token = token.split(None, 1)[1]
    claims = await verify_token(token)
    scopes = extract_scopes(claims)
    if "aiml:read" not in scopes:
        raise MissingScope("Missing aiml:read")
    return str(claims.get("sub", ""))


@router.websocket("/handoff")
async def handoff(ws: WebSocket) -> None:
    await ws.accept()
    try:
        sub = await _auth_handshake(ws)
    except (Unauthenticated, asyncio.TimeoutError, json.JSONDecodeError, KeyError):
        await ws.close(code=4401)
        return
    except MissingScope:
        await ws.close(code=4403)
        return

    log.info("ws_authed", sub=sub)
    session = HandoffSession(ws, sub)

    async def reader() -> None:
        try:
            while True:
                msg = await ws.receive_text()
                try:
                    payload = json.loads(msg)
                except json.JSONDecodeError:
                    continue
                await session.queue.put(payload)
        except WebSocketDisconnect:
            await session.queue.put({"type": "_disconnect"})

    async def writer() -> None:
        while True:
            payload = await session.queue.get()
            if payload.get("type") == "_disconnect":
                return
            # echo + tag with sender for the contract relay shape
            await ws.send_text(json.dumps(payload))

    reader_task = asyncio.create_task(reader())
    writer_task = asyncio.create_task(writer())
    try:
        await asyncio.gather(reader_task, writer_task)
    except Exception as exc:
        log.warning("ws_error", error=str(exc))
        await ws.close(code=4500)
    finally:
        for t in (reader_task, writer_task):
            if not t.done():
                t.cancel()
