from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from jose import jwt, JWTError
import httpx
import json
import uuid
import time
import asyncio

from app.database import get_db, AsyncSessionLocal
from app.models import User, Chat, Message
from app.config import settings
from app.redis_client import is_token_revoked, check_rate_limit, get_window_usage, record_window_usage
from app.rabbitmq_client import publish_chat_title_job
from app.metrics import GENERATION_REQUESTS, GENERATION_DURATION, GENERATION_TOKENS, GENERATION_ACTIVE

router = APIRouter(prefix="/api/v1", tags=["chat"])

# Stacked usage windows, Claude-style: each enforced independently,
# whichever is hit first blocks the request.
USAGE_WINDOWS = [
    {"name": "5h", "seconds": 5 * 3600, "limit": settings.TOKEN_LIMIT_5H},
    {"name": "daily", "seconds": 24 * 3600, "limit": settings.TOKEN_LIMIT_DAILY},
    {"name": "weekly", "seconds": 7 * 24 * 3600, "limit": settings.TOKEN_LIMIT_WEEKLY},
]

def usage_key(window_name: str, user_id) -> str:
    return f"agent:usage:{window_name}:{user_id}"

# ============================================
# Pydantic Models
# ============================================

class GenerateRequest(BaseModel):
    prompt: str
    model: str
    chat_id: Optional[str] = None

class MessageEdit(BaseModel):
    content: str

# ============================================
# Auth Helper
# ============================================

async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Resolve the current user from the JWT bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authentication token")

    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    jti = payload.get("jti")
    if jti and await is_token_revoked(jti):
        raise HTTPException(401, "Token has been revoked")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "User not found")

    return user

def check_api_key(api_key: str):
    if api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")

# ============================================
# Endpoints
# ============================================

