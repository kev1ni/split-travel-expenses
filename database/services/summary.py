"""
대시보드 통계 (여러 테이블 집계)
"""

from collections import defaultdict
from typing import Any, Dict

from core.constants import UNKNOWN_NICKNAME
from core.db import TABLE_CURRENCY_EXCHANGES, TABLE_EXPENSES, get_supabase_client
from core.validators import local_date, to_number
from services.common import get_trip_or_404, member_name_map


def get_trip_summary(trip_id: int) -> Dict[str, Any]:
    """
    - 원화 총 지출 / 건수
    - 카테고리·결제수단·날짜(기본 시간대)·결제자별 합계
    - 통화별 환전 합계, 평균 환율, 현금 사용 외화, 남은 외화 추정
    """
    client = get_supabase_client()
    get_trip_or_404(client, trip_id)
    names = member_name_map(client, trip_id)

    expenses = (
        client.table(TABLE_EXPENSES)
        .select("krw_amount, amount, currency, category, payment_method, spent_at, payer_member_id")
        .eq("trip_id", trip_id).execute().data or []
    )
    by_category, by_method, by_date, by_payer = (defaultdict(int) for _ in range(4))
    cash_foreign = defaultdict(float)
    for e in expenses:
        amt = int(e["krw_amount"])
        method = (e.get("payment_method") or "card").lower()
        by_category[e.get("category") or "기타"] += amt
        by_method[method] += amt
        if e.get("spent_at"):
            by_date[local_date(e["spent_at"])] += amt
        by_payer[names.get(e["payer_member_id"], UNKNOWN_NICKNAME)] += amt
        if method == "cash" and e.get("currency") and e["currency"] != "KRW":
            cash_foreign[e["currency"]] += to_number(e.get("amount"))

    exchanges = (
        client.table(TABLE_CURRENCY_EXCHANGES)
        .select("original_krw_amount, exchanged_amount, currency")
        .eq("trip_id", trip_id).execute().data or []
    )
    by_currency: Dict[str, Dict[str, Any]] = {}
    for x in exchanges:
        item = by_currency.setdefault(x["currency"], {"krw_used": 0, "foreign_obtained": 0})
        item["krw_used"] += int(x["original_krw_amount"])
        item["foreign_obtained"] += to_number(x["exchanged_amount"])
    for cur, item in by_currency.items():
        obtained = item["foreign_obtained"]
        item["average_rate"] = round(item["krw_used"] / obtained, 4) if obtained else None
        item["cash_spent"] = cash_foreign.get(cur, 0)
        item["remaining_estimate"] = obtained - item["cash_spent"]

    currencies = list(by_currency)
    return {
        "trip_id": trip_id,
        "total_krw_spent": sum(by_category.values()),
        "expense_count": len(expenses),
        "by_category": dict(by_category),
        "by_payment_method": dict(by_method),
        "by_date": dict(sorted(by_date.items())),
        "by_payer": dict(by_payer),
        "exchange_summary": {
            "total_krw_used": sum(i["krw_used"] for i in by_currency.values()),
            "total_foreign_obtained": by_currency[currencies[0]]["foreign_obtained"] if len(currencies) == 1 else None,
            "currency": currencies[0] if len(currencies) == 1 else ("MIXED" if currencies else None),
            "by_currency": by_currency,
        },
    }
