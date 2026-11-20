"""
여행 (TRIPS) + 참가자 (TRIP_MEMBERS): 생성, 상세, 초대 코드, 참가
"""

import secrets
import string
from typing import Any, Dict, List, Optional, Tuple

from core.constants import SHARE_CODE_LENGTH
from core.db import TABLE_TRIP_MEMBERS, TABLE_TRIPS, get_supabase_client
from core.errors import ConflictError, DatabaseError, NotFoundError, ValidationError
from core.validators import currency, db_call, first, text, to_date, to_int
from services.common import get_trip_or_404, resolve_user_id

# 헷갈리는 문자(0/O/1/I) 제외
_SHARE_CODE_CHARS = "".join(c for c in string.ascii_uppercase + string.digits if c not in "0O1I")


# ------------------------------------------------------------------
# 생성
# ------------------------------------------------------------------
def _generate_unique_share_code(client, max_tries: int = 20) -> str:
    for _ in range(max_tries):
        code = "".join(secrets.choice(_SHARE_CODE_CHARS) for _ in range(SHARE_CODE_LENGTH))
        if not client.table(TABLE_TRIPS).select("id").eq("share_code", code).execute().data:
            return code
    raise DatabaseError("초대 코드 생성에 실패했습니다. 다시 시도해주세요.")


def create_trip(data: Dict[str, Any]) -> Dict[str, Any]:
    """여행만 생성 (created_by: user_id 또는 login_id)"""
    client = get_supabase_client()

    user_id = resolve_user_id(client, user_id=data.get("created_by"), field="created_by")
    if user_id is None:
        raise ValidationError("created_by(생성자 user_id 또는 login_id)는 필수 항목입니다.")

    start_date = to_date(data.get("start_date"), "start_date")
    end_date = to_date(data.get("end_date"), "end_date")
    if start_date and end_date and end_date < start_date:
        raise ValidationError("end_date는 start_date보다 빠를 수 없습니다.")

    payload = {
        "title": text(data.get("title"), "title", required=True, max_len=100),
        "description": text(data.get("description"), "description"),
        "destination_country": text(data.get("destination_country"), "destination_country", max_len=50),
        "destination_currency": currency(data.get("destination_currency"), "destination_currency", default="KRW"),
        "start_date": start_date,
        "end_date": end_date,
        "share_code": _generate_unique_share_code(client),
        "created_by": user_id,
    }
    return first(db_call("여행 생성", lambda: client.table(TABLE_TRIPS).insert(payload).execute())) or payload


def create_trip_with_owner(data: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """여행 생성 + 생성자를 첫 멤버로 등록. 멤버 등록 실패 시 여행 삭제(보상 처리)."""
    trip = create_trip(data)
    try:
        owner = add_trip_member({
            "trip_id": trip["id"],
            "user_id": trip["created_by"],
            "nickname": data.get("creator_nickname") or "방장",
        })
    except Exception:
        get_supabase_client().table(TABLE_TRIPS).delete().eq("id", trip["id"]).execute()
        raise
    return trip, owner


# ------------------------------------------------------------------
# 참가자
# ------------------------------------------------------------------
def add_trip_member(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    참가자 추가. user_id / login_id가 있으면 회원, 없으면 게스트(user_id NULL).
    같은 회원 재참여, 같은 여행 내 닉네임 중복은 409.
    """
    client = get_supabase_client()
    trip_id = to_int(data.get("trip_id"), "trip_id")
    nickname = text(data.get("nickname"), "nickname", required=True, max_len=50)
    get_trip_or_404(client, trip_id)
    user_id = resolve_user_id(client, user_id=data.get("user_id"), login_id=data.get("login_id"))

    existing = client.table(TABLE_TRIP_MEMBERS).select("id, user_id, nickname").eq("trip_id", trip_id).execute().data or []
    if user_id is not None and any(m.get("user_id") == user_id for m in existing):
        raise ConflictError("이미 이 여행에 참여 중인 회원입니다.")
    if any(m["nickname"] == nickname for m in existing):
        raise ConflictError(f"이 여행에 이미 같은 닉네임이 있습니다: {nickname}")

    payload = {"trip_id": trip_id, "user_id": user_id, "nickname": nickname}
    return first(db_call("참가자 추가", lambda: client.table(TABLE_TRIP_MEMBERS).insert(payload).execute())) or payload


def join_trip_by_share_code(data: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """초대 코드로 참가 (회원/게스트)"""
    share_code = text(data.get("share_code"), "share_code", required=True)
    trip = get_trip_by_share_code(share_code)
    if not trip:
        raise NotFoundError("유효하지 않은 초대 코드입니다.")
    member = add_trip_member({
        "trip_id": trip["id"],
        "user_id": data.get("user_id"),
        "login_id": data.get("login_id"),
        "nickname": data.get("nickname"),
    })
    return trip, member


# ------------------------------------------------------------------
# 조회
# ------------------------------------------------------------------
def get_trip_members(trip_id: int) -> List[Dict[str, Any]]:
    """참가자 목록 (is_guest 포함)"""
    client = get_supabase_client()
    members = (
        client.table(TABLE_TRIP_MEMBERS)
        .select("id, trip_id, user_id, nickname")
        .eq("trip_id", trip_id)
        .order("id")
        .execute()
        .data
        or []
    )
    for m in members:
        m["is_guest"] = m.get("user_id") is None
    return members


def get_trip_detail(trip_id: int) -> Dict[str, Any]:
    """여행 정보 + 참가자 목록 (없으면 404)"""
    trip = get_trip_or_404(get_supabase_client(), trip_id)
    trip["members"] = get_trip_members(trip_id)
    trip["member_count"] = len(trip["members"])
    return trip


def get_trip_by_share_code(share_code: Optional[str]) -> Optional[Dict[str, Any]]:
    """초대 코드로 여행 조회 (대소문자 무관, member_count 포함)"""
    if not share_code or not str(share_code).strip():
        return None
    client = get_supabase_client()
    trip = first(client.table(TABLE_TRIPS).select("*").eq("share_code", str(share_code).strip().upper()).execute())
    if not trip:
        return None
    res = client.table(TABLE_TRIP_MEMBERS).select("id", count="exact").eq("trip_id", trip["id"]).execute()
    count = getattr(res, "count", None)
    trip["member_count"] = count if count is not None else len(res.data or [])
    return trip
