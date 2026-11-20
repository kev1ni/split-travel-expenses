"""휴대폰에 발급하는 여행·결제자 범위의 쓰기 전용 토큰과 수신 규약."""

import re
from uuid import UUID

from itsdangerous import BadData, URLSafeSerializer

from config import settings
from core.db import TABLE_TRIP_MEMBERS, get_supabase_client
from core.errors import AppError, AuthError, ValidationError
from core.validators import currency, first, text, to_datetime, to_decimal, to_int
from services.common import get_trip_or_404
from services.users import login_user


def signer():
    if not settings.collector_signing_key:
        raise AppError("휴대폰 연결을 사용하려면 서버에 COLLECTOR_SIGNING_KEY를 설정하세요.", 503)
    return URLSafeSerializer(settings.collector_signing_key, salt="ntrip.collector.write.v1")


def issue_token(data):
    signing = signer()
    account = login_user({"login_id": data.get("login_id"), "password": data.get("password")})
    trip_id = to_int(data.get("trip_id"), "trip_id", minimum=1)
    payer_id = to_int(data.get("payer_member_id"), "payer_member_id", minimum=1)
    client = get_supabase_client()
    trip = get_trip_or_404(client, trip_id)
    member = first(client.table(TABLE_TRIP_MEMBERS).select("user_id")
                   .eq("trip_id", trip_id).eq("id", payer_id).execute())
    if member is None or account["id"] not in (trip["created_by"], member["user_id"]):
        raise AppError("이 결제자의 휴대폰 연결 권한이 없습니다.", 403)
    return signing.dumps([trip_id, payer_id])


def read_scope(authorization):
    signing = signer()
    kind, _, token = (authorization or "").partition(" ")
    if kind.lower() != "bearer" or not token or len(token) > 2048:
        raise AuthError("휴대폰 연결 토큰이 필요합니다.")
    try:
        trip_id, payer_id = signing.loads(token)
    except (BadData, ValueError, TypeError):
        raise AuthError("휴대폰 연결 토큰이 유효하지 않습니다.") from None
    return trip_id, payer_id


def event_payload(body, scope):
    if {"trip_id", "payer_member_id", "expense_id"} & body.keys():
        raise ValidationError("여행과 결제자는 휴대폰 연결 토큰에서 결정합니다.")
    try:
        event_id = str(UUID(str(body.get("event_id"))))
    except ValueError:
        raise ValidationError("event_id에는 수신 시 생성한 UUID가 필요합니다.") from None
    source = body.get("source")
    if source not in ("message", "app_push") or body.get("event_type") not in ("approval", "cancel"):
        raise ValidationError("source 또는 event_type을 확인해주세요.")
    if body.get("message_format") not in (None, "sms", "mms", "rcs") or (
        source == "app_push" and body.get("message_format") is not None
    ):
        raise ValidationError("message_format을 확인해주세요.")
    amount = str(body.get("amount", ""))
    if not re.fullmatch(r"[0-9]{1,12}(?:\.[0-9]{1,2})?", amount):
        raise ValidationError("amount는 소수점 두 자리 이내의 결제 금액이어야 합니다.")
    # Store a canonical amount so notifications from different platforms compare equally.
    value = to_decimal(amount, "amount", positive=True)
    return {
        "trip_id": scope[0], "payer_member_id": scope[1], "event_id": event_id,
        "source": source, "message_format": body.get("message_format"), "event_type": body["event_type"],
        "amount": format(value.normalize(), "f"), "currency": currency(body.get("currency")),
        "issuer": text(body.get("issuer"), "issuer", required=True, max_len=50),
        "merchant": text(body.get("merchant"), "merchant", max_len=100),
        "approval_ref": text(body.get("approval_ref"), "approval_ref", max_len=50),
        "occurred_at": to_datetime(body.get("occurred_at"), "occurred_at"),
        "received_at": to_datetime(body.get("received_at"), "received_at", required=True),
    }
