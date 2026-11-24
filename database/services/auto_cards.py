"""Register scoped phone receipts on ingestion and retry older unlinked receipts."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from time import monotonic

from core.db import TABLE_CARD_EVENTS, get_supabase_client
from core.errors import AppError, ConflictError, ValidationError
from core.validators import currency, first, local_date, text, to_datetime
from services import card_events, collector, expenses, reference_rates, reviewed_cards
from services.v1_expenses import expense_input


def _rate(event, cache):
    day = local_date(event.get("occurred_at") or event["received_at"])
    if event["currency"] == "KRW":
        return Decimal(1), day
    # A phone can already be in tomorrow's time zone while the provider still publishes today.
    day = min(day, date.today().isoformat())
    key = (event["currency"], day)
    if key not in cache:
        try:
            quote = reference_rates.lookup(key[0], "KRW", day)
            rate = Decimal(str(quote["rate"])).quantize(Decimal(".000001"), rounding=ROUND_HALF_UP)
            cache[key] = (rate, quote["rate_date"]) if rate > 0 else None
        except AppError:
            cache[key] = None
    return cache[key]


def _register_approval(client, event, rate, rate_date):
    # The REST fallback also serves team deployments that predate migration 006.
    if "auto_registration_skipped" in event:
        try:
            return client.rpc("auto_register_card_approval", {
                "p_event_id": event["event_id"], "p_exchange_rate": str(rate), "p_rate_date": rate_date,
            }).execute().data
        except Exception as exc:
            if getattr(exc, "code", None) != "PGRST202":
                raise
    payload, split = expense_input({
        "payer_member_id": event["payer_member_id"], "title": event.get("merchant") or event.get("issuer") or "카드 결제",
        "occurred_at": event.get("occurred_at") or event["received_at"],
        "amount": event["amount"], "currency": event["currency"], "exchange_rate": str(rate), "rate_date": rate_date,
        "entry_type": "auto_card", "payment_method": "card", "split_type": "equal",
    })
    result = expenses.create_expense_with_splits(event["trip_id"], payload, split, event["event_id"])
    return result["expense"]["id"]


def register(event, rate_cache):
    if card_events.was_skipped(event):
        return card_events.public_event(event), "skipped"
    if event.get("expense_id"):
        return event, "registered"
    if (event.get("source") != "app_push" or not event.get("payer_member_id")
            or not collector.AMOUNT.fullmatch(str(event.get("amount", "")))):
        return event, "unrecognized"
    try:
        amount = reviewed_cards.positive_amount(event.get("amount"))
        if currency(event.get("currency")) != event.get("currency"):
            return event, "unrecognized"
        spent = to_datetime(event.get("occurred_at") or event.get("received_at") or event.get("created_at"),
                            "spent_at", required=True)
    except ValidationError:
        return event, "unrecognized"
    if not event.get("received_at"):
        event = {**event, "received_at": spent}
    client = get_supabase_client()
    try:
        if event.get("event_type") == "approval":
            quote = _rate(event, rate_cache)
            if quote is None:
                return event, "pending_rate"
            if amount * quote[0] > 2147483647:
                return event, "amount_out_of_range"
            expense_id = _register_approval(client, event, *quote)
            if expense_id is None:
                return {**event, "auto_registration_skipped": True}, "skipped"
        elif event.get("event_type") in reviewed_cards.REFUND_TYPES:
            if not event.get("issuer") or not event.get("approval_ref"):
                return event, "pending_original"
            try:
                result = reviewed_cards.register(event["trip_id"], {
                    "card_event_id": event["event_id"], "payer_member_id": event["payer_member_id"],
                    "spent_at": event.get("occurred_at") or event["received_at"],
                })
            except ValidationError:
                # No unique original, currency mismatch, or refund exceeds the remaining purchase.
                return event, "pending_original"
            expense_id = result["expense_id"]
        else:
            return event, "unrecognized"
    except ConflictError:
        # Another worker may already have committed this exact UUID.
        current = first(client.table(TABLE_CARD_EVENTS).select("*").eq("event_id", event["event_id"]).execute())
        if current and current.get("expense_id"):
            return current, "registered"
        raise
    return {**event, "expense_id": expense_id}, "registered"


def register_with_refunds(event, rate_cache):
    saved, status = register(event, rate_cache)
    if status == "registered" and saved["event_type"] == "approval" and saved.get("approval_ref"):
        # A refund can arrive before its purchase. Revisit only this payment's waiting refunds.
        client = get_supabase_client()
        refunds = (client.table(TABLE_CARD_EVENTS).select("*").eq("trip_id", saved["trip_id"])
                   .eq("payer_member_id", saved["payer_member_id"]).eq("issuer", saved["issuer"])
                   .eq("approval_ref", saved["approval_ref"]).eq("currency", saved["currency"])
                   .eq("source", "app_push").in_("event_type", list(reviewed_cards.REFUND_TYPES))
                   .is_("expense_id", "null").order("received_at").limit(10).execute().data or [])
        for refund in refunds:
            register(refund, rate_cache)
    return saved, status


def receive(payload):
    event, created = card_events.insert_card_event(payload, scoped=True)
    saved, status = register_with_refunds(event, {})
    if status == "pending_rate":
        # Keep the phone's outbox retryable, even if nobody opens the web page.
        raise AppError("카드 알림을 저장했어요. 기준 환율을 가져오면 지출에 반영합니다. 재전송할 수 있어요.", 503)
    return saved, created, status


def sync(trip_id, after=None):
    client = get_supabase_client()
    size = 12
    query = (client.table(TABLE_CARD_EVENTS).select("*").eq("trip_id", trip_id)
             .eq("source", "app_push").not_.is_("payer_member_id", "null").is_("expense_id", "null"))
    if after:
        query = query.gt("event_id", text(after, "after", required=True, max_len=36))
    rows = query.order("event_id").limit(size + 1).execute().data or []
    rate_cache, registered = {}, 0
    deadline = monotonic() + 5
    for position, event in enumerate(rows[:size], 1):
        if not card_events.was_skipped(event) and register_with_refunds(event, rate_cache)[1] == "registered":
            registered += 1
        if position < len(rows) and (position == size or monotonic() >= deadline):
            return {"registered_count": registered, "next_cursor": event["event_id"]}
    return {"registered_count": registered, "next_cursor": None}
