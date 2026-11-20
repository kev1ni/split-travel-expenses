"""여행 / 참가자 / 대시보드"""

from flask import Blueprint

from core.errors import NotFoundError
from core.http import get_json_body, success
from services import summary, trips

bp = Blueprint("trips", __name__)


@bp.post("/trips")
def create_trip():
    """여행 생성 + 생성자를 방장 멤버로 자동 등록"""
    trip, owner = trips.create_trip_with_owner(get_json_body())
    return success(201, trip=trip, owner_member=owner)


@bp.get("/trips/<int:trip_id>")
def get_trip(trip_id: int):
    return success(trip=trips.get_trip_detail(trip_id))


@bp.get("/trips/share/<string:share_code>")
def get_trip_by_share(share_code: str):
    trip = trips.get_trip_by_share_code(share_code)
    if not trip:
        raise NotFoundError("유효하지 않은 초대 코드입니다.")
    return success(trip=trip)


@bp.post("/trips/join")
def join_trip():
    trip, member = trips.join_trip_by_share_code(get_json_body())
    return success(201, trip=trip, member=member)


@bp.get("/trips/<int:trip_id>/summary")
def trip_summary(trip_id: int):
    return success(summary=summary.get_trip_summary(trip_id))


@bp.post("/trips/<int:trip_id>/members")
def add_member(trip_id: int):
    return success(201, member=trips.add_trip_member({**get_json_body(), "trip_id": trip_id}))


@bp.get("/trips/<int:trip_id>/members")
def list_members(trip_id: int):
    return success(members=trips.get_trip_members(trip_id))
