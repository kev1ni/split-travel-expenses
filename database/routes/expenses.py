"""지출 + 분할"""

from flask import Blueprint, request

from core.http import get_json_body, query_int, success
from services import expenses

bp = Blueprint("expenses", __name__)


@bp.post("/trips/<int:trip_id>/expenses")
def create_expense(trip_id: int):
    """{"expense": {...}, "split": {...}, "card_event_id": "..."}"""
    data = get_json_body()
    result = expenses.create_expense_with_splits(
        trip_id, data.get("expense") or {}, data.get("split"), data.get("card_event_id")
    )
    return success(201, **result)


@bp.get("/trips/<int:trip_id>/expenses")
def list_expenses(trip_id: int):
    """?category=&payer_member_id=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=&offset="""
    return success(expenses=expenses.list_expenses(
        trip_id,
        category=request.args.get("category"),
        payer_member_id=query_int("payer_member_id"),
        date_from=request.args.get("from"),
        date_to=request.args.get("to"),
        limit=query_int("limit", minimum=1, maximum=500),
        offset=query_int("offset", default=0, maximum=100000),
    ))


@bp.get("/trips/<int:trip_id>/expenses/<int:expense_id>")
def get_expense(trip_id: int, expense_id: int):
    return success(expense=expenses.get_expense(trip_id, expense_id))


@bp.patch("/trips/<int:trip_id>/expenses/<int:expense_id>")
def update_expense(trip_id: int, expense_id: int):
    data = get_json_body()
    return success(**expenses.update_expense(trip_id, expense_id, data.get("expense") or {}, data.get("split")))


@bp.delete("/trips/<int:trip_id>/expenses/<int:expense_id>")
def delete_expense(trip_id: int, expense_id: int):
    return success(**expenses.delete_expense(trip_id, expense_id))
