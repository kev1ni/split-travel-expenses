"""Browser and bearer API for user accounts, trips, and invitations."""
from flask import Blueprint

from core.db import TABLE_CARD_EVENTS, TABLE_TRIPS, TABLE_TRIP_MEMBERS, get_supabase_client
from core.errors import AuthError, ConflictError, NotFoundError, ValidationError
from core.http import get_json_body
from core.validators import currency, db_call, first, text, to_date
from core.web_session import (account, find_member, guest_trips, identity, logout_session,
                              remember_guest, require_user, start_session, trip_member)
from services import expenses, settlements, trips, users

bp = Blueprint("web", __name__)


def profile(user):
    return {"id": user["id"], "login_id": user["login_id"], "nickname": user["name"]}


@bp.post("/v1/auth/signup")
def signup():
    data = get_json_body()
    user = users.register_user({"login_id": data.get("login_id"), "name": data.get("nickname"),
                                "password": data.get("password"), "email": data.get("email")}, optional_email=True)
    return {"data": profile(user)}, 201


@bp.post("/v1/auth/login")
def login():
    user = users.login_user(get_json_body())
    return {"data": {"access_token": start_session(user["id"]), "token_type": "Bearer", "user": profile(user)}}


@bp.get("/v1/auth/me")
def me():
    user = account()
    if user:
        return {"data": profile(user)}
    for link in guest_trips():
        member = find_member(link["trip_id"])
        if member:
            return {"data": {"id": None, "login_id": None, "nickname": member["nickname"], "is_guest": True}}
    raise AuthError("로그인하거나 여행 초대로 참여해 주세요.")


@bp.post("/v1/auth/logout")
def logout():
    if not identity():
        raise AuthError("로그인 세션이 없습니다.")
    logout_session()
    return {"data": {"logged_out": True}}


@bp.get("/v1/trips")
def list_my_trips():
    user = account()
    if user:
        return {"data": users.get_user_trips(user["id"])}
    if not identity():
        raise AuthError("로그인하거나 여행 초대로 참여해 주세요.")
    rows = [trips.get_trip_detail(link["trip_id"]) for link in guest_trips()]
    return {"data": rows}


@bp.post("/v1/trips")
def create_trip():
    user = require_user()
    data = {**get_json_body(), "created_by": user["id"], "creator_nickname": user["name"]}
    trip, member = trips.create_trip_with_owner(data)
    return {"data": {**trip, "my_member_id": member["id"]}}, 201


@bp.get("/v1/trips/<int:trip_id>")
def trip_detail(trip_id):
    member = trip_member(trip_id)
    trip = trips.get_trip_detail(trip_id)
    balances = settlements.get_trip_balances(trip_id)
    my_net = next((b["outstanding_balance"] for b in balances if b["member_id"] == member["id"]), 0)
    return {"data": {**trip, "my_member_id": member["id"], "total_krw_amount": sum(b["total_paid"] for b in balances),
                     "my_unsettled_krw_amount": my_net, "balances": balances,
                     "expenses": expenses.list_expenses(trip_id), "settlements": settlements.list_settlements(trip_id)}}


@bp.patch("/v1/trips/<int:trip_id>")
def update_trip(trip_id):
    trip_member(trip_id, owner=True)
    trip = trips.get_trip_detail(trip_id)
    data = get_json_body()
    patch = {}
    for field, length in (("title", 100), ("destination_country", 50), ("description", None)):
        if field in data:
            patch[field] = text(data[field], field, required=field == "title", max_len=length)
    if "destination_currency" in data:
        patch["destination_currency"] = currency(data["destination_currency"])
    for field in ("start_date", "end_date"):
        if field in data:
            patch[field] = to_date(data[field], field)
    dates = {**trip, **patch}
    if dates.get("start_date") and dates.get("end_date") and dates["end_date"] < dates["start_date"]:
        raise ValidationError("종료일이 시작일보다 빠릅니다.")
    if not patch:
        raise ValidationError("수정할 여행 정보를 입력해 주세요.")
    result = first(db_call("여행 수정", lambda: get_supabase_client().table(TABLE_TRIPS)
                           .update(patch).eq("id", trip_id).execute()))
    return {"data": result}


