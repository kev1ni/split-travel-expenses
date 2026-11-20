"""Member-authorized expense, exchange-rate, and settlement endpoints."""

from collections import defaultdict

from flask import Blueprint, request
from postgrest.exceptions import APIError

from core.db import TABLE_EXPENSES, TABLE_SETTLEMENTS, get_supabase_client
from core.errors import ConflictError, NotFoundError, ValidationError
from core.http import get_json_body, query_int
from core.validators import currency, first
from core.web_session import trip_member
from services import exchanges, expenses, reference_rates, settlements
from services.v1_expenses import expense_input, expense_view

bp = Blueprint("v1_finance", __name__)


@bp.get("/trips/<int:trip_id>/expenses")
def expense_list(trip_id):
    trip_member(trip_id)
    page = query_int("page", 1, minimum=1)
    size = query_int("page_size", 20, minimum=1, maximum=100)
    kind = request.args.get("entry_type")
    def filtered(columns):
        query = get_supabase_client().table(TABLE_EXPENSES).select(columns, count="exact").eq("trip_id", trip_id)
        if request.args.get("currency"):
            query = query.eq("currency", currency(request.args["currency"]))
        if kind in ("cash", "card"):
            return query.eq("payment_method", kind)
        if kind:
            return query.eq("entry_type", "auto_card" if kind == "card_message" else kind)
        return query
    start = (page - 1) * size
    try:
        result = filtered("*").order("spent_at", desc=True).order("id", desc=True).range(start, start + size - 1).execute()
    except APIError as exc:
        if exc.code != "PGRST103":
            raise
        result = filtered("id").limit(0).execute()
    rows = expenses._attach_names(get_supabase_client(), trip_id, result.data or [])
    return {"data": [expense_view(row) for row in rows],
            "pagination": {"page": page, "page_size": size, "total": result.count or 0}}


@bp.post("/trips/<int:trip_id>/expenses")
def expense_create(trip_id):
    trip_member(trip_id)
    data = get_json_body()
    payload, split = expense_input(data)
    result = expenses.create_expense_with_splits(trip_id, payload, split, data.get("card_event_id"))
    return {"data": expense_view(result["expense"], result["splits"])}, 201


@bp.get("/trips/<int:trip_id>/expenses/<int:expense_id>")
def expense_detail(trip_id, expense_id):
    trip_member(trip_id)
    return {"data": expense_view(expenses.get_expense(trip_id, expense_id))}


def editable(trip_id, expense_id):
    row = expenses.get_expense(trip_id, expense_id)
    if row["entry_type"] != "manual":
        raise ConflictError("카드 승인·취소 이력은 연결된 카드 이벤트로 관리합니다.")
    return row


@bp.patch("/trips/<int:trip_id>/expenses/<int:expense_id>")
def expense_update(trip_id, expense_id):
    trip_member(trip_id)
    current = editable(trip_id, expense_id)
    payload, split = expense_input(get_json_body(), current)
    result = expenses.update_expense(trip_id, expense_id, payload, split)
    return {"data": expense_view(result["expense"], result["splits"])}


@bp.delete("/trips/<int:trip_id>/expenses/<int:expense_id>")
def expense_remove(trip_id, expense_id):
    trip_member(trip_id)
    editable(trip_id, expense_id)
    return {"data": expenses.delete_expense(trip_id, expense_id)}


@bp.get("/trips/<int:trip_id>/expenses/summary")
def expense_summary(trip_id):
    trip_member(trip_id)
    categories, currencies = defaultdict(int), defaultdict(int)
    start = 0
    while True:
        rows = (get_supabase_client().table(TABLE_EXPENSES).select("id,category,currency,krw_amount")
                .eq("trip_id", trip_id).order("id").range(start, start + 499).execute().data or [])
        for row in rows:
            categories[row.get("category") or "기타"] += row["krw_amount"]
            currencies[row["currency"]] += row["krw_amount"]
        start += len(rows)
        if len(rows) < 500:
            break
    return {"data": {"total_krw_amount": sum(currencies.values()), "expense_count": start,
                     "by_category": dict(categories), "by_currency_krw": dict(currencies)}}


@bp.get("/exchange-rates")
def rate_lookup():
    return {"data": reference_rates.lookup(request.args.get("base"), request.args.get("quote"), request.args.get("date"))}


@bp.get("/trips/<int:trip_id>/exchange-rates")
def trip_rates(trip_id):
    trip_member(trip_id)
    return {"data": exchanges.list_exchanges(trip_id)}


def transfer_view(row):
    return dict(row, from_member_id=row["sender_member_id"], to_member_id=row["receiver_member_id"])


@bp.get("/trips/<int:trip_id>/settlements/preview")
def settle_preview(trip_id):
    trip_member(trip_id)
    balances = settlements.compute_trip_balances(get_supabase_client(), trip_id)
    transfers = settlements.transfer_rows(trip_id, balances)
    return {"data": {"trip_id": trip_id, "currency": "KRW", "transfers": [transfer_view(t) for t in transfers]}}


@bp.get("/trips/<int:trip_id>/settlements")
def settle_list(trip_id):
    trip_member(trip_id)
    return {"data": [transfer_view(row) for row in settlements.list_settlements(trip_id)]}


@bp.post("/trips/<int:trip_id>/settlements")
def settle_confirm(trip_id):
    trip_member(trip_id, owner=True)
    return {"data": [transfer_view(row) for row in settlements.confirm_trip_settlements(trip_id)]}, 201


@bp.patch("/trips/<int:trip_id>/settlements/<int:settlement_id>")
def settle_complete(trip_id, settlement_id):
    member = trip_member(trip_id)
    if get_json_body().get("status") != "completed":
        raise ValidationError("status는 completed여야 합니다.")
    table = get_supabase_client().table(TABLE_SETTLEMENTS)
    row = first(table.select("*").eq("id", settlement_id).eq("trip_id", trip_id).execute())
    if row is None:
        raise NotFoundError("이 여행의 송금 내역을 찾을 수 없습니다.")
    if member["id"] not in (row["sender_member_id"], row["receiver_member_id"]):
        trip_member(trip_id, owner=True)
    row = settlements.complete_trip_settlement(trip_id, settlement_id)
    return {"data": transfer_view(row)}
