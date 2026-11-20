"""환전"""

from flask import Blueprint

from core.http import get_json_body, success
from services import exchanges

bp = Blueprint("exchanges", __name__)


@bp.post("/trips/<int:trip_id>/exchanges")
def create_exchange(trip_id: int):
    return success(201, exchange=exchanges.add_exchange(trip_id, get_json_body()))


@bp.get("/trips/<int:trip_id>/exchanges")
def list_exchanges(trip_id: int):
    return success(exchanges=exchanges.list_exchanges(trip_id))