@bp.delete("/v1/trips/<int:trip_id>")
def delete_trip(trip_id):
    trip_member(trip_id, owner=True)
    db_call("여행 삭제", lambda: get_supabase_client().table(TABLE_TRIPS).delete().eq("id", trip_id).execute())
    return {"data": {"id": trip_id}}


@bp.get("/v1/trips/<int:trip_id>/members")
def members(trip_id):
    trip_member(trip_id)
    return {"data": trips.get_trip_members(trip_id)}


@bp.post("/v1/trips/<int:trip_id>/members/guests")
def add_guest(trip_id):
    trip_member(trip_id, owner=True)
    member = trips.add_trip_member({"trip_id": trip_id, "nickname": get_json_body().get("nickname")})
    return {"data": {**member, "is_guest": True}}, 201


@bp.delete("/v1/trips/<int:trip_id>/members/<int:member_id>")
def remove_member(trip_id, member_id):
    owner = trip_member(trip_id, owner=True)
    if owner["id"] == member_id:
        raise ConflictError("방장은 여행에서 제거할 수 없습니다.")
    client = get_supabase_client()
    query = client.table(TABLE_TRIP_MEMBERS).select("id").eq("trip_id", trip_id).eq("id", member_id)
    if not first(query.execute()):
        raise NotFoundError("이 여행에 등록된 멤버를 찾을 수 없습니다.")
    for table, field in [(TABLE_CARD_EVENTS, "payer_member_id"), ("expenses", "payer_member_id"),
                         ("expense_splits", "member_id"), ("currency_exchanges", "member_id"),
                         ("settlements", "sender_member_id"), ("settlements", "receiver_member_id")]:
        if first(client.table(table).select(field).eq("trip_id", trip_id).eq(field, member_id).limit(1).execute()):
            raise ConflictError("기록에 연결된 멤버는 제거할 수 없습니다.")
    db_call("멤버 제거", lambda: client.table(TABLE_TRIP_MEMBERS).delete().eq("trip_id", trip_id)
            .eq("id", member_id).execute())
    return {"data": {"member_id": member_id}}


@bp.post("/v1/trips/<int:trip_id>/invitations")
def invite_link(trip_id):
    trip_member(trip_id)
    trip = trips.get_trip_detail(trip_id)
    return {"data": {"share_code": trip["share_code"], "invite_path": "/invite/" + trip["share_code"]}}


@bp.get("/v1/invitations/<string:code>")
def invitation(code):
    trip = trips.get_trip_by_share_code(code)
    if not trip:
        raise NotFoundError("유효하지 않은 초대 코드입니다.")
    return {"data": {**trip, "already_joined": bool(find_member(trip["id"]))}}


@bp.post("/v1/invitations/accept")
def join():
    data = get_json_body()
    code = data.get("share_code")
    trip = trips.get_trip_by_share_code(code)
    if not trip:
        raise NotFoundError("유효하지 않은 초대 코드입니다.")
    member = find_member(trip["id"])
    if member:
        return {"data": {"trip_id": trip["id"], "member_id": member["id"], "title": trip["title"]}}
    user = account()
    nickname = data.get("nickname") or (user and user["name"])
    trip, member = trips.join_trip_by_share_code({"share_code": code, "user_id": user and user["id"], "nickname": nickname})
    if not user:
        try:
            remember_guest(trip["id"], member["id"])
        except Exception:
            get_supabase_client().table(TABLE_TRIP_MEMBERS).delete().eq("trip_id", trip["id"]).eq("id", member["id"]).execute()
            raise
    return {"data": {"trip_id": trip["id"], "member_id": member["id"], "title": trip["title"]}}, 201
