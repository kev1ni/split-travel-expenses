"""잔액 / 정산"""

from flask import Blueprint, request

from core.http import success
from services import settlements

bp = Blueprint("settlements", __name__)


@bp.get("/trips/<int:trip_id>/members/<int:member_id>/summary")
def member_balance(trip_id: int, member_id: int):
    return success(summary=settlements.get_member_balance(trip_id, member_id))


@bp.get("/trips/<int:trip_id>/balances")
def trip_balances(trip_id: int):
    return success(balances=settlements.get_trip_balances(trip_id))


@bp.post("/trips/<int:trip_id>/settle")
def settle(trip_id: int):
    """정산 계산 (기존 pending 정산은 새 결과로 교체)"""
    return success(settlements=settlements.calculate_settlements(trip_id))


@bp.get("/trips/<int:trip_id>/settlements")
def list_settlements(trip_id: int):
    """?status=pending|completed"""
    return success(settlements=settlements.list_settlements(trip_id, request.args.get("status")))


@bp.patch("/settlements/<int:settlement_id>/complete")
def complete(settlement_id: int):
    return success(settlement=settlements.complete_settlement(settlement_id))


@bp.patch("/settlements/<int:settlement_id>/cancel")
def cancel(settlement_id: int):
    return success(settlement=settlements.cancel_settlement(settlement_id))
