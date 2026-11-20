"""
카드 결제 파싱 데이터 (CARD_EVENTS): 수신, 미등록 목록, 지출 연결

같은 결제가 RCS·문자·앱푸시 등 여러 채널로 들어올 수 있으므로
(approval_ref + issuer + event_type)이 같으면 "같은 결제"로 봅니다.
"""

from typing import Any, Dict, List, Optional, Tuple

from core.db import TABLE_CARD_EVENTS, get_supabase_client
from core.errors import ConflictError, NotFoundError
from core.validators import currency, db_call, first, now_iso, text, to_datetime, to_int
from services.common import ensure_members_in_trip, get_trip_or_404

CARD_EVENT_FIELDS = {
    "event_id", "trip_id", "payer_member_id", "expense_id",
    "source", "message_format", "issuer", "event_type",
    "amount", "currency", "merchant", "approval_ref",
    "occurred_at", "received_at",
}


def _same_payment_key(ev: Dict[str, Any]) -> Optional[tuple]:
    if ev.get("approval_ref") and ev.get("issuer"):
        return ev["approval_ref"], ev["issuer"], ev.get("event_type")
    return None


def insert_card_event(event_data: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    파싱 JSON 저장. 반환: (card_event, created 여부)
    - 같은 event_id 재전송 → 저장하지 않고 기존 데이터 반환 (멱등성)
    - 같은 결제가 이미 지출로 연결돼 있으면 새 이벤트도 같은 지출에 자동 연결
    - CARD_EVENT_FIELDS 외의 필드는 무시
    """
    client = get_supabase_client()
    payload = {k: v for k, v in event_data.items() if k in CARD_EVENT_FIELDS}

    payload["event_id"] = text(payload.get("event_id"), "event_id", required=True, max_len=36)
    existing = first(client.table(TABLE_CARD_EVENTS).select("*").eq("event_id", payload["event_id"]).execute())
    if existing:
        return existing, False

    payload["currency"] = currency(payload.get("currency"), default="KRW")
    for f in ("trip_id", "payer_member_id", "expense_id"):
        payload[f] = to_int(payload.get(f), f, required=False)
    for f in ("occurred_at", "received_at"):
        payload[f] = to_datetime(payload.get(f), f)
    payload["received_at"] = payload["received_at"] or now_iso()
    if payload.get("amount") is not None:
        payload["amount"] = str(payload["amount"]).strip()

    if payload.get("trip_id"):
        get_trip_or_404(client, payload["trip_id"])
        if payload.get("payer_member_id"):
            ensure_members_in_trip(client, payload["trip_id"], [payload["payer_member_id"]])

    if not payload.get("expense_id") and _same_payment_key(payload):
        q = (
            client.table(TABLE_CARD_EVENTS).select("trip_id, payer_member_id, expense_id")
            .eq("approval_ref", payload["approval_ref"]).eq("issuer", payload["issuer"])
            .not_.is_("expense_id", "null")
        )
        if payload.get("event_type"):
            q = q.eq("event_type", payload["event_type"])
        sibling = first(q.limit(1).execute())
        if sibling:
            payload.update({k: sibling[k] for k in ("trip_id", "payer_member_id", "expense_id")})

    saved = first(db_call("카드 이벤트 저장", lambda: client.table(TABLE_CARD_EVENTS).insert(payload).execute()))
    return saved or payload, True


def list_unassigned(
    limit: int = 20, trip_id: Optional[int] = None, payer_member_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    지출로 연결되지 않은 카드 이벤트 (최근 수신 순).
    trip_id를 주면 그 여행 + 여행 미지정 이벤트만. 같은 결제는 한 건만 남기고
    나머지 event_id는 duplicate_event_ids에 담습니다.
    """
    client = get_supabase_client()
    q = client.table(TABLE_CARD_EVENTS).select("*").is_("expense_id", "null")
    if trip_id:
        q = q.or_(f"trip_id.eq.{int(trip_id)},trip_id.is.null")
    if payer_member_id:
        q = q.eq("payer_member_id", int(payer_member_id))
    rows = q.order("received_at", desc=True).limit(limit * 3).execute().data or []

    result: List[Dict[str, Any]] = []
    groups: Dict[tuple, Dict[str, Any]] = {}
    for ev in rows:
        key = _same_payment_key(ev)
        if key and key in groups:
            groups[key]["duplicate_event_ids"].append(ev["event_id"])
            continue
        if len(result) >= limit:
            continue
        ev["duplicate_event_ids"] = []
        if key:
            groups[key] = ev
        result.append(ev)
    return result


def check_linkable(client, card_event_id: str) -> Dict[str, Any]:
    """지출에 연결 가능한 이벤트인지 확인 (없으면 404, 이미 연결됐으면 409)"""
    ev = first(client.table(TABLE_CARD_EVENTS).select("*").eq("event_id", card_event_id).execute())
    if not ev:
        raise NotFoundError(f"존재하지 않는 카드 이벤트입니다 (event_id: {card_event_id}).")
    if ev.get("expense_id"):
        raise ConflictError(f"이미 지출(expense_id: {ev['expense_id']})로 등록된 카드 이벤트입니다.")
    return ev


def link_card_event(client, event: Dict[str, Any], expense: Dict[str, Any]) -> List[str]:
    """이벤트(+같은 결제의 다른 채널 이벤트)를 지출에 연결하고 연결된 event_id 목록 반환"""
    ids = {event["event_id"]}
    if _same_payment_key(event):
        q = (
            client.table(TABLE_CARD_EVENTS).select("event_id")
            .eq("approval_ref", event["approval_ref"]).eq("issuer", event["issuer"]).is_("expense_id", "null")
        )
        if event.get("event_type"):
            q = q.eq("event_type", event["event_type"])
        ids |= {r["event_id"] for r in (q.execute().data or [])}
    update = {"trip_id": expense["trip_id"], "payer_member_id": expense["payer_member_id"], "expense_id": expense["id"]}
    client.table(TABLE_CARD_EVENTS).update(update).in_("event_id", sorted(ids)).execute()
    return sorted(ids)
