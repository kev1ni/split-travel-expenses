"""
Supabase 클라이언트(싱글톤)와 테이블 이름 상수.
"""

from typing import Optional

from config import settings

# schema.sql은 따옴표 없이 테이블을 만들기 때문에 PostgreSQL에는 소문자로 저장됩니다.
# Supabase REST API(PostgREST)는 테이블 이름을 대소문자 구분해서 찾으므로 소문자로 요청합니다.
# (Table Editor에서 대문자 "USERS"로 직접 만든 경우에만 아래 값을 대문자로 바꾸세요.)
TABLE_USERS = "users"
TABLE_TRIPS = "trips"
TABLE_TRIP_MEMBERS = "trip_members"
TABLE_CURRENCY_EXCHANGES = "currency_exchanges"
TABLE_EXPENSES = "expenses"
TABLE_EXPENSE_SPLITS = "expense_splits"
TABLE_SETTLEMENTS = "settlements"
TABLE_CARD_EVENTS = "card_events"

_client = None


def get_supabase_client():
    """.env 설정으로 Supabase 클라이언트를 만들고 재사용합니다."""
    global _client
    if _client is not None:
        return _client

    if not settings.supabase_url:
        raise RuntimeError("[환경변수 누락] .env에 SUPABASE_URL을 설정해주세요.")
    if not settings.supabase_key:
        raise RuntimeError(
            "[환경변수 누락] .env에 SUPABASE_SECRET_KEY(권장) 또는 SUPABASE_PUBLISHABLE_KEY를 설정해주세요."
        )

    from supabase import create_client  # 테스트에서 supabase 패키지 없이도 import 가능하도록 지연 import

    _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def set_supabase_client(client) -> None:
    """테스트용: 가짜 클라이언트를 주입합니다."""
    global _client
    _client = client


def key_source() -> Optional[str]:
    """사용 중인 키의 환경변수 이름 (값은 노출하지 않음)"""
    return settings.supabase_key_name
