"""Exercise the React API contract with an owner and a guest in the same trip."""

from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from core.db import set_supabase_client
from fake_supabase import FakeClient


def finance_scenario(app):
    owner, guest, outsider = (app.test_client() for _ in range(3))
    base = "/api/v1"
    def call(c, verb, path, status=200, body=None):
        r = c.open(base + path, method=verb, json=body)
        assert r.status_code == status, (verb, path, r.status_code, r.json)
        if status >= 400:
            assert r.json["error"]["code"]
            return r.json["error"]
        return r.json["data"]

    login_id = "qa_" + uuid4().hex[:12]
    account = dict(login_id=login_id, password=uuid4().hex, nickname="방장")
    call(owner, "POST", "/auth/signup", 201, account)
    token = call(owner, "POST", "/auth/login", body=account)["access_token"]
    assert outsider.get(base + "/auth/me", headers={"Authorization": "Bearer " + token}).json["data"]["login_id"] == login_id
    trip = call(owner, "POST", "/trips", 201, {"title": "테스트 여행", "destination_currency": "JPY"})
    path = "/trips/" + str(trip["id"])
    invitation = call(owner, "POST", path + "/invitations")
    res = guest.post(base + "/invitations/accept", json={"share_code": invitation["share_code"], "nickname": "친구"})
    assert res.status_code in (200, 201), res.json
    midpoint = res.json["data"]["member_id"]
    payer = trip["my_member_id"]
    call(outsider, "GET", path + "/expenses", 401)
    details = dict(title="점심 식사", category="food", amount=3000, currency="JPY", exchange_rate=9.2,
                   rate_date="2026-01-10", payment_method="cash", payer_member_id=payer, split_type="equal",
                   occurred_at="2026-01-10T12:30:00+09:00", splits=[{"member_id": payer}, {"member_id": midpoint}])
    row = call(owner, "POST", path + "/expenses", 201, details)
    expense = path + "/expenses/" + str(row["id"])
    assert row["krw_amount"] == 27600 and [s["krw_amount"] for s in row["splits"]] == [13800, 13800]
    assert call(guest, "GET", expense)["amount"] == 3000
    fail = dict(details, split_type="custom", splits=[dict(member_id=payer, krw_amount=1)])
    call(owner, "POST", path + "/expenses", 422, fail)
    changed = call(owner, "PATCH", expense, body={"amount": 2000})
    assert changed["krw_amount"] == 18400
    assert call(owner, "GET", path + "/expenses/summary")["by_currency_krw"] == {"JPY": 18400}
    assert call(guest, "GET", path + "/expenses?currency=JPY&entry_type=cash")[0]["id"] == row["id"]
    assert call(guest, "GET", path + "/expenses?currency=USD") == []
    beyond = guest.get(base + path + "/expenses?page=3&page_size=1")
    assert beyond.status_code == 200 and beyond.json["data"] == [] and beyond.json["pagination"]["total"] == 1
    assert call(owner, "GET", path + "/settlements") == []
    preview = call(owner, "GET", path + "/settlements/preview")["transfers"]
    assert [(r["from_member_id"], r["to_member_id"], r["amount"]) for r in preview] == [(midpoint, payer, 9200)]
    assert call(owner, "GET", path + "/settlements") == []
    plan = call(owner, "POST", path + "/settlements", 201)
    assert call(owner, "POST", path + "/settlements", 201)[0]["id"] == plan[0]["id"]
    def check_settlement_detail(client):
        detail = call(client, "GET", path)
        focused = call(client, "GET", path + "?include=settlement")
        for key in ("id", "my_member_id", "total_krw_amount", "my_unsettled_krw_amount", "balances", "settlements"):
            assert focused[key] == detail[key]
        assert focused["expense_count"] == len(detail["expenses"])
        assert "expenses" not in focused

    check_settlement_detail(guest)
    transfer = path + "/settlements/" + str(plan[0]["id"])
    done = call(guest, "PATCH", transfer, body={"status": "completed"})
    assert call(guest, "PATCH", transfer, body={"status": "completed"})["completed_at"] == done["completed_at"]
    assert call(owner, "GET", path + "/settlements/preview")["transfers"] == []
    assert call(owner, "GET", "/exchange-rates?base=KRW&quote=KRW")["rate"] == 1
    extra = call(owner, "POST", path + "/expenses", 201, dict(details, title="삭제 시험"))
    call(owner, "DELETE", path + "/expenses/" + str(extra["id"]))
    call(owner, "GET", path + "/expenses/" + str(extra["id"]), 404)
    for client in (owner, guest):
        summary, = call(client, "GET", "/trips?include=summary")
        detail = call(client, "GET", path)
        for key in ("id", "title", "my_member_id", "member_count", "total_krw_amount", "my_unsettled_krw_amount"):
            assert summary[key] == detail[key]
        assert summary["expense_count"] == len(detail["expenses"])
        assert summary["has_unsettled_balance"] == any(b["outstanding_balance"] for b in detail["balances"])
        assert "expenses" not in summary
    call(outsider, "GET", "/trips?include=summary", 401)
    check_settlement_detail(owner)
    call(outsider, "GET", path + "?include=settlement", 401)
    call(owner, "POST", "/auth/logout")
    assert outsider.get(base + "/auth/me", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_finance_flow():
    set_supabase_client(FakeClient())
    try:
        finance_scenario(create_app())
    finally:
        set_supabase_client(None)
