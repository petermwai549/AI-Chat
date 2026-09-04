from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import secrets
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from jose import jwt, JWTError
import uuid

from app.database import get_db
from app.models import User, EmailVerificationCode
from app.config import settings
from app.redis_client import revoke_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ============================================
# Pydantic Models
# ============================================

class EmailCodeRequest(BaseModel):
    email: EmailStr

class EmailCodeVerify(BaseModel):
    email: EmailStr
    code: str

class GoogleAuthRequest(BaseModel):
    code: str
    redirect_uri: str

class AuthResponse(BaseModel):
    token: str
    user: dict

# ============================================
# Helper Functions
# ============================================

def generate_verification_code() -> str:
    """Generate a 6-digit verification code"""
    return ''.join(secrets.choice(string.digits) for _ in range(6))

def create_jwt(user_id: str, email: str, name: str = None) -> str:
    """Create JWT token for authenticated user. Includes a jti so this
    specific token can be individually revoked later (see /logout)."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name or email.split('@')[0],
        "jti": str(uuid.uuid4()),
        "exp": datetime.utcnow() + timedelta(days=settings.JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

async def send_verification_email(email: str, code: str) -> bool:
    """Send verification code via email"""
    if not settings.EMAIL_USER or not settings.EMAIL_PASSWORD:
        print(f"⚠️ Email not configured. Would send code {code} to {email}")
        return True  # Return True for development

    subject = "Your verification code"
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif;">
        <div style="max-width: 500px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
            <h2 style="color: #333;">Your verification code</h2>
            <p style="color: #666;">Enter this code to sign in to AI Agent:</p>
            <h1 style="font-size: 48px; letter-spacing: 8px; background: white; padding: 20px; border-radius: 8px; text-align: center; border: 2px dashed #8B5CF6;">
                {code}
            </h1>
            <p style="color: #999; font-size: 14px;">This code will expire in 5 minutes.</p>
            <p style="color: #999; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = settings.EMAIL_FROM
    msg['To'] = email
    msg.attach(MIMEText(body, 'html'))

    try:
        with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT) as server:
            server.starttls()
            server.login(settings.EMAIL_USER, settings.EMAIL_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"❌ Email sending failed: {e}")
        return False

# ============================================
# API Endpoints
# ============================================

@router.post("/email/send-code")
async def send_code(
    request: EmailCodeRequest,
    api_key: str = Header(..., alias="apikey"),
    db: AsyncSession = Depends(get_db)
):
    """Send a verification code to the provided email"""

    if api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")

    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()

    code = generate_verification_code()
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    code_id = uuid.uuid4()

    await db.execute(
        text("DELETE FROM email_verification_codes WHERE email = :email AND used = FALSE"),
        {"email": request.email}
    )

    await db.execute(
        text("""
            INSERT INTO email_verification_codes (id, email, code, expires_at, used) 
            VALUES (:id, :email, :code, :expires_at, FALSE)
        """),
        {"id": code_id, "email": request.email, "code": code, "expires_at": expires_at}
    )
    await db.commit()

    success = await send_verification_email(request.email, code)
    if not success:
        raise HTTPException(500, "Failed to send verification email")

    return {"message": "Verification code sent", "expires_in": 300}

@router.post("/email/verify")
async def verify_code(
    request: EmailCodeVerify,
    api_key: str = Header(..., alias="apikey"),
    db: AsyncSession = Depends(get_db)
):
    """Verify the code and authenticate the user"""

    if api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")

    result = await db.execute(
        text("""
            SELECT * FROM email_verification_codes 
            WHERE email = :email AND code = :code AND used = FALSE 
            AND expires_at > NOW()
        """),
        {"email": request.email, "code": request.code}
    )
    record = result.first()

    if not record:
        raise HTTPException(400, "Invalid or expired code")

    await db.execute(
        text("UPDATE email_verification_codes SET used = TRUE WHERE id = :id"),
        {"id": record.id}
    )
    await db.commit()

    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        user_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO users (id, email, display_name, auth_provider, is_verified, last_login) 
                VALUES (:id, :email, :name, 'email', TRUE, NOW())
            """),
            {"id": user_id, "email": request.email, "name": request.email.split('@')[0]}
        )
        await db.commit()

        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one()
    else:
        await db.execute(
            text("UPDATE users SET last_login = NOW(), is_verified = TRUE WHERE id = :id"),
            {"id": user.id}
        )
        await db.commit()

    token = create_jwt(str(user.id), user.email, user.display_name)

    return AuthResponse(
        token=token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.display_name or user.email.split('@')[0]
        }
    )

@router.post("/google/callback")
async def google_auth(
    request: GoogleAuthRequest,
    api_key: str = Header(..., alias="apikey"),
    db: AsyncSession = Depends(get_db)
):
    """Authenticate with Google OAuth authorization code"""

    if api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")

    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    import httpx

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": request.code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": request.redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if token_response.status_code != 200:
        raise HTTPException(400, f"Google token exchange failed: {token_response.text}")

    tokens = token_response.json()

    try:
        id_info = id_token.verify_oauth2_token(
            tokens["id_token"],
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
    except Exception as e:
        raise HTTPException(400, f"Invalid Google token: {str(e)}")

    email = id_info.get("email")
    if not email:
        raise HTTPException(400, "Email not provided by Google")

    name = id_info.get("name", email.split('@')[0])
    picture = id_info.get("picture")
    google_id = id_info.get("sub")

    result = await db.execute(
        select(User).where(
            (User.email == email) | (User.google_id == google_id)
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        user_id = uuid.uuid4()
        await db.execute(
            text("""
                INSERT INTO users (id, email, display_name, picture, auth_provider, google_id, is_verified, last_login) 
                VALUES (:id, :email, :name, :picture, 'google', :google_id, TRUE, NOW())
            """),
            {"id": user_id, "email": email, "name": name, "picture": picture, "google_id": google_id}
        )
        await db.commit()

        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one()
    else:
        if not user.google_id:
            await db.execute(
                text("UPDATE users SET google_id = :google_id, picture = :picture, last_login = NOW() WHERE id = :id"),
                {"google_id": google_id, "picture": picture, "id": user.id}
            )
        else:
            await db.execute(
                text("UPDATE users SET last_login = NOW() WHERE id = :id"),
                {"id": user.id}
            )
        await db.commit()

    token = create_jwt(str(user.id), user.email, user.display_name)

    return AuthResponse(
        token=token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.display_name or user.email.split('@')[0],
            "picture": user.picture
        }
    )

@router.post("/logout")
async def logout(authorization: str = Header(None)):
    """
    Revoke the current JWT by blocklisting its jti in Redis until it would
    have naturally expired. Without this, logout was purely client-side
    (sessionStorage.clear()) and a stolen/leaked token stayed valid until
    its 7-day expiry regardless of the user 'logging out'.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authentication token")

    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        # Already invalid/expired — nothing to revoke, treat as a successful logout
        return {"message": "Logged out"}

    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        ttl = int(exp - datetime.utcnow().timestamp())
        await revoke_token(jti, ttl)

    return {"message": "Logged out"}

@router.get("/health")
async def auth_health():
    """Health check endpoint for auth service"""
    return {"status": "healthy", "service": "auth"}