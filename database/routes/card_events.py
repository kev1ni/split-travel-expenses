"""카드 결제 파싱 앱 연동"""

from flask import Blueprint, jsonify, make_response, request

from core.http import get_json_body, query_int, require_parser_key, success
from config import settings
from core.errors import AppError, AuthError, ValidationError
from services import auto_cards, card_events, collector
from core.db import TABLE_CARD_EVENTS, get_supabase_client
from core.web_session import trip_member
from services import reviewed_cards

bp = Blueprint("card_events", __name__)


@bp.post("/card-events")
@require_parser_key
def receive_card_event():
    """파싱 앱 → 서버. 새로 저장 201, 같은 event_id 재전송 200 + duplicate=true"""
    if settings.collector_signing_key and not settings.parser_api_key:
        raise AuthError("휴대폰 수집기는 /api/collector/events와 연결 토큰을 사용하세요.")
    body = get_json_body()
    collector.reject_message(body)
    if body.get("source") not in ("push", "app_push"):
        raise AppError("카드 앱 푸시만 수집합니다.", 422)
    saved, created = card_events.insert_card_event(body)
    return success(201 if created else 200, card_event=saved, duplicate=not created)


@bp.post("/collector/pair")
def pair_collector():
    token = collector.issue_token(get_json_body())
    response = make_response(success(token=token, endpoint="/api/collector/events"))
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.post("/collector/events")
def collect():
    scope = collector.read_scope(request.headers.get("Authorization"))
    payload = collector.event_payload(get_json_body(), scope)
    saved, created, status = auto_cards.receive(payload)
    return success(201 if created else 200, card_event=saved, duplicate=not created, registration_status=status)


@bp.post("/v1/trips/<int:trip_id>/card-events/sync")
def sync_collected_cards(trip_id):
    trip_member(trip_id)
    return jsonify(data=auto_cards.sync(trip_id, request.args.get("after")))


@bp.get("/card-events/unassigned")
def unassigned():
    """?trip_id=&payer_member_id=&limit=20"""
    trip_id = query_int("trip_id", minimum=1)
    scoped = bool(settings.collector_signing_key) or request.args.get("scoped", "").lower() == "true"
    if scoped:
        if trip_id is None:
            raise ValidationError("trip_id가 필요합니다.")
        trip_member(trip_id)
    return success(unassigned_cards=card_events.list_unassigned(
        limit=query_int("limit", default=20, minimum=1, maximum=100),
        trip_id=trip_id, scoped=scoped,
        payer_member_id=query_int("payer_member_id"),
    ))


@bp.post("/v1/card-events/parse")
def retired_message_preview():
    raise AppError("문자 미리보기 기능이 종료됐습니다. 카드 앱 푸시로 수집해주세요.", 410)


@bp.post("/v1/trips/<int:trip_id>/card-events")
def confirm_card(trip_id):
    trip_member(trip_id)
    body = get_json_body()
    collector.reject_message(body)
    return jsonify(data=reviewed_cards.register(trip_id, body)), 201


@bp.get("/v1/trips/<int:trip_id>/card-events")
def trip_cards(trip_id):
    trip_member(trip_id)
    limit = query_int("limit", default=100, minimum=1, maximum=500)
    offset = query_int("offset", default=0, maximum=100000)
    query = get_supabase_client().table(TABLE_CARD_EVENTS).select("*").eq("trip_id", trip_id)
    if request.args.get("source") == "app_push":
        query = query.in_("source", ["app_push", "deleted:app_push"])
    rows = query.order("received_at", desc=True).range(offset, offset + limit - 1).execute().data
    return jsonify(data=[card_events.public_event(row) for row in rows or []])
