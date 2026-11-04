"""Accounts: sign up and sign in with an email and a password, and stay signed in by a cookie.

A session is a random token in an HttpOnly cookie, so the browser sends it for pictures
(<img src="/api/...">) as well as for requests. The database keeps only its hash, and
passwords only as Argon2 hashes, so a copy of the database signs nobody in.

Model calls cost money and this is a private demo, so signing up takes the invite code in
IMPASTO_INVITE_CODE, and without one set nobody can.

A copy run with neither a model key nor an invite code, like a fresh clone, is example only:
nobody signs in, every visitor is the guest, and the guest can look through the example piece
and start nothing new.
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import threading
import time
import uuid
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from impasto import meta, store  # meta loads .env

COOKIE = "impasto_session"
SESSION_SECONDS = 30 * 24 * 3600
MIN_PASSWORD_CHARS, MAX_PASSWORD_CHARS = 8, 256
MAX_EMAIL_CHARS = 254
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
WRONG_LOGIN = "That email and password don't match."

router = APIRouter(prefix="/api/auth")
hasher = PasswordHasher()
# Checked when no account has the email, so a sign-in takes as long whether it has one or not.
NO_ACCOUNT_HASH = hasher.hash(secrets.token_hex(16))


class Attempts:
    """Recent attempts per key, in memory: hashing is slow on purpose, and passwords shouldn't be guessable by trying."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit, self.window = limit, window_seconds
        self.seen: dict[str, list[float]] = {}
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        with self.lock:
            cutoff = time.time() - self.window
            self.seen = {k: fresh for k, times in self.seen.items() if (fresh := [t for t in times if t > cutoff])}
            if len(self.seen.get(key, [])) >= self.limit:
                raise HTTPException(429, "Too many tries. Wait a few minutes and try again.")

    def add(self, key: str) -> None:
        with self.lock:
            self.seen.setdefault(key, []).append(time.time())

    def clear(self, key: str | None = None) -> None:
        with self.lock:
            if key is None:
                self.seen.clear()
            else:
                self.seen.pop(key, None)


failed_signins = Attempts(limit=10, window_seconds=15 * 60)
signups = Attempts(limit=20, window_seconds=60 * 60)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def password_matches(stored_hash: str, password: str) -> bool:
    try:
        return hasher.verify(stored_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def clean_email(email: str) -> str:
    return email.strip().lower()


def public(user: dict) -> dict:
    return {"id": user["id"], "email": user["email"]}


def signed_in(token: str | None) -> dict | None:
    return store.session_user(token_hash(token)) if token else None


SessionCookie = Annotated[str | None, Cookie(alias=COOKIE)]
# Owns nothing, so it only reaches the example piece, which nobody can change.
GUEST = {"id": "guest", "email": "", "guest": True}
GUEST_REFUSED = "This copy runs without a model key, so it only shows the example piece. See the README to run it with one."


def example_only() -> bool:
    """No model key and no invite code: nothing could be paid for and nobody could sign up, so show the example to anyone."""
    return not os.environ.get(meta.KEY_VARIABLE, "").strip() and not os.environ.get("IMPASTO_INVITE_CODE", "").strip()


def current_user(token: SessionCookie = None) -> dict:
    """Who's asking. Every route outside this module goes through it."""
    user = signed_in(token)
    if user is None:
        if example_only():
            return GUEST
        raise HTTPException(401, "Sign in first.")
    return user


CurrentUser = Annotated[dict, Depends(current_user)]


def member(user: CurrentUser) -> dict:
    """Someone with an account: the routes that start a new piece or call a model on new pictures need one."""
    if user.get("guest"):
        raise HTTPException(403, GUEST_REFUSED)
    return user


Member = Annotated[dict, Depends(member)]


def start_session(request: Request, response: Response, user_id: str) -> None:
    token = secrets.token_urlsafe(32)
    store.add_session(token_hash(token), user_id, time.time() + SESSION_SECONDS)
    response.set_cookie(
        COOKIE, token, max_age=SESSION_SECONDS, path="/", httponly=True, samesite="lax",
        # Secure wherever the app is on https; on http://localhost a Secure cookie would never come back.
        secure=request.url.scheme == "https",
    )


def client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


class Credentials(BaseModel):
    email: str
    password: str


class NewAccount(Credentials):
    invite: str = ""


def invited(code: str) -> bool:
    expected = os.environ.get("IMPASTO_INVITE_CODE", "").strip()
    return bool(expected) and secrets.compare_digest(code.strip().encode(), expected.encode())



@router.get("/me")
def me(token: SessionCookie = None) -> dict:
    """Who's signed in, if anyone: not being signed in is a normal answer here."""
    user = signed_in(token)
    if user is None and example_only():
        return {"user": GUEST}
    return {"user": public(user) if user else None}


@router.post("/signup")
def sign_up(body: NewAccount, request: Request, response: Response) -> dict:
    # Counted first, so the code can't be guessed by trying; checked first, so without it nothing else is told.
    signups.check(client(request))
    signups.add(client(request))
    if not invited(body.invite):
        raise HTTPException(403, "That invite code isn't right.")
    email = clean_email(body.email)
    if len(email) > MAX_EMAIL_CHARS or not EMAIL.match(email):
        raise HTTPException(422, "Give a valid email address.")
    if len(body.password) < MIN_PASSWORD_CHARS:
        raise HTTPException(422, f"Use at least {MIN_PASSWORD_CHARS} characters for the password.")
    if len(body.password) > MAX_PASSWORD_CHARS:
        raise HTTPException(422, f"Keep the password under {MAX_PASSWORD_CHARS} characters.")
    user_id = uuid.uuid4().hex
    if not store.add_user(user_id, email, hasher.hash(body.password)):
        raise HTTPException(409, "There's already an account with this email. Sign in instead.")
    start_session(request, response, user_id)
    return {"user": {"id": user_id, "email": email}}


@router.post("/signin")
def sign_in(body: Credentials, request: Request, response: Response) -> dict:
    email = clean_email(body.email)
    key = f"{client(request)}:{email[:MAX_EMAIL_CHARS]}"
    failed_signins.check(key)
    user = store.user_by_email(email)
    # The same check and the same answer either way, so this doesn't tell who has an account.
    matches = password_matches(user["password_hash"] if user else NO_ACCOUNT_HASH, body.password[:MAX_PASSWORD_CHARS + 1])
    if user is None or not matches:
        failed_signins.add(key)
        raise HTTPException(401, WRONG_LOGIN)
    failed_signins.clear(key)
    start_session(request, response, user["id"])
    return {"user": public(user)}


@router.post("/signout")
def sign_out(request: Request, response: Response, token: SessionCookie = None) -> dict:
    if token:
        store.end_session(token_hash(token))
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax", secure=request.url.scheme == "https")
    return {"user": None}
