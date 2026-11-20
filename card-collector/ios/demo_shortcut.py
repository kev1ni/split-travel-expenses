"""Windows/Mac demonstration of the guide's text rules. Uses synthetic inputs only."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


PATTERN = re.compile(
    Path(__file__).with_name("demo-pattern.txt").read_text(encoding="utf-8").strip()
)
HYUNDAI_PATTERN = re.compile(
    Path(__file__).with_name("hyundai-nexon-message-pattern.txt")
    .read_text(encoding="utf-8").strip()
)
BODY = "해외승인 JPY 3,200 가맹점: SORA MART 승인번호: 00123456"


def parse_demo_alert(source, selected, text, received_at, profile="demo"):
    if not selected or source not in ("message", "app_push"):
        return None
    if profile == "hyundai_nexon_message" and source == "message":
        match = HYUNDAI_PATTERN.fullmatch(text)
        if not match:
            return None
        amount, merchant = match.groups()
        issuer, event_type, currency, approval_ref = "현대카드", "approval", "KRW", None
    elif profile == "demo":
        match = PATTERN.fullmatch(text)
        if not match:
            return None
        kind, currency, amount, merchant, approval_ref = match.groups()
        issuer = "데모카드"
        event_type = "cancel" if kind == "해외승인취소" else "approval"
    else:
        return None
    return {
        "event_id": str(uuid4()),
        "source": source,
        "message_format": None,
        "issuer": issuer,
        "event_type": event_type,
        "amount": amount.replace(",", ""),
        "currency": currency,
        "merchant": merchant,
        "approval_ref": approval_ref,
        "occurred_at": None,
        "received_at": received_at,
    }


def check_hyundai_message(received_at):
    # Fictional masked name, date and cumulative amount. Never use a cardholder's original body.
    text = "\n".join((
        "[Web발신]", "현대 넥슨 승인", "가*다", "1,400원 일시불",
        "08/09 17:40", "예시마트샘플점", "누적99,800원",
    ))

    def parse(text, selected=True, source="message"):
        return parse_demo_alert(source, selected, text, received_at, "hyundai_nexon_message")

    event = parse(text)
    assert event["issuer"] == "현대카드" and event["event_type"] == "approval"
    assert event["amount"] == "1400" and event["currency"] == "KRW"
    assert event["merchant"] == "예시마트샘플점" and event["message_format"] is None
    assert event["approval_ref"] is None and event["occurred_at"] is None
    output = json.dumps(event, ensure_ascii=False)
    assert not any(value in output for value in ("가*다", "99,800", "08/09 17:40", "[Web발신]"))
    assert HYUNDAI_PATTERN.groups == 2
    for separator in (" ", "  ", "\t", "\r\n", "\r", "\u2028", "\u2029", "\u00a0"):
        copied = "\u00a0\t" + text.replace("\n", separator) + "\r\n "
        match = HYUNDAI_PATTERN.fullmatch(copied)
        assert match and match.groups() == ("1,400", "예시마트샘플점")
    assert parse(text.replace(" ", "\u00a0"))["amount"] == "1400"
    assert parse(text.replace("[Web발신]\n", ""))["merchant"] == "예시마트샘플점"
    assert parse(text, selected=False) is None
    assert parse(text, source="app_push") is None
    assert parse_demo_alert("message", True, text, received_at, "demo") is None
    for old, new in (
        ("넥슨 승인", "넥슨 승인거절"), ("넥슨 승인", "넥슨 승인취소"),
        ("1,400원 일시불", "잔액 1,400원"), ("1,400원 일시불\n", ""),
        ("1,400원", "0원"), ("1,400원", "1,40원"),
        ("예시마트샘플점", '가게 "A"'), ("예시마트샘플점", "가게\\A"),
        ("예시마트샘플점", "인증번호 123456"), ("가*다", "인증번호 123456"),
        ("현대 넥슨", "다른 카드"), ("예시마트샘플점", "예시마트샘플점 OTP 123456"),
        ("예시마트샘플점", "예시마트샘플점 인증 번호 123456"),
        ("예시마트샘플점", "예시마트샘플점 누적123원"),
    ):
        changed = text.replace(old, new)
        assert parse(changed) is None and parse(changed.replace("\n", " ")) is None
    assert parse(text + "\n" + text) is None
    assert parse((text + "\n" + text).replace("\n", " ")) is None
    assert parse(text.replace("예시마트샘플점", "예시마트샘플점\n다른 지점")) is None
    return event


def run_demo():
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    hyundai = check_hyundai_message(now)
    message = parse_demo_alert("message", True, "[데모카드] " + BODY, now)
    push = parse_demo_alert("app_push", True, "[데모카드]\n" + BODY, now)
    for event in (message, push):
        assert event["event_type"] == "approval" and event["amount"] == "3200"
        assert event["approval_ref"] == "00123456" and event["merchant"] == "SORA MART"
        assert event["message_format"] is None and event["occurred_at"] is None
    assert message["event_id"] != push["event_id"]
    # Resending a saved payload preserves its ID. No network calls take place.
    assert json.loads(json.dumps(message)) == message
    cancel = parse_demo_alert("message", True, BODY.replace("해외승인", "해외승인취소"), now)
    assert cancel["event_type"] == "cancel" and cancel["amount"] == "3200"
    bare = parse_demo_alert("app_push", True, "해외승인 JPY 3200", now)
    assert bare["merchant"] is None and bare["approval_ref"] is None
    for excluded in (
        "해외승인 인증번호 123456 JPY 3,200",
        "해외승인거절 JPY 3,200",
        "이용가능잔액 JPY 3,200",
        BODY + "\n잔액 JPY 95,000",
        "해외승인 JPY 3,200 EUR 20",
        "해외승인 JPY 0",
        "해외승인 JPY 3,20",
        "해외승인 JPY 3,200.5",
        '해외승인 JPY 3200 가맹점: SHOP "X"',
        "본문 미리보기가 숨겨져 있습니다",
    ):
        assert parse_demo_alert("message", True, excluded, now) is None
    assert parse_demo_alert("message", False, BODY, now) is None
    assert parse_demo_alert("app_push", False, BODY, now) is None
    print(json.dumps([hyundai, message, push], ensure_ascii=False, indent=2))
    print("PASS: Hyundai Nexon KRW message, demo JPY message/push, cancellation, exclusions.")


if __name__ == "__main__":
    run_demo()
