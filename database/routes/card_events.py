"""카드 결제 파싱 앱 연동"""

from flask import Blueprint, jsonify, make_response, request

from core.http import get_json_body, query_int, require_parser_key, success
from config import settings
from core.errors import AuthError, ValidationError
from services import card_events, collector
from core.db import TABLE_CARD_EVENTS, get_supabase_client
from core.web_session import identity, trip_member
from services import reviewed_cards

bp = Blueprint("card_events", __name__)


@bp.post("/card-events")
@require_parser_key
def receive_card_event():
    """파싱 앱 → 서버. 새로 저장 201, 같은 event_id 재전송 200 + duplicate=true"""
    if settings.collector_signing_key and not settings.parser_api_key:
        raise AuthError("휴대폰 수집기는 /api/collector/events와 연결 토큰을 사용하세요.")
    saved, created = card_events.insert_card_event(get_json_body())
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
    saved, created = card_events.insert_card_event(payload, scoped=True)
    return success(201 if created else 200, card_event=saved, duplicate=not created)


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
def preview_card():
    if not identity():
        raise AuthError("먼저 로그인하거나 여행 초대로 참여해주세요.")
    return jsonify(data=reviewed_cards.parse_message(get_json_body()))


@bp.post("/v1/trips/<int:trip_id>/card-events")
def confirm_card(trip_id):
    trip_member(trip_id)
    return jsonify(data=reviewed_cards.register(trip_id, get_json_body())), 201


@bp.get("/v1/trips/<int:trip_id>/card-events")
def trip_cards(trip_id):
    trip_member(trip_id)
    limit = query_int("limit", default=100, minimum=1, maximum=500)
    offset = query_int("offset", default=0, maximum=100000)
    rows = (get_supabase_client().table(TABLE_CARD_EVENTS).select("*").eq("trip_id", trip_id)
            .order("received_at", desc=True).range(offset, offset + limit - 1).execute().data)
    return jsonify(data=rows or [])
