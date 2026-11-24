"""카드 알림 수신, 재전송 처리, 미등록 목록과 지출 연결."""

from datetime import datetime

from config import settings
from core.db import TABLE_CARD_EVENTS, get_supabase_client
from core.errors import ConflictError, NotFoundError
from core.validators import currency, db_call, first, now_iso, text, to_datetime, to_int
from services.common import ensure_members_in_trip, get_trip_or_404

CARD_EVENT_FIELDS = {
    "event_id", "trip_id", "payer_member_id", "expense_id",
    "source", "message_format", "issuer", "event_type",
    "amount", "currency", "merchant", "approval_ref", "occurred_at", "received_at",
}

DISCARDED_SOURCES = ("deleted:message", "deleted:app_push")
PUSH_SOURCES = ("app_push", "push")


def was_skipped(event):
    return bool(event.get("auto_registration_skipped")) or event.get("source") in DISCARDED_SOURCES


def public_event(event):
    if event.get("source") in DISCARDED_SOURCES:
        return {**event, "source": event["source"].split(":", 1)[1], "auto_registration_skipped": True}
    return event


def _payment_fields(event):
    """같은 여행·결제자 안에서 승인번호와 결제 내용이 모두 같은 알림만 연결한다."""
    if (not event.get("source") or event["source"] in PUSH_SOURCES
            or not event.get("approval_ref") or not event.get("issuer")):
        return {}
    fields = {key: event.get(key) for key in ("approval_ref", "issuer", "event_type", "amount", "currency")}
    if event.get("event_type") in ("cancel", "cancellation", "partial_cancellation"):
        # 같은 승인에 대한 동일 금액의 부분 취소가 여러 번 발생할 수 있다.
        if not event.get("occurred_at"):
            return {}
        fields["occurred_at"] = event["occurred_at"]
    return fields


def _match(query, fields):
    for key, value in fields.items():
        query = query.is_(key, "null") if value is None else query.eq(key, value)
    return query


def _scope(event):
    return {key: event.get(key) for key in ("trip_id", "payer_member_id")}


def _linked_sibling(client, event):
    fields = _payment_fields(event)
    if not fields:
        return None
    q = (client.table(TABLE_CARD_EVENTS).select("trip_id,payer_member_id,expense_id")
         .not_.is_("expense_id", "null").not_.in_("source", PUSH_SOURCES))
    if event.get("trip_id") is not None or settings.collector_signing_key:
        fields.update(_scope(event))
    rows = _match(q, fields).execute().data or []
    # Legacy, unscoped imports may match an old linked row only when there is a single candidate expense.
    return rows[0] if len({r["expense_id"] for r in rows}) == 1 else None


def _retry_response(existing, payload, scoped):
    if scoped:
        if _scope(existing) != _scope(payload):
            raise ConflictError("이미 사용 중인 event_id입니다.")
        for key in ("source", "message_format", "issuer", "event_type", "amount", "currency", "merchant",
                    "approval_ref", "received_at", "occurred_at"):
            before, after = public_event(existing).get(key), payload.get(key)
            if key.endswith("_at") and before and after:
                before = datetime.fromisoformat(before.replace("Z", "+00:00"))
                after = datetime.fromisoformat(after.replace("Z", "+00:00"))
            if before != after:
                raise ConflictError("기존 event_id와 수신 내용이 다릅니다.")
    return existing, False


