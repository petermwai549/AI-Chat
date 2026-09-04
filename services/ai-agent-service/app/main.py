# services/ai-agent-service/app/main.py
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
import time
from contextlib import asynccontextmanager
import uvicorn

from app.redis_client import init_redis, close_redis
from app.rabbitmq_client import init_rabbitmq, close_rabbitmq
from app.config import settings

# Import metrics
from app.metrics import (
    REQUEST_COUNT,
    REQUEST_DURATION,
    ACTIVE_REQUESTS,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting AI Agent Service with Prometheus metrics...")
    print(f"📡 Environment: {settings.ENVIRONMENT}")
    print(f"🔑 API Key configured: {'Yes' if settings.API_KEY else 'No'}")
    
    await init_redis()
    print("✅ Redis connected")
    
    await init_rabbitmq()
    print("✅ RabbitMQ connected")
    
    yield
    
    await close_rabbitmq()
    await close_redis()
    print("👋 Shutting down...")

app = FastAPI(
    title="AI Agent Service",
    description="AI Agent Backend with Google OAuth and Email Verification",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - Allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:6080",  # Allow APISIX
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "apikey",
        "X-User-Id",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["*"],
    max_age=3600,
)

# Metrics middleware
@app.middleware("http")
async def prometheus_middleware(request, call_next):
    start_time = time.time()
    ACTIVE_REQUESTS.inc()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        duration = time.time() - start_time
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=request.url.path,
            status=status_code
        ).inc()
        REQUEST_DURATION.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration)
        ACTIVE_REQUESTS.dec()

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "service": "ai-agent-service",
        "environment": settings.ENVIRONMENT
    }

# Root endpoint
@app.get("/")
async def root():
    return {
        "service": "AI Agent Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "metrics": "/metrics",
            "api": "/api/v1",
            "auth": "/api/auth"
        }
    }

# Include routers
from app.auth import router as auth_router
from app.chat import router as chat_router
app.include_router(auth_router)
app.include_router(chat_router)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )