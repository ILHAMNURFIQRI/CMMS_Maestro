import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable, Literal

from fastapi import Depends, HTTPException, Request, status
from pymongo.database import Database

from .database.connection import get_db

UserRole = Literal["customer", "manager", "operator"]
SESSION_COOKIE_NAME = "maestro_session"
SESSION_DURATION = timedelta(hours=12)
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
        dklen=64,
    )
    salt_value = base64.urlsafe_b64encode(salt).decode("ascii")
    hash_value = base64.urlsafe_b64encode(password_hash).decode("ascii")
    return f"scrypt$16384$8$1${salt_value}${hash_value}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, n, r, p, salt_value, hash_value = stored_hash.split("$")
        if algorithm != "scrypt":
            return False
        expected = base64.urlsafe_b64decode(hash_value.encode("ascii"))
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.urlsafe_b64decode(salt_value.encode("ascii")),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError, UnicodeEncodeError):
        return False
    return hmac.compare_digest(actual, expected)


def validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("Enter a valid email address")
    return normalized


def session_cookie_settings() -> tuple[bool, str]:
    secure_value = os.getenv("AUTH_COOKIE_SECURE", "false").strip().lower()
    if secure_value not in {"true", "false"}:
        raise RuntimeError("AUTH_COOKIE_SECURE must be either true or false.")
    secure = secure_value == "true"

    same_site = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    if same_site not in {"lax", "strict", "none"}:
        raise RuntimeError(
            "AUTH_COOKIE_SAMESITE must be lax, strict, or none."
        )
    if same_site == "none" and not secure:
        raise RuntimeError(
            "AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAMESITE is none."
        )
    return secure, same_site


def initialize_auth(database: Database) -> None:
    session_cookie_settings()
    bootstrap_email = os.getenv("AUTH_BOOTSTRAP_EMAIL", "").strip()
    bootstrap_password = os.getenv("AUTH_BOOTSTRAP_PASSWORD", "")
    bootstrap_name = os.getenv("AUTH_BOOTSTRAP_NAME", "Initial Manager").strip()
    if not bootstrap_email and not bootstrap_password:
        if database.users.count_documents({}) == 0:
            raise RuntimeError(
                "No user accounts exist. Set AUTH_BOOTSTRAP_EMAIL and "
                "AUTH_BOOTSTRAP_PASSWORD to create the first manager."
            )
        return
    if not bootstrap_email or len(bootstrap_password) < 12:
        raise RuntimeError(
            "Set AUTH_BOOTSTRAP_EMAIL and AUTH_BOOTSTRAP_PASSWORD "
            "(at least 12 characters) to create the first manager."
        )

    email = validate_email(bootstrap_email)
    database.users.update_one(
        {"email": email},
        {
            "$setOnInsert": {
                "email": email,
                "name": bootstrap_name or "Initial Manager",
                "role": "manager",
                "password_hash": hash_password(bootstrap_password),
                "active": True,
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    account = database.users.find_one({"email": email})
    if account is None or account.get("role") != "manager":
        raise RuntimeError(
            "The configured bootstrap email already belongs to a non-manager account."
        )
    logger.info("Manager bootstrap account is ready.")


def session_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_current_user(
    request: Request,
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    now = datetime.now(timezone.utc)
    session = database.auth_sessions.find_one(
        {"token_hash": session_digest(token), "expires_at": {"$gt": now}}
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
        )

    user = database.users.find_one({"email": session["email"]})
    if user is None or not user.get("active", True):
        database.auth_sessions.delete_one({"token_hash": session_digest(token)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is unavailable",
        )
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }


def require_roles(*roles: UserRole) -> Callable[..., dict]:
    def role_dependency(
        user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return user

    return role_dependency
