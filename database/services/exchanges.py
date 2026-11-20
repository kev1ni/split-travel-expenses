"""
환전 (CURRENCY_EXCHANGES): 등록, 조회
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List

from config import settings
from core.constants import UNKNOWN_NICKNAME
from core.db import TABLE_CURRENCY_EXCHANGES, get_supabase_client
from core.validators import currency, db_call, decimal_text, first, numeric_out, text, to_date, to_decimal, to_int
from services.common import ensure_members_in_trip, get_trip_or_404, member_name_map


def add_exchange(trip_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    환전 등록. exchanged_amount는 소수 가능.
    exchange_rate 생략 시 원화 ÷ 외화, exchange_date 생략 시 오늘.
    """
    client = get_supabase_client()
    trip_id = to_int(trip_id, "trip_id")
    member_id = to_int(data.get("member_id"), "member_id")
    get_trip_or_404(client, trip_id)
    ensure_members_in_trip(client, trip_id, [member_id])

    original_krw = to_int(data.get("original_krw_amount"), "original_krw_amount", minimum=1)
    exchanged = to_decimal(data.get("exchanged_amount"), "exchanged_amount", positive=True)
    rate = to_decimal(data.get("exchange_rate"), "exchange_rate", required=False, positive=True)
    if rate is None:
        rate = (Decimal(original_krw) / exchanged).quantize(Decimal("0.000001"))

    payload = {
        "trip_id": trip_id,
        "member_id": member_id,
        "exchange_date": to_date(data.get("exchange_date"), "exchange_date")
        or datetime.now(settings.default_tz).date().isoformat(),
        "currency": currency(data.get("currency")),
        "original_krw_amount": original_krw,
        "exchanged_amount": numeric_out(exchanged),
        "exchange_rate": decimal_text(rate),
        "rate_type": text(data.get("rate_type"), "rate_type", max_len=50),
        "memo": text(data.get("memo"), "memo"),
    }
    return first(db_call("환전 등록", lambda: client.table(TABLE_CURRENCY_EXCHANGES).insert(payload).execute())) or payload


def list_exchanges(trip_id: int) -> List[Dict[str, Any]]:
    """환전 내역 (최근 환전일 순, member_nickname 포함)"""
    client = get_supabase_client()
    rows = (
        client.table(TABLE_CURRENCY_EXCHANGES).select("*").eq("trip_id", trip_id)
        .order("exchange_date", desc=True).execute().data or []
    )
    names = member_name_map(client, trip_id) if rows else {}
    for r in rows:
        r["member_nickname"] = names.get(r["member_id"], UNKNOWN_NICKNAME)
    return rows
