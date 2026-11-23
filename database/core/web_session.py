"""Resolve the current browser's account or invited guest against trip membership."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from flask import current_app, g, request, session
from itsdangerous import BadSignature, URLSafeTimedSerializer

from core.db import TABLE_TRIP_MEMBERS, TABLE_USERS, get_supabase_client
from core.errors import AppError, AuthError
from core.validators import first
from services.common import get_trip_or_404


class AccessDenied(AppError):
    status_code = 403


SESSION_AGE = 7 * 24 * 3600


def _signer():
    if not current_app.secret_key:
        raise AppError("서버에 NTRIP_SESSION_SECRET을 설정한 뒤 다시 로그인해 주세요.", 503)
    return URLSafeTimedSerializer(current_app.secret_key, salt="ntrip-user-session-v1")


def _key(nonce):
    return hashlib.sha256(nonce.encode("ascii")).hexdigest()


def start_session(user_id=None):
    nonce = secrets.token_urlsafe(32)
    token = _signer().dumps(nonce)
    expires = datetime.now(timezone.utc) + timedelta(seconds=SESSION_AGE)
    row = {"token_hash": _key(nonce), "user_id": user_id, "expires_at": expires.isoformat()}
    get_supabase_client().table("web_sessions").insert(row).execute()
    session.clear()
    session["access"] = token
    g.web_identity = row
    return token


def identity():
    if hasattr(g, "web_identity"):
        return g.web_identity
    auth = request.headers.get("Authorization")
    token = session.get("access")
    if auth is not None:
        scheme, _, token = auth.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise AuthError("유효한 로그인 토큰이 필요합니다.")
    if not token:
        return None
    def expired():
        if auth is not None:
            raise AuthError("로그인 토큰이 만료되었거나 유효하지 않습니다.")
        session.clear()
        g.web_identity = None
        return None

    try:
        nonce = _signer().loads(token, max_age=SESSION_AGE)
    except BadSignature:
        return expired()
    row = first(get_supabase_client().table("web_sessions").select("*").eq("token_hash", _key(nonce)).execute())
    if not row or datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        return expired()
    g.web_identity = row
    return row


def logout_session():
    row = identity()
    if row:
        get_supabase_client().table("web_sessions").delete().eq("token_hash", row["token_hash"]).execute()
    session.clear()
    g.web_identity = None


def account():
    user_id = (identity() or {}).get("user_id")
    if user_id is None:
        return None
    return first(get_supabase_client().table(TABLE_USERS).select("id,login_id,name")
                 .eq("id", user_id).execute())


def find_member(trip_id):
    row = identity() or {}
    user_id = row.get("user_id")
    guest_id = None
    if not user_id and row:
        link = first(get_supabase_client().table("web_guest_members").select("member_id")
                     .eq("token_hash", row["token_hash"]).eq("trip_id", trip_id).execute())
        guest_id = link and link["member_id"]
    if user_id is None and guest_id is None:
        return None
    query = get_supabase_client().table(TABLE_TRIP_MEMBERS).select("*").eq("trip_id", trip_id)
    if user_id is not None:
        query = query.eq("user_id", user_id)
    else:
        query = query.eq("id", guest_id).is_("user_id", "null")
    return first(query.execute())


def trip_member(trip_id, *, owner=False):
    if not identity():
        raise AuthError("로그인하거나 여행 초대로 참여해 주세요.")
    member = find_member(trip_id)
    if member is None:
        raise AccessDenied("이 여행에 참여한 멤버만 사용할 수 있습니다.")
    if owner:
        trip = get_trip_or_404(get_supabase_client(), trip_id)
        if not member.get("user_id") or member["user_id"] != trip["created_by"]:
            raise AccessDenied("여행을 만든 멤버만 사용할 수 있습니다.")
    return member


def require_user():
    user = account()
    if not user:
        raise AuthError("로그인한 회원만 사용할 수 있습니다.")
    return user


def remember_guest(trip_id, member_id):
    if not identity():
        start_session()
    row = identity()
    get_supabase_client().table("web_guest_members").insert(
        {"token_hash": row["token_hash"], "trip_id": trip_id, "member_id": member_id}).execute()


def guest_trips():
    row = identity() or {}
    if not row or row.get("user_id"):
        return []
    query = get_supabase_client().table("web_guest_members").select("trip_id,member_id")
    return query.eq("token_hash", row["token_hash"]).execute().data or []
