# services/ai-agent-service/app/config.py
import os
from typing import Optional

class Settings:
    # Database - Updated to match .env
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # RabbitMQ - Updated to match .env
    RABBITMQ_HOST: str = os.getenv("RABBITMQ_HOST", "")
    RABBITMQ_USER: str = os.getenv("RABBITMQ_USER", "")
    RABBITMQ_PASSWORD: str = os.getenv("RABBITMQ_PASSWORD", "")

    # Redis - Updated to match .env
    REDIS_HOST: str = os.getenv("REDIS_HOST", "redis")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: str = os.getenv("REDIS_PASSWORD", "")

    # Ollama
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "")
    OLLAMA_API_KEY: str = os.getenv("OLLAMA_API_KEY", "")

    # Auth - Updated to match .env
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_DAYS: int = 7

    # Email - Updated to match .env
    EMAIL_HOST: str = os.getenv("EMAIL_HOST", "")
    EMAIL_PORT: int = int(os.getenv("EMAIL_PORT", "587"))
    EMAIL_USER: str = os.getenv("EMAIL_USER", "")
    EMAIL_PASSWORD: str = os.getenv("EMAIL_PASSWORD", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "")

    # API Key
    API_KEY: str = os.getenv("API_KEY", "")

    # Token limits
    TOKEN_LIMIT_5H: int = int(os.getenv("TOKEN_LIMIT_5H", "50000"))
    TOKEN_LIMIT_DAILY: int = int(os.getenv("TOKEN_LIMIT_DAILY", "200000"))
    TOKEN_LIMIT_WEEKLY: int = int(os.getenv("TOKEN_LIMIT_WEEKLY", "1000000"))

    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

settings = Settings()