import redis.asyncio as redis
from app.config import settings

_pool = None
_client = None

def get_redis() -> redis.Redis:
    """Return the shared Redis client. Must be initialized via init_redis() first."""
    if _client is None:
        raise RuntimeError("Redis client not initialized. Call init_redis() at startup.")
    return _client

async def init_redis():
    global _pool, _client
    _pool = redis.ConnectionPool.from_url(
        f"redis://:{settings.REDIS_PASSWORD}@{settings.REDIS_HOST}:{settings.REDIS_PORT}",
        decode_responses=True,
        max_connections=20,
    )
    _client = redis.Redis(connection_pool=_pool)
    await _client.ping()

async def close_redis():
    global _client, _pool
    if _client:
        await _client.close()
    if _pool:
        await _pool.disconnect()

async def check_rate_limit(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """
    Atomic fixed-window rate limiter using INCR + EXPIRE NX in a pipeline.
    Returns (allowed, current_count). Safe under concurrent requests —
    no separate GET-then-check-then-INCR race condition.
    """
    r = get_redis()
    pipe = r.pipeline()
    pipe.incr(key)
    pipe.expire(key, window_seconds, nx=True)  # only sets TTL the first time the key is created
    count, _ = await pipe.execute()
    return count <= limit, count

async def revoke_token(jti: str, ttl_seconds: int):
    """
    Blocklist a JWT by its jti for exactly the remaining duration of its
    validity. The key expires on its own the moment the token would have
    expired anyway, so the blocklist never grows unbounded.
    """
    if ttl_seconds <= 0:
        return
    r = get_redis()
    await r.set(f"agent:jwt:revoked:{jti}", "1", ex=ttl_seconds)

async def is_token_revoked(jti: str) -> bool:
    r = get_redis()
    return (await r.exists(f"agent:jwt:revoked:{jti}")) == 1

# ============================================
# Sliding-window token usage limits
# (Claude-style stacked 5h / daily / weekly caps)
# ============================================
#
# Implemented as a Redis sorted set per (user, window): score = request
# timestamp, member = "<uuid>:<tokens>". This gives a true rolling window
# (resets exactly N seconds after each entry ages out) rather than a
# fixed-clock window that bursts at midnight.
#
# Deliberately NOT a single atomic check-and-reserve op: completion token
# count isn't known until the model finishes generating, so there's
# nothing to atomically "reserve" ahead of time. Callers check usage
# before generating (deny if already over), then record actual usage
# after generating completes.

import time
import uuid as _uuid

async def get_window_usage(key: str, window_seconds: int) -> tuple[int, float | None]:
    """
    Evicts expired entries, then returns (total_tokens_in_window, reset_at)
    where reset_at is the unix timestamp at which the OLDEST entry
    currently in the window will age out (i.e. when usage will next drop).
    reset_at is None if the window is currently empty.
    """
    r = get_redis()
    now = time.time()
    cutoff = now - window_seconds

    await r.zremrangebyscore(key, "-inf", cutoff)
    entries = await r.zrange(key, 0, -1, withscores=True)

    total = 0
    oldest_score = None
    for member, score in entries:
        try:
            tokens = int(member.rsplit(":", 1)[1])
        except (IndexError, ValueError):
            continue
        total += tokens
        if oldest_score is None or score < oldest_score:
            oldest_score = score

    reset_at = (oldest_score + window_seconds) if oldest_score is not None else None
    return total, reset_at

async def record_window_usage(key: str, window_seconds: int, tokens: int):
    """Add a usage entry to the window. Call once per window, after the
    actual token count for a request is known."""
    if tokens <= 0:
        return
    r = get_redis()
    now = time.time()
    member = f"{_uuid.uuid4()}:{tokens}"
    await r.zadd(key, {member: now})
    await r.expire(key, window_seconds)  # auto-clean if the user goes fully idle