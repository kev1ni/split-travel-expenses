"""카드 결제 파싱 앱 연동"""

from flask import Blueprint

from core.http import get_json_body, query_int, require_parser_key, success
from services import card_events

bp = Blueprint("card_events", __name__)


@bp.post("/card-events")
@require_parser_key
def receive_card_event():
    """파싱 앱 → 서버. 새로 저장 201, 같은 event_id 재전송 200 + duplicate=true"""
    saved, created = card_events.insert_card_event(get_json_body())
    return success(201 if created else 200, card_event=saved, duplicate=not created)


@bp.get("/card-events/unassigned")
def unassigned():
    """?trip_id=&payer_member_id=&limit=20"""
    return success(unassigned_cards=card_events.list_unassigned(
        limit=query_int("limit", default=20, minimum=1, maximum=100),
        trip_id=query_int("trip_id"),
        payer_member_id=query_int("payer_member_id"),
    ))
