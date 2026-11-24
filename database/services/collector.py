"""휴대폰에 발급하는 여행·결제자 범위의 쓰기 전용 토큰과 수신 규약."""

import re
from uuid import UUID

from flask import current_app
from itsdangerous import BadData, URLSafeSerializer

from config import settings
from core.db import TABLE_TRIP_MEMBERS, get_supabase_client
from core.errors import AppError, AuthError, ValidationError
from core.validators import currency, first, text, to_datetime, to_decimal, to_int
from core.web_session import active_session, identity, trip_member
from services.common import get_trip_or_404
from services.users import login_user


AMOUNT = re.compile(r"[0-9]{1,12}(?:\.[0-9]{1,2})?")


def reject_message(body):
    if ("message" in body or "raw_text" in body or body.get("message_format") is not None
            or body.get("source") not in (None, "app_push", "push", "manual")):
        raise AppError("카드 앱 푸시만 수집합니다.", 422)


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


def _session_signer():
    # The session hash identifies a revocable row, but cannot be used as a web login.
    return URLSafeSerializer(current_app.secret_key, salt="ntrip.collector.session.v2")


def connect_to_trip(trip_id):
    session = identity()
    if not session or session["user_id"] is None:
        raise AuthError("카드를 연결하려면 앱에서 로그인해 주세요.")
    member = trip_member(trip_id)
    trip = get_trip_or_404(get_supabase_client(), trip_id)
    scope = [trip_id, member["id"], session["user_id"], session["token_hash"]]
    return {"trip_id": trip_id, "trip_title": trip["title"], "payer_member_id": member["id"],
            "user_id": session["user_id"], "token": "v2." + _session_signer().dumps(scope)}


def read_scope(authorization):
    kind, _, token = (authorization or "").partition(" ")
    if kind.lower() != "bearer" or not token or len(token) > 2048:
        raise AuthError("휴대폰 연결 토큰이 필요합니다.")
    try:
        if not token.startswith("v2."):
            trip_id, payer_id = signer().loads(token)
            return trip_id, payer_id
        trip_id, payer_id, user_id, session_hash = _session_signer().loads(token[3:])
    except (BadData, ValueError, TypeError):
        raise AuthError("휴대폰 연결 토큰이 유효하지 않습니다.") from None
    session = active_session(session_hash)
    if not session or session["user_id"] != user_id:
        raise AuthError("로그인이 만료됐어요. 앱에서 다시 로그인하고 수집할 여행을 선택해 주세요.")
    member = first(get_supabase_client().table(TABLE_TRIP_MEMBERS).select("id").eq("id", payer_id)
                   .eq("trip_id", trip_id).eq("user_id", user_id).execute())
    if not member:
        raise AppError("카드를 연결한 여행에 참여 중인 멤버가 아닙니다.", 403)
    return trip_id, payer_id


def event_payload(body, scope):
    reject_message(body)
    if {"trip_id", "payer_member_id", "expense_id"} & body.keys():
        raise ValidationError("여행과 결제자는 휴대폰 연결 토큰에서 결정합니다.")
    try:
        event_id = str(UUID(str(body.get("event_id"))))
    except ValueError:
        raise ValidationError("event_id에는 수신 시 생성한 UUID가 필요합니다.") from None
    source = body.get("source")
    if source != "app_push":
        raise AppError("휴대폰 수집기는 카드 앱 푸시만 수집합니다.", 422)
    if body.get("event_type") not in ("approval", "cancel"):
        raise ValidationError("카드 앱 푸시의 event_type을 확인해주세요.")
    amount = str(body.get("amount", ""))
    if not AMOUNT.fullmatch(amount):
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
