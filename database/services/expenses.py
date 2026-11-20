"""
지출 (EXPENSES) + 분할 (EXPENSE_SPLITS): 등록, 조회, 수정, 삭제

[원자성] Supabase REST는 여러 요청을 한 트랜잭션으로 묶을 수 없으므로
"검증·계산을 모두 끝낸 뒤 저장 → 뒤 단계 실패 시 앞 단계 되돌리기(보상 처리)" 방식입니다.
"""

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

from config import settings
from core.constants import BASIS_POINT_TOTAL, ENTRY_TYPES, SPLIT_TYPE_ALIASES, SPLIT_TYPES, UNKNOWN_NICKNAME
from core.db import TABLE_CARD_EVENTS, TABLE_EXPENSE_SPLITS, TABLE_EXPENSES, get_supabase_client
from core.errors import NotFoundError, ValidationError
from core.validators import (
    choice, currency, db_call, decimal_text, first, floor_int, now_iso, numeric_out,
    round_krw, text, to_date, to_datetime, to_decimal, to_int,
)
from services.card_events import check_linkable, link_card_event
from services.common import ensure_members_in_trip, get_trip_or_404, member_name_map, trip_member_ids


# ------------------------------------------------------------------
# 분할 계산 (DB 접근 없는 순수 함수)
# ------------------------------------------------------------------
def build_splits(
    total_krw: int, split_data: Dict[str, Any], default_member_ids: Iterable[int] = ()
) -> Tuple[str, List[Dict[str, int]]]:
    """
    - equal      : {"member_ids": [1,2,3]} 균등 분할, 1원 나머지는 앞사람부터 +1
                   (member_ids가 없으면 default_member_ids = 여행 전체 멤버)
    - exact      : {"splits": [{"member_id": 1, "split_krw_amount": 5000}, ...]} 합계 = 총액
    - percentage : {"splits": [{"member_id": 1, "percentage_bp": 5000}, ...]}    합계 = 10000
                   금액은 내림 후 남은 원을 소수점이 큰 순서대로 배분
    반환: (split_type, [{"member_id", "split_krw_amount", "percentage_bp"}])
    """
    split_type = choice(split_data.get("split_type"), "split_type", SPLIT_TYPES, "equal", SPLIT_TYPE_ALIASES)
    rows: List[Dict[str, int]] = []

    if split_type == "equal":
        member_ids = [to_int(m, "member_ids") for m in (split_data.get("member_ids") or list(default_member_ids))]
        if not member_ids:
            raise ValidationError("균등 분할 대상 member_ids가 비어 있습니다.")
        if len(set(member_ids)) != len(member_ids):
            raise ValidationError("member_ids에 중복된 멤버가 있습니다.")
        base_amt, rem_amt = divmod(total_krw, len(member_ids))
        base_bp, rem_bp = divmod(BASIS_POINT_TOTAL, len(member_ids))
        for i, mid in enumerate(member_ids):
            rows.append({
                "member_id": mid,
                "split_krw_amount": base_amt + (1 if i < rem_amt else 0),
                "percentage_bp": base_bp + (1 if i < rem_bp else 0),
            })
    else:
        items = split_data.get("splits") or []
        if not items:
            raise ValidationError(f"{split_type} 분할에는 splits 배열이 필요합니다.")
        member_ids = [to_int(i.get("member_id"), "splits[].member_id") for i in items]
        if len(set(member_ids)) != len(member_ids):
            raise ValidationError("splits에 중복된 member_id가 있습니다.")

        if split_type == "exact":
            for mid, item in zip(member_ids, items):
                amt = to_int(item.get("split_krw_amount"), "splits[].split_krw_amount")
                bp = (
                    int((Decimal(amt) * BASIS_POINT_TOTAL / total_krw).quantize(Decimal("1"), ROUND_HALF_UP))
                    if total_krw else 0
                )
                rows.append({"member_id": mid, "split_krw_amount": amt, "percentage_bp": bp})
        else:
            bps = [to_int(i.get("percentage_bp"), "splits[].percentage_bp", minimum=0) for i in items]
            if sum(bps) != BASIS_POINT_TOTAL:
                raise ValidationError(f"percentage_bp 합계가 10000(100%)이어야 합니다. (현재 {sum(bps)})")
            raw = [Decimal(total_krw) * bp / BASIS_POINT_TOTAL for bp in bps]
            amounts = [floor_int(r) for r in raw]
            leftover = total_krw - sum(amounts)
            for i in sorted(range(len(raw)), key=lambda k: raw[k] - amounts[k], reverse=True)[:leftover]:
                amounts[i] += 1
            for mid, amt, bp in zip(member_ids, amounts, bps):
                rows.append({"member_id": mid, "split_krw_amount": amt, "percentage_bp": bp})

    total = sum(r["split_krw_amount"] for r in rows)
    if total != total_krw:
        raise ValidationError(f"[금액 불일치] 분할 금액 합계({total}원) != 지출 총액({total_krw}원)")
    return split_type, rows


