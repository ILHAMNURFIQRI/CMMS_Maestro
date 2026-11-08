import hashlib
import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo.database import Database

from ..auth import (
    SESSION_COOKIE_NAME,
    SESSION_DURATION,
    UserRole,
    get_current_user,
    hash_password,
    require_roles,
    session_cookie_settings,
    session_digest,
    validate_email,
    verify_password,
)
from ..database.connection import get_db

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
users_router = APIRouter(prefix="/users", tags=["User management"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return validate_email(value)


class UserCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=256)
    role: UserRole

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Name cannot be empty")
        return name


class UserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(validation_alias="_id")
    email: str
    name: str
    role: UserRole
    active: bool


class SessionResponse(BaseModel):
    user: dict[str, str]


@auth_router.post("/login", response_model=SessionResponse)
def login(
    payload: LoginRequest,
    response: Response,
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    user = database.users.find_one({"email": payload.email})
    if (
        user is None
        or not user.get("active", True)
        or not verify_password(payload.password, user.get("password_hash", ""))
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect",
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_DURATION
    database.auth_sessions.insert_one(
        {
            "token_hash": session_digest(token),
            "email": user["email"],
            "expires_at": expires_at,
        }
    )
    secure_cookie, same_site = session_cookie_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=int(SESSION_DURATION.total_seconds()),
        httponly=True,
        secure=secure_cookie,
        samesite=same_site,
        path="/",
    )
    return {
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        }
    }


@auth_router.get("/me", response_model=dict)
def who_am_i(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    return user


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    database: Annotated[Database, Depends(get_db)],
) -> Response:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        database.auth_sessions.delete_one(
            {"token_hash": session_digest(token)}
        )
    secure_cookie, same_site = session_cookie_settings()
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=secure_cookie,
        samesite=same_site,
        path="/",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@users_router.get("", response_model=list[UserResponse])
def list_users(
    _: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> list[dict]:
    return list(
        database.users.find(
            {},
            {"email": 1, "name": 1, "role": 1, "active": 1},
        ).sort("created_at", -1)
    )


@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    _: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    if database.users.find_one({"email": payload.email}) is not None:
        raise HTTPException(status_code=409, detail="An account with this email exists")

    user = {
        "email": payload.email,
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    result = database.users.insert_one(user)
    return {"_id": str(result.inserted_id), **user}