@router.get("/chats")
async def list_chats(
    api_key: str = Header(..., alias="apikey"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List the current user's chats, most recently updated first."""
    check_api_key(api_key)

    result = await db.execute(
        text("""
            SELECT id, title, created_at, updated_at
            FROM chats
            WHERE user_id = :user_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC
        """),
        {"user_id": current_user.id}
    )
    rows = result.mappings().all()

    return [
        {
            "id": str(row["id"]),
            "title": row["title"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in rows
    ]

@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    api_key: str = Header(..., alias="apikey"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all messages for a chat, ordered by sequence."""
    check_api_key(api_key)

    chat_result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(404, "Chat not found")

    result = await db.execute(
        text("""
            SELECT id, role, content, seq, created_at, edited_at
            FROM messages
            WHERE chat_id = :chat_id
            ORDER BY seq ASC
        """),
        {"chat_id": chat_id}
    )
    rows = result.mappings().all()

    return [
        {
            "id": str(row["id"]),
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "edited_at": row["edited_at"].isoformat() if row["edited_at"] else None,
        }
        for row in rows
    ]

@router.patch("/chats/{chat_id}/messages/{message_id}")
async def edit_message(
    chat_id: str,
    message_id: str,
    request: MessageEdit,
    api_key: str = Header(..., alias="apikey"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Edit the content of an existing message."""
    check_api_key(api_key)

    chat_result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(404, "Chat not found")

    msg_result = await db.execute(
        select(Message).where(Message.id == message_id, Message.chat_id == chat_id)
    )
    message = msg_result.scalar_one_or_none()
    if not message:
        raise HTTPException(404, "Message not found")

    await db.execute(
        text("UPDATE messages SET content = :content, edited_at = NOW() WHERE id = :id"),
        {"content": request.content, "id": message_id}
    )
    await db.commit()

    return {
        "id": message_id,
        "role": message.role,
        "content": request.content,
    }

@router.get("/usage")
async def get_usage(
    api_key: str = Header(..., alias="apikey"),
    current_user: User = Depends(get_current_user),
):
    """
    Current usage against each rolling window, for a Claude-style usage
    meter in the UI (percentage used + reset time, per window).
    """
    check_api_key(api_key)

    windows = []
    for w in USAGE_WINDOWS:
        used, reset_at = await get_window_usage(usage_key(w["name"], current_user.id), w["seconds"])
        windows.append({
            "window": w["name"],
            "used": used,
            "limit": w["limit"],
            "percent_used": round(min(used / w["limit"], 1.0) * 100, 1) if w["limit"] else 0,
            "reset_at": datetime.fromtimestamp(reset_at, tz=timezone.utc).isoformat() if reset_at else None,
        })

    return {"windows": windows}

@router.post("/agent/generate")
async def generate(
    request: GenerateRequest,
    api_key: str = Header(..., alias="apikey"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Stream a model response via SSE, persisting the exchange to the DB."""
    check_api_key(api_key)

    allowed, count = await check_rate_limit(
        key=f"agent:ratelimit:generate:{current_user.id}",
        limit=30,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(429, "Too many requests. Please slow down.")

    for w in USAGE_WINDOWS:
        used, reset_at = await get_window_usage(usage_key(w["name"], current_user.id), w["seconds"])
        if used >= w["limit"]:
            detail = f"{w['name']} usage limit reached."
            if reset_at:
                detail += f" Resets at {datetime.fromtimestamp(reset_at, tz=timezone.utc).isoformat()}."
            raise HTTPException(429, detail)

    chat_id = request.chat_id
    is_new_chat = False

    if chat_id:
        chat_result = await db.execute(
            select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
        )
        chat = chat_result.scalar_one_or_none()
        if not chat:
            raise HTTPException(404, "Chat not found")
    else:
        is_new_chat = True
        new_id = uuid.uuid4()
        title = request.prompt.strip()[:50] or "New chat"
        await db.execute(
            text("""
                INSERT INTO chats (id, user_id, title)
                VALUES (:id, :user_id, :title)
            """),
            {"id": new_id, "user_id": current_user.id, "title": title}
        )
        await db.commit()
        chat_id = str(new_id)

    history_result = await db.execute(
        text("""
            SELECT role, content FROM messages
            WHERE chat_id = :chat_id
            ORDER BY seq ASC
        """),
        {"chat_id": chat_id}
    )
    history = [{"role": r["role"], "content": r["content"]} for r in history_result.mappings().all()]

    seq_result = await db.execute(
        text("SELECT COALESCE(MAX(seq), 0) FROM messages WHERE chat_id = :chat_id"),
        {"chat_id": chat_id}
    )
    next_seq = seq_result.scalar_one() + 1

    user_msg_id = uuid.uuid4()
    await db.execute(
        text("""
            INSERT INTO messages (id, chat_id, role, content, seq)
            VALUES (:id, :chat_id, 'user', :content, :seq)
        """),
        {"id": user_msg_id, "chat_id": chat_id, "content": request.prompt, "seq": next_seq}
    )
    await db.commit()

    SYSTEM_PROMPT = (
        "You are a helpful AI assistant. Formatting rules you must always follow:\n"
        "- Inline math: wrap in single dollar signs, e.g. $x^2 + y^2 = z^2$.\n"
        "- Block/display math: wrap in double dollar signs on their own lines, e.g. $$\\int_0^1 x\\,dx$$.\n"
        "- Never use parentheses or square brackets as math delimiters instead of $ or $$.\n"
        "- In matrices and multi-line environments (pmatrix, bmatrix, align, cases, etc.), "
        "always separate rows with a double backslash \\\\ — a single backslash is invalid "
        "and will fail to render.\n"
        "- Tables must use standard GitHub-flavored Markdown: a header row, a separator row "
        "of dashes, and each data row on its own line."
    )
    messages_for_model = (
        [{"role": "system", "content": SYSTEM_PROMPT}]
        + history
        + [{"role": "user", "content": request.prompt}]
    )

    async def event_stream():
        assistant_text = ""
        prompt_tokens = 0
        completion_tokens = 0

        if is_new_chat:
            yield f"data: {json.dumps({'chat_id': chat_id})}\n\n"

        yield f"data: {json.dumps({'user_message_id': str(user_msg_id)})}\n\n"

        GENERATION_ACTIVE.inc()
        gen_start = time.time()
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    f"{settings.OLLAMA_HOST}/api/chat",
                    headers={
                        "Authorization": f"Bearer {settings.OLLAMA_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": request.model,
                        "messages": messages_for_model,
                        "stream": True,
                    },
                    timeout=httpx.Timeout(15.0, read=30.0),
                ) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        raise Exception(f"Ollama returned {response.status_code}: {error_text.decode()}")

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            part = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        chunk = part.get("message", {}).get("content", "")
                        if chunk:
                            assistant_text += chunk
                            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

                        if part.get("done"):
                            prompt_tokens = part.get("prompt_eval_count", 0) or 0
                            completion_tokens = part.get("eval_count", 0) or 0

            GENERATION_REQUESTS.labels(model=request.model, status="success").inc()
            GENERATION_TOKENS.labels(model=request.model, type="prompt").inc(prompt_tokens)
            GENERATION_TOKENS.labels(model=request.model, type="completion").inc(completion_tokens)
        except asyncio.TimeoutError:
            GENERATION_REQUESTS.labels(model=request.model, status="error").inc()
            yield f"data: {json.dumps({'error': f'No response from the model backend ({settings.OLLAMA_HOST}). It may be unreachable or overloaded.'})}\n\n"
            return
        except Exception as e:
            GENERATION_REQUESTS.labels(model=request.model, status="error").inc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return
        finally:
            GENERATION_DURATION.labels(model=request.model).observe(time.time() - gen_start)
            GENERATION_ACTIVE.dec()

        assistant_msg_id = uuid.uuid4()
        async with AsyncSessionLocal() as scoped_db:
            await scoped_db.execute(
                text("""
                    INSERT INTO messages (id, chat_id, role, content, seq)
                    VALUES (:id, :chat_id, 'assistant', :content, :seq)
                """),
                {"id": assistant_msg_id, "chat_id": chat_id, "content": assistant_text, "seq": next_seq + 1}
            )
            await scoped_db.execute(
                text("""
                    INSERT INTO token_usage (id, user_id, chat_id, prompt_tokens, completion_tokens)
                    VALUES (:id, :user_id, :chat_id, :prompt_tokens, :completion_tokens)
                """),
                {
                    "id": uuid.uuid4(),
                    "user_id": current_user.id,
                    "chat_id": chat_id,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                }
            )
            await scoped_db.execute(
                text("UPDATE chats SET updated_at = NOW() WHERE id = :id"),
                {"id": chat_id}
            )
            await scoped_db.commit()

        total_this_exchange = prompt_tokens + completion_tokens
        for w in USAGE_WINDOWS:
            await record_window_usage(
                usage_key(w["name"], current_user.id), w["seconds"], total_this_exchange
            )

        if is_new_chat:
            await publish_chat_title_job(chat_id, request.prompt)

        yield f"data: {json.dumps({'assistant_message_id': str(assistant_msg_id)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")