def insert_card_event(event_data, *, scoped=False):
    client = get_supabase_client()
    def table():
        return client.table(TABLE_CARD_EVENTS)
    payload = {k: v for k, v in event_data.items() if k in CARD_EVENT_FIELDS}
    payload["event_id"] = text(payload.get("event_id"), "event_id", required=True, max_len=36)
    for key in ("trip_id", "payer_member_id", "expense_id"):
        payload[key] = to_int(payload.get(key), key, required=False)
    if payload["trip_id"]:
        get_trip_or_404(client, payload["trip_id"])
        if payload["payer_member_id"]:
            ensure_members_in_trip(client, payload["trip_id"], [payload["payer_member_id"]])
    def find_existing():
        return first(table().select("*").eq("event_id", payload["event_id"]).execute())
    existing = find_existing()
    if existing:
        saved, created = _retry_response(existing, payload, scoped)
        return (saved if scoped else attach_late_event(client, saved)), created
    payload["currency"] = currency(payload.get("currency"), default="KRW")
    for key in ("occurred_at", "received_at"):
        payload[key] = to_datetime(payload.get(key), key)
    payload["received_at"] = payload["received_at"] or now_iso()
    if payload.get("amount") is not None:
        payload["amount"] = str(payload["amount"]).strip()

    def insert():
        try:
            return first(table().insert(payload).execute()) or payload, True
        except Exception as exc:
            if getattr(exc, "code", None) == "23505":
                winner = find_existing()
                if winner:
                    return _retry_response(winner, payload, scoped)
            raise

    saved, created = db_call("카드 이벤트 저장", insert)
    return (saved if scoped else attach_late_event(client, saved)), created


def attach_late_event(client, event):
    if event.get("expense_id") is not None or was_skipped(event):
        return event
    sibling = _linked_sibling(client, event)
    if not sibling:
        return event
    patch = {k: sibling[k] for k in ("trip_id", "payer_member_id", "expense_id")}
    updated = first(client.table(TABLE_CARD_EVENTS).update(patch).eq("event_id", event["event_id"])
                    .is_("expense_id", "null").execute())
    return updated or first(client.table(TABLE_CARD_EVENTS).select("*").eq("event_id", event["event_id"]).execute()) or event


def list_unassigned(limit=20, trip_id=None, payer_member_id=None, scoped=False):
    q = get_supabase_client().table(TABLE_CARD_EVENTS).select("*").is_("expense_id", "null")
    if trip_id:
        q = q.eq("trip_id", trip_id) if scoped else q.or_(f"trip_id.eq.{int(trip_id)},trip_id.is.null")
    if payer_member_id:
        q = q.eq("payer_member_id", payer_member_id)
    rows = q.order("received_at", desc=True).limit(limit * 3).execute().data or []
    result, groups = [], {}
    for ev in rows:
        if was_skipped(ev):
            continue
        fields = _payment_fields(ev)
        key = tuple({**_scope(ev), **fields}.items()) if fields else None
        if key and key in groups:
            groups[key]["duplicate_event_ids"].append(ev["event_id"])
        elif len(result) < limit:
            ev["duplicate_event_ids"] = []
            if key:
                groups[key] = ev
            result.append(ev)
    return result


def check_linkable(client, card_event_id, trip_id, payer_id):
    ev = first(client.table(TABLE_CARD_EVENTS).select("*").eq("event_id", card_event_id).execute())
    if not ev or ev.get("trip_id") not in (None, trip_id):
        raise NotFoundError("이 여행에서 카드 이벤트를 찾을 수 없습니다.")
    if ev.get("payer_member_id") not in (None, payer_id):
        raise ConflictError("이 카드 이벤트의 결제자를 확인해주세요.")
    if ev.get("expense_id") or was_skipped(ev) or _linked_sibling(client, ev):
        raise ConflictError("이미 지출로 등록된 카드 이벤트입니다.")
    return ev


def link_card_event(client, event, expense):
    patch = {"trip_id": expense["trip_id"], "payer_member_id": expense["payer_member_id"], "expense_id": expense["id"]}
    fields = _payment_fields(event)
    q = client.table(TABLE_CARD_EVENTS).update(patch).is_("expense_id", "null")
    if fields:
        q = q.not_.in_("source", PUSH_SOURCES)
    else:
        fields = {"event_id": event["event_id"]}
    claimed = _match(q, {**_scope(event), **fields}).execute().data or []
    ids = sorted(r["event_id"] for r in claimed)
    if event["event_id"] not in ids:
        raise ConflictError("이미 지출로 등록된 카드 이벤트입니다.")
    return ids