# ------------------------------------------------------------------
# 입력 검증
# ------------------------------------------------------------------
def _build_expense_payload(client, trip_id: int, data: Dict[str, Any], member_set: set) -> Dict[str, Any]:
    payer_member_id = to_int(data.get("payer_member_id"), "payer_member_id")
    ensure_members_in_trip(client, trip_id, [payer_member_id], member_set)

    cur = currency(data.get("currency"), default="KRW")
    amount = to_decimal(data.get("amount"), "amount")
    rate = to_decimal(data.get("exchange_rate"), "exchange_rate", required=False, positive=True)
    krw_amount = to_int(data.get("krw_amount"), "krw_amount", required=False)

    # krw_amount 자동 계산: KRW면 amount, 외화면 amount × exchange_rate (반올림)
    if krw_amount is None:
        if cur == "KRW":
            krw_amount = round_krw(amount)
        elif rate is not None:
            krw_amount = round_krw(amount * rate)
        else:
            raise ValidationError("외화 지출은 krw_amount 또는 exchange_rate 중 하나가 필요합니다.")

    original_expense_id = to_int(data.get("original_expense_id"), "original_expense_id", required=False)
    if original_expense_id is not None and not (
        client.table(TABLE_EXPENSES).select("id").eq("id", original_expense_id).eq("trip_id", trip_id).execute().data
    ):
        raise ValidationError(f"original_expense_id({original_expense_id})가 이 여행의 지출이 아닙니다.")

    return {
        "trip_id": trip_id,
        "payer_member_id": payer_member_id,
        "entry_type": choice(data.get("entry_type"), "entry_type", ENTRY_TYPES, "manual"),
        "original_expense_id": original_expense_id,
        "title": text(data.get("title"), "title", required=True, max_len=100),
        "category": text(data.get("category"), "category", max_len=50) or "기타",
        "amount": numeric_out(amount),
        "currency": cur,
        "exchange_rate": decimal_text(rate),
        "rate_date": to_date(data.get("rate_date"), "rate_date"),
        "krw_amount": krw_amount,
        "payment_method": (text(data.get("payment_method"), "payment_method", max_len=50) or "card").lower(),
        "split_type": choice(data.get("split_type"), "split_type", SPLIT_TYPES, "equal", SPLIT_TYPE_ALIASES),
        "spent_at": to_datetime(data.get("spent_at"), "spent_at") or now_iso(),
        "receipt_image_path": text(data.get("receipt_image_path"), "receipt_image_path"),
    }


