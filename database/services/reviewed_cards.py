"""여행별 카드 승인과 취소 지출 등록."""

from decimal import Decimal, ROUND_FLOOR
from uuid import UUID, uuid4

from core.db import TABLE_CARD_EVENTS, TABLE_EXPENSES, get_supabase_client
from core.errors import ConflictError, NotFoundError, ValidationError
from core.validators import currency, db_call, first, now_iso, round_krw, text, to_datetime, to_decimal, to_int
from services import card_events, expenses
from services.common import ensure_members_in_trip

REFUND_TYPES = ("cancel", "cancellation", "partial_cancellation")


class DuplicateCardEvent(ConflictError):
    code_name = "DUPLICATE_CARD_EVENT"


def positive_amount(value):
    amount = to_decimal(value, "amount", positive=True)
    if amount >= Decimal("1000000000000") or amount.as_tuple().exponent < -2:
        raise ValidationError("결제액은 정수 12자리, 소수점 2자리 이내로 입력해주세요.")
    return amount


def event_uuid(value):
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise ValidationError("event_id는 UUID여야 합니다.") from None


def register(trip_id, body):
    from services.v1_expenses import expense_input

    client = get_supabase_client()
    payer = to_int(body.get("payer_member_id"), "payer_member_id", minimum=1)
    ensure_members_in_trip(client, trip_id, [payer])
    existing_id = body.get("card_event_id")
    # Older teammate importers used short event IDs; new manual/phone messages get UUIDs.
    event_id = text(existing_id, "card_event_id", required=True, max_len=36) if existing_id else event_uuid(body.get("event_id") or uuid4())
    event = first(client.table(TABLE_CARD_EVENTS).select("*").eq("event_id", event_id).execute())
    if event:
        if event.get("trip_id") != trip_id or event.get("payer_member_id") != payer:
            raise NotFoundError("해당 여행·결제자의 카드 이벤트를 찾을 수 없습니다.")
        if event.get("expense_id"):
            raise DuplicateCardEvent("이미 등록된 카드 이벤트입니다.")
        if not existing_id and event.get("source") != "manual":
            raise ConflictError("이미 다른 수신 건에 사용된 event_id입니다.")
    elif existing_id:
        raise NotFoundError("해당 여행·결제자의 카드 이벤트를 찾을 수 없습니다.")

    reviewed = {**(event or {}), **body}
    if "event_type" in body and body["event_type"] not in ("approval", *REFUND_TYPES):
        raise ValidationError("event_type이 올바르지 않습니다.")
    kind = reviewed.get("event_type", "approval")
    if event and ((event.get("event_type") in REFUND_TYPES) != (kind in REFUND_TYPES)):
        raise ValidationError("수신한 승인·취소 구분을 변경할 수 없습니다.")
    amount = positive_amount(reviewed.get("amount"))
    cur = currency(reviewed.get("currency"))
    issuer = text(reviewed.get("issuer"), "issuer", max_len=50)
    ref = text(reviewed.get("approval_ref"), "approval_ref", max_len=50)
    merchant = text(reviewed.get("merchant"), "merchant", max_len=100)
    title = text(body.get("title") or merchant or "카드 결제", "title", max_len=100)
    occurred = to_datetime(reviewed.get("occurred_at"), "occurred_at")
    if event and kind in REFUND_TYPES:
        if positive_amount(event["amount"]) != amount or event["currency"] != cur:
            raise ValidationError("취소 금액과 통화는 수신한 카드 이벤트와 일치해야 합니다.")
    if kind == "approval":
        approved = {**body, "title": title, "amount": str(amount), "currency": cur, "payer_member_id": payer,
                    "entry_type": "auto_card", "payment_method": "card"}
        approved.pop("occurred_at", None)
        if occurred or body.get("spent_at"):
            approved["occurred_at"] = occurred or body["spent_at"]
        payload, split = expense_input(approved)
        # Validate the reviewed total and split before creating a manual event.
        member_ids = {m["id"] for m in client.table("trip_members").select("id").eq("trip_id", trip_id).execute().data}
        expense = expenses._build_expense_payload(client, trip_id, payload, member_ids)
        _, splits = expenses.build_splits(expense["krw_amount"], split or {}, sorted(member_ids))
        ensure_members_in_trip(client, trip_id, [s["member_id"] for s in splits], member_ids)
    else:
        original = _find_original(client, trip_id, payer, cur, body.get("original_expense_id"), issuer, ref)
        refund = _refund_plan(client, original, amount, kind, occurred or to_datetime(body.get("spent_at"), "spent_at") or now_iso(), title)

    if not event:
        event, _ = card_events.insert_card_event({
            "event_id": event_id, "trip_id": trip_id, "payer_member_id": payer,
            "source": "manual", "issuer": issuer, "event_type": kind, "amount": format(amount.normalize(), "f"),
            "currency": cur, "merchant": merchant, "approval_ref": ref, "occurred_at": occurred,
        })
        if (event.get("trip_id"), event.get("payer_member_id"), event.get("source")) != (trip_id, payer, "manual"):
            raise ConflictError("이미 다른 수신 건에 사용된 event_id입니다.")
    if event.get("expense_id"):
        raise DuplicateCardEvent("같은 카드 결제가 이미 지출로 등록됐습니다.")
    if kind == "approval":
        try:
            saved = expenses.create_expense_with_splits(trip_id, payload, split, event_id)["expense"]
        except ConflictError as exc:
            raise DuplicateCardEvent(exc.message) from exc
    else:
        saved = _commit_refund(client, event, original, refund)
    return {"card_event_id": event_id, "expense_id": saved["id"], "status": "registered", "krw_amount": saved["krw_amount"]}


