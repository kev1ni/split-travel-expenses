"""Translate the public expense contract into the team's expense and split model."""

from datetime import datetime
from decimal import Decimal

from config import settings
from core.errors import ValidationError
from core.validators import currency, to_date, to_datetime, to_decimal, to_int, to_number


def expense_input(data, current=None):
    if not isinstance(data, dict):
        raise ValidationError("지출 정보를 JSON 객체로 보내주세요.")
    previous = current or {}
    payload = {key: data[key] for key in ("title", "category", "payer_member_id") if key in data}
    if "occurred_at" in data:
        payload["spent_at"] = to_datetime(data["occurred_at"], "occurred_at", required=True)
    method = data.get("payment_method", previous.get("payment_method") or "cash")
    if method not in ("cash", "card"):
        raise ValidationError("payment_method는 cash 또는 card입니다.")
    payload["payment_method"] = method
    kind = data.get("entry_type", previous.get("entry_type") or "manual")
    if kind not in ("manual", "card_message", "auto_card"):
        raise ValidationError("취소는 원본 지출과 연결된 카드 이벤트로 등록해 주세요.")
    payload["entry_type"] = "auto_card" if kind in ("auto_card", "card_message") else "manual"
    if not current or {"amount", "currency", "exchange_rate", "rate_date"} & data.keys():
        cur = currency(data.get("currency", previous.get("currency")), default="KRW")
        amount = to_decimal(data.get("amount", previous.get("amount")), "amount", positive=True)
        if amount >= 10**12 or amount != amount.quantize(Decimal("0.01")):
            raise ValidationError("amount는 소수 두 자리 이내의 결제 금액이어야 합니다.")
        reused_rate = previous.get("exchange_rate") if previous.get("currency") == cur else None
        rate = to_decimal(data.get("exchange_rate", 1 if cur == "KRW" else reused_rate),
                          "exchange_rate", positive=True)
        if cur == "KRW" and rate != 1:
            raise ValidationError("KRW 환율은 1입니다.")
        if rate >= 10**12 or rate != rate.quantize(Decimal("0.000001")) or amount * rate > 2147483647:
            raise ValidationError("환율 또는 환산액이 저장 가능한 범위를 넘습니다.")
        day = previous.get("rate_date") if previous.get("currency") == cur else None
        effective_day = data.get("rate_date") or day or (payload.get("spent_at") or previous.get("spent_at")
                                                       or datetime.now(settings.default_tz).isoformat())[:10]
        payload.update(amount=str(amount), currency=cur, exchange_rate=str(rate),
                       rate_date=to_date(effective_day, "rate_date", required=True))

    split = None
    if "splits" in data or "split_type" in data:
        mode = data.get("split_type", previous.get("split_type") or "equal")
        items = data.get("splits")
        if items is not None and (not isinstance(items, list) or not items or
                                  not all(isinstance(row, dict) for row in items)):
            raise ValidationError("splits는 멤버를 한 명 이상 포함하는 배열이어야 합니다.")
        if mode == "equal":
            split = {"split_type": "equal"}
            if items is not None:
                split["member_ids"] = sorted(to_int(row.get("member_id"), "member_id", minimum=1) for row in items)
        elif mode in ("custom", "exact") and items:
            split = {"split_type": "exact", "splits": [
                {"member_id": row.get("member_id"),
                 "split_krw_amount": to_int(row.get("krw_amount", row.get("split_krw_amount")),
                                            "splits[].krw_amount", minimum=0)} for row in items]}
        else:
            raise ValidationError("custom 분할에는 멤버별 krw_amount가 필요합니다.")
    return payload, split


def expense_view(row, splits=None):
    result = dict(row)
    result["occurred_at"] = result.get("spent_at")
    result["entry_type"] = {"auto_card": "card_message"}.get(row["entry_type"], row["entry_type"])
    result["status"] = "cancellation" if row["entry_type"] == "cancellation" else "active"
    if row.get("split_type") == "exact":
        result["split_type"] = "custom"
    result["amount"] = to_number(row["amount"])
    if row.get("exchange_rate") is not None:
        result["exchange_rate"] = to_number(row["exchange_rate"])
    result["splits"] = [dict(item, krw_amount=item["split_krw_amount"])
                        for item in (row.get("splits", []) if splits is None else splits)]
    return result