# ------------------------------------------------------------------
# 등록 / 수정 / 삭제
# ------------------------------------------------------------------
def create_expense_with_splits(
    trip_id: int,
    expense_data: Dict[str, Any],
    split_data: Optional[Dict[str, Any]] = None,
    card_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    지출 + 분할 (+ 카드 이벤트 연결).
    split_data 생략 시 여행 전체 멤버 균등 분할. 분할 저장 실패 시 지출 삭제.
    """
    client = get_supabase_client()
    trip_id = to_int(trip_id, "trip_id")
    get_trip_or_404(client, trip_id)
    member_set = trip_member_ids(client, trip_id)

    split_data = dict(split_data or {})
    if not split_data.get("split_type") and expense_data.get("split_type"):
        split_data["split_type"] = expense_data["split_type"]

    payload = _build_expense_payload(client, trip_id, expense_data, member_set)
    split_type, rows = build_splits(payload["krw_amount"], split_data, sorted(member_set))
    ensure_members_in_trip(client, trip_id, [r["member_id"] for r in rows], member_set)
    payload["split_type"] = split_type

    card_event = None
    if card_event_id:
        card_event = check_linkable(client, str(card_event_id))
        if payload["entry_type"] == "manual":
            payload["entry_type"] = "auto_card"

    expense = first(db_call("지출 등록", lambda: client.table(TABLE_EXPENSES).insert(payload).execute()))
    try:
        for r in rows:
            r.update({"trip_id": trip_id, "expense_id": expense["id"]})
        splits = db_call("지출 분할 저장", lambda: client.table(TABLE_EXPENSE_SPLITS).insert(rows).execute()).data
    except Exception:
        client.table(TABLE_EXPENSES).delete().eq("id", expense["id"]).execute()
        raise

    linked = db_call("카드 이벤트 연결", lambda: link_card_event(client, card_event, expense)) if card_event else []
    return {"expense": expense, "splits": splits or rows, "linked_card_event_ids": linked}


def update_expense(
    trip_id: int, expense_id: int, expense_data: Dict[str, Any], split_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    지출 수정 (바꿀 필드만). split_data가 있으면 분할 교체.
    원화 금액이 바뀌었는데 split_data가 없으면: equal → 같은 멤버로 재계산, 그 외 → 400
    """
    client = get_supabase_client()
    trip_id, expense_id = to_int(trip_id, "trip_id"), to_int(expense_id, "expense_id")
    current = first(client.table(TABLE_EXPENSES).select("*").eq("id", expense_id).eq("trip_id", trip_id).execute())
    if not current:
        raise NotFoundError(f"이 여행에 존재하지 않는 지출입니다 (expense_id: {expense_id}).")

    member_set = trip_member_ids(client, trip_id)
    merged = {**current, **expense_data}
    if any(k in expense_data for k in ("amount", "currency", "exchange_rate")) and "krw_amount" not in expense_data:
        merged["krw_amount"] = None  # 다시 계산
    payload = _build_expense_payload(client, trip_id, merged, member_set)
    payload.pop("trip_id")

    old_splits = client.table(TABLE_EXPENSE_SPLITS).select("*").eq("expense_id", expense_id).execute().data or []
    new_rows = None
    if split_data:
        payload["split_type"], new_rows = build_splits(payload["krw_amount"], split_data, sorted(member_set))
    elif payload["krw_amount"] != int(current["krw_amount"]):
        if str(current.get("split_type") or "").lower() != "equal":
            raise ValidationError("금액이 변경되었습니다. 직접/비율 분할 지출은 split을 함께 보내주세요.")
        _, new_rows = build_splits(
            payload["krw_amount"], {"split_type": "equal", "member_ids": sorted(s["member_id"] for s in old_splits)}
        )
    if new_rows is not None:
        ensure_members_in_trip(client, trip_id, [r["member_id"] for r in new_rows], member_set)

    updated = first(db_call("지출 수정", lambda: client.table(TABLE_EXPENSES).update(payload).eq("id", expense_id).execute()))

    splits = old_splits
    if new_rows is not None:
        for r in new_rows:
            r.update({"trip_id": trip_id, "expense_id": expense_id})
        client.table(TABLE_EXPENSE_SPLITS).delete().eq("expense_id", expense_id).execute()
        try:
            splits = db_call("지출 분할 교체", lambda: client.table(TABLE_EXPENSE_SPLITS).insert(new_rows).execute()).data
        except Exception:
            keep = ("trip_id", "expense_id", "member_id", "split_krw_amount", "percentage_bp")
            restore = [{k: s[k] for k in keep} for s in old_splits]
            if restore:
                client.table(TABLE_EXPENSE_SPLITS).insert(restore).execute()
            raise
    return {"expense": updated or {**current, **payload}, "splits": splits}


def delete_expense(trip_id: int, expense_id: int) -> Dict[str, Any]:
    """지출 삭제. 분할은 CASCADE 삭제, 연결된 카드 이벤트는 다시 '미등록'으로."""
    client = get_supabase_client()
    trip_id, expense_id = to_int(trip_id, "trip_id"), to_int(expense_id, "expense_id")
    if not client.table(TABLE_EXPENSES).select("id").eq("id", expense_id).eq("trip_id", trip_id).execute().data:
        raise NotFoundError(f"이 여행에 존재하지 않는 지출입니다 (expense_id: {expense_id}).")
    client.table(TABLE_CARD_EVENTS).update({"expense_id": None}).eq("expense_id", expense_id).execute()
    db_call("지출 삭제", lambda: client.table(TABLE_EXPENSES).delete().eq("id", expense_id).execute())
    return {"deleted_expense_id": expense_id}


# ------------------------------------------------------------------
# 조회
# ------------------------------------------------------------------
def _attach_names(client, trip_id: int, expenses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not expenses:
        return []
    ids = [e["id"] for e in expenses]
    splits = client.table(TABLE_EXPENSE_SPLITS).select("*").in_("expense_id", ids).execute().data or []
    names = member_name_map(client, trip_id)
    by_expense: Dict[int, List[Dict[str, Any]]] = {}
    for s in splits:
        s["member_nickname"] = names.get(s["member_id"], UNKNOWN_NICKNAME)
        by_expense.setdefault(s["expense_id"], []).append(s)
    for e in expenses:
        e["payer_nickname"] = names.get(e["payer_member_id"], UNKNOWN_NICKNAME)
        e["splits"] = sorted(by_expense.get(e["id"], []), key=lambda x: x["member_id"])
    return expenses


def list_expenses(
    trip_id: int,
    category: Optional[str] = None,
    payer_member_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """지출 목록 + 분할 (최근 순). 날짜만 주면 기본 시간대 기준 하루 전체 포함."""
    client = get_supabase_client()
    q = client.table(TABLE_EXPENSES).select("*").eq("trip_id", trip_id)
    if category:
        q = q.eq("category", category)
    if payer_member_id:
        q = q.eq("payer_member_id", payer_member_id)
    tz_suffix = datetime.now(settings.default_tz).isoformat()[-6:]
    if date_from:
        q = q.gte("spent_at", f"{date_from}T00:00:00{tz_suffix}" if len(date_from) == 10 else date_from)
    if date_to:
        q = q.lte("spent_at", f"{date_to}T23:59:59.999999{tz_suffix}" if len(date_to) == 10 else date_to)
    q = q.order("spent_at", desc=True)
    if limit:
        q = q.range(offset, offset + limit - 1)
    return _attach_names(client, trip_id, q.execute().data or [])


def get_expense(trip_id: int, expense_id: int) -> Dict[str, Any]:
    """지출 1건 + 분할 (없으면 404)"""
    client = get_supabase_client()
    row = first(client.table(TABLE_EXPENSES).select("*").eq("id", expense_id).eq("trip_id", trip_id).execute())
    if not row:
        raise NotFoundError(f"이 여행에 존재하지 않는 지출입니다 (expense_id: {expense_id}).")
    return _attach_names(client, trip_id, [row])[0]
