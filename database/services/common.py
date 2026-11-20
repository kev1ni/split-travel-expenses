"""
여러 서비스에서 함께 쓰는 DB 조회 헬퍼 (여행·멤버 존재 확인 등).
"""

from typing import Any, Dict, Iterable, Optional

from core.db import TABLE_TRIP_MEMBERS, TABLE_TRIPS, TABLE_USERS
from core.errors import NotFoundError, ValidationError
from core.validators import first, to_int


def get_trip_or_404(client, trip_id: int) -> Dict[str, Any]:
    trip = first(client.table(TABLE_TRIPS).select("*").eq("id", trip_id).execute())
    if not trip:
        raise NotFoundError(f"존재하지 않는 여행입니다 (trip_id: {trip_id}).")
    return trip


def trip_member_ids(client, trip_id: int) -> set:
    res = client.table(TABLE_TRIP_MEMBERS).select("id").eq("trip_id", trip_id).execute()
    return {m["id"] for m in (res.data or [])}


def ensure_members_in_trip(client, trip_id: int, member_ids: Iterable[int], member_set: Optional[set] = None) -> None:
    """member_ids가 모두 이 여행의 참가자인지 확인 (아니면 400)"""
    member_set = member_set if member_set is not None else trip_member_ids(client, trip_id)
    invalid = sorted({int(m) for m in member_ids} - member_set)
    if invalid:
        raise ValidationError(f"이 여행의 참가자가 아닌 member_id가 있습니다: {invalid}")


def member_name_map(client, trip_id: int) -> Dict[int, str]:
    res = client.table(TABLE_TRIP_MEMBERS).select("id, nickname").eq("trip_id", trip_id).execute()
    return {m["id"]: m["nickname"] for m in (res.data or [])}


def resolve_user_id(client, user_id: Any = None, login_id: Any = None, field: str = "user_id") -> Optional[int]:
    """
    user_id(정수 또는 숫자 문자열) 또는 login_id(문자열)로 USERS.id를 찾습니다.
    둘 다 없으면 None (게스트), 회원이 없으면 404.
    """
    if user_id is not None and str(user_id).strip() != "":
        try:
            uid = to_int(user_id, field)
        except ValidationError:
            login_id, uid = user_id, None  # 숫자가 아니면 login_id로 간주
        if uid is not None:
            if not first(client.table(TABLE_USERS).select("id").eq("id", uid).execute()):
                raise NotFoundError(f"존재하지 않는 회원입니다 (user_id: {uid}).")
            return uid
    if login_id is not None and str(login_id).strip():
        row = first(client.table(TABLE_USERS).select("id").eq("login_id", str(login_id).strip()).execute())
        if not row:
            raise NotFoundError(f"존재하지 않는 회원(login_id)입니다: {login_id}")
        return row["id"]
    return None