def _find_original(client, trip_id, payer, currency_code, original_id, issuer, ref):
    if not original_id and ref and issuer:
        rows = (client.table(TABLE_CARD_EVENTS).select("expense_id")
                .eq("issuer", issuer).eq("approval_ref", ref).eq("event_type", "approval").eq("currency", currency_code)
                .eq("trip_id", trip_id).eq("payer_member_id", payer).not_.is_("expense_id", "null").execute().data)
        ids = {r["expense_id"] for r in rows}
        if len(ids) == 1:
            original_id = ids.pop()
    if not original_id:
        raise ValidationError("취소할 원 승인 지출(original_expense_id)을 선택해주세요.")
    original = expenses.get_expense(trip_id, to_int(original_id, "original_expense_id", minimum=1))
    if (original["entry_type"] != "auto_card" or original["payer_member_id"] != payer
            or original["currency"] != currency_code or Decimal(str(original["amount"])) <= 0):
        raise ValidationError("원 승인 지출의 여행·결제자·통화를 확인해주세요.")
    return original


def _refund_plan(client, original, amount, kind, spent, title):
    previous = (client.table(TABLE_EXPENSES).select("id,amount,krw_amount")
                .eq("original_expense_id", original["id"]).eq("entry_type", "cancellation").execute().data or [])
    refunded = -sum((Decimal(str(r["amount"])) for r in previous), Decimal(0))
    refunded_krw = -sum(r["krw_amount"] for r in previous)
    total = Decimal(str(original["amount"]))
    remaining = total - refunded
    if amount > remaining or (kind == "cancellation" and amount != remaining) or (kind == "partial_cancellation" and amount >= remaining):
        raise ValidationError("취소 금액과 남은 원 승인 금액을 확인해주세요.")
    # Use the original billed amount. The final refund returns all rounding remainders.
    krw = round_krw(Decimal(original["krw_amount"]) * (refunded + amount) / total) - refunded_krw
    balances = {s["member_id"]: s["split_krw_amount"] for s in original["splits"]}
    if previous:
        rows = (client.table("expense_splits").select("member_id,split_krw_amount")
                .in_("expense_id", [r["id"] for r in previous]).execute().data)
        for row in rows:
            balances[row["member_id"]] += row["split_krw_amount"]
    weight = sum(balances.values())
    if any(v < 0 for v in balances.values()) or weight < krw or not balances:
        raise ConflictError("원 승인 금액과 분담 내역을 확인해주세요.")
    portions = {m: Decimal(krw * v) / weight if weight else Decimal(0) for m, v in balances.items()}
    credits = {m: int(v.to_integral_value(rounding=ROUND_FLOOR)) for m, v in portions.items()}
    for m in sorted(credits, key=lambda m: (credits[m] - portions[m], m))[:krw-sum(credits.values())]:
        credits[m] += 1
    return {
        "seen_amount": str(refunded), "title": title, "spent_at": spent, "amount": str(-amount), "krw_amount": -krw,
        "splits": [{"member_id": m, "split_krw_amount": -v, "percentage_bp": 0} for m, v in credits.items()],
    }


def _commit_refund(client, event, original, refund):
    if (event.get("source") == "app_push" and "auto_registration_skipped" not in event
            and event.get("occurred_at") and event.get("approval_ref") and event.get("issuer")):
        # On older databases, migration 003 may claim multiple identical pending refunds.
        # Leave them unlinked until the exact-receipt procedure in 006 is available.
        matches = client.table(TABLE_CARD_EVENTS).select("event_id").is_("expense_id", "null")
        for field in ("trip_id", "payer_member_id", "issuer", "approval_ref",
                      "event_type", "amount", "currency", "occurred_at"):
            matches = matches.eq(field, event[field])
        if any(row["event_id"] != event["event_id"] for row in matches.limit(2).execute().data or []):
            raise ValidationError("같은 시각과 금액의 취소 알림이 여러 건입니다. DB 업데이트 후 다시 시도해주세요.")
    def commit():
        try:
            return client.rpc("confirm_card_refund", {"p_event_id": event["event_id"], "p_original_id": original["id"],
                                                      "p_refund": refund}).execute().data
        except Exception as exc:
            if getattr(exc, "code", None) in ("40001", "P0001"):
                raise ConflictError("취소 내역이 변경됐습니다. 새로고침 후 확인해주세요.") from exc
            raise
    return db_call("취소 지출 등록", commit)
