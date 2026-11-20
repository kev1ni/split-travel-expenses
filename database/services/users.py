"""
회원 (USERS): 회원가입, 로그인, 내 여행 목록
"""

from typing import Any, Dict, List

from werkzeug.security import check_password_hash, generate_password_hash

from core.constants import PASSWORD_MIN_LENGTH
from core.db import TABLE_TRIP_MEMBERS, TABLE_TRIPS, TABLE_USERS, get_supabase_client
from core.errors import AuthError, ConflictError, ValidationError
from core.validators import db_call, email, first, text

LOGIN_ERROR_MESSAGE = "아이디 또는 비밀번호를 틀렸습니다."
PUBLIC_USER_FIELDS = ("id", "login_id", "name", "email")


def register_user(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    회원가입. 비밀번호는 "password" 키 권장 ("password_hash" 키도 하위 호환).
    응답에는 password_hash를 포함하지 않습니다.
    """
    client = get_supabase_client()

    login_id = text(data.get("login_id"), "login_id", required=True, max_len=50)
    name = text(data.get("name"), "name", required=True, max_len=50)
    user_email = email(data.get("email"))
    raw_password = data.get("password") or data.get("password_hash")
    if not raw_password or not str(raw_password).strip():
        raise ValidationError("비밀번호(password)는 필수 항목입니다.")
    if len(str(raw_password)) < PASSWORD_MIN_LENGTH:
        raise ValidationError(f"비밀번호는 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.")

    if client.table(TABLE_USERS).select("id").eq("login_id", login_id).execute().data:
        raise ConflictError(f"이미 존재하는 아이디(login_id)입니다: {login_id}")
    if client.table(TABLE_USERS).select("id").eq("email", user_email).execute().data:
        raise ConflictError(f"이미 존재하는 이메일(email)입니다: {user_email}")

    payload = {
        "login_id": login_id,
        "password_hash": generate_password_hash(str(raw_password)),
        "name": name,
        "email": user_email,
    }
    row = first(db_call("회원가입", lambda: client.table(TABLE_USERS).insert(payload).execute())) or payload
    return {k: row.get(k) for k in PUBLIC_USER_FIELDS}


def login_user(data: Dict[str, Any]) -> Dict[str, Any]:
    """로그인. 아이디/비밀번호 중 무엇이 틀렸는지 구분하지 않고 401."""
    login_id = data.get("login_id")
    raw_password = data.get("password") or data.get("password_hash")
    if not login_id or not raw_password:
        raise AuthError(LOGIN_ERROR_MESSAGE)

    client = get_supabase_client()
    user = first(
        client.table(TABLE_USERS)
        .select("id, login_id, password_hash, name, email")
        .eq("login_id", str(login_id).strip())
        .execute()
    )
    if not user or not user.get("password_hash") or not check_password_hash(user["password_hash"], str(raw_password)):
        raise AuthError(LOGIN_ERROR_MESSAGE)
    return {k: user[k] for k in PUBLIC_USER_FIELDS}


def get_user_trips(user_id: int) -> List[Dict[str, Any]]:
    """내가 참여 중인 여행 목록 (최근 시작일 순, my_nickname / my_member_id 포함)"""
    client = get_supabase_client()
    members = client.table(TABLE_TRIP_MEMBERS).select("id, trip_id, nickname").eq("user_id", user_id).execute().data
    if not members:
        return []

    member_map = {m["trip_id"]: m for m in members}
    trips = (
        client.table(TABLE_TRIPS)
        .select("*")
        .in_("id", list(member_map.keys()))
        .order("start_date", desc=True)
        .execute()
        .data
        or []
    )
    for t in trips:
        t["my_nickname"] = member_map[t["id"]]["nickname"]
        t["my_member_id"] = member_map[t["id"]]["id"]
    return trips
