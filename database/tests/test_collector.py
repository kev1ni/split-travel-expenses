"""Exercise the mobile → trip inbox → expense flow and signed refund amounts through Flask."""

import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fake_supabase import FakeClient
from app import create_app
from config import settings
from core.db import set_supabase_client


def test_mobile_and_reviewed_events():
    previous_key = settings.collector_signing_key
    settings.collector_signing_key = "test-only-collector-key"
    try:
        _exercise()
    finally:
        settings.collector_signing_key = previous_key
        set_supabase_client(None)


def _exercise():
    db = FakeClient()
    set_supabase_client(db)
    app = create_app()
    owner, outsider, device = (app.test_client() for _ in range(3))

    def req(client, method, path, data=None, status=200, headers=None):
        r = client.open("/api/" + path, method=method, json=data, headers=headers)
        assert r.status_code == status, (method, path, r.status_code, r.get_json())
        return r.get_json()

    credentials = {"login_id": "team-owner", "password": "test-password"}
    other_creds = {"login_id": "team-other", "password": "test-password"}
    for web, creds in ((owner, credentials), (outsider, other_creds)):
        req(web, "POST", "v1/auth/signup", {**creds, "nickname": creds["login_id"]}, 201)
        req(web, "POST", "v1/auth/login", creds)

    def group(web, title):
        return req(web, "POST", "v1/trips", {"title": title, "destination_country": "KR",
                   "destination_currency": "KRW","start_date":"2026-11-01","end_date":"2026-11-20"}, 201)["data"]["id"]

    trip = group(owner, "샘플 여행")
    second_trip = group(outsider, "다른 여행")
    payer = next(m["id"] for m in db.tables["trip_members"] if m["trip_id"] == trip)
    second_payer = next(m["id"] for m in db.tables["trip_members"] if m["trip_id"] == second_trip)
    guest = req(owner, "POST", f"v1/trips/{trip}/members/guests", {"nickname": "친구"}, 201)["data"]["id"]
    pair_args = {"trip_id": trip, "payer_member_id": payer}
    req(device, "POST", "collector/pair", {**other_creds, **pair_args}, 403)
    req(device, "POST", "collector/pair", {**credentials, **pair_args, "password": "bad"}, 401)
    config = req(owner, "POST", "collector/pair", {**credentials, **pair_args})
    assert config["endpoint"] == "/api/collector/events"
    auth = {"Authorization": "Bearer " + config["token"]}
    other_token = req(outsider, "POST", "collector/pair", {**other_creds, "trip_id": second_trip, "payer_member_id": second_payer})["token"]
    from datetime import datetime, timezone
    event = {"event_id": str(uuid4()), "source": "message", "issuer": "데모카드", "message_format": None,
             "amount": "1400", "currency": "KRW", "merchant": "예시마트", "approval_ref": "A1023",
             "occurred_at": None, "received_at": datetime.now(timezone.utc).isoformat(), "event_type": "approval"}
    url = "collector/events"
    req(device, "POST", url, event, 401)
    req(device, "POST", url, {**event, "trip_id": second_trip}, 400, auth)
    req(device, "POST", url, {**event, "amount": "-1"}, 400, auth)
    assert req(device, "POST", url, event, 201, auth)["card_event"]["trip_id"] == trip
    assert req(device, "POST", url, event, 200, auth)["duplicate"]
    req(device, "POST", url, {**event, "amount": "900"}, 409, auth)
    req(device, "POST", url, event, 409, {"Authorization": "Bearer " + other_token})
    twin_id = str(uuid4())
    req(device, "POST", url, {**event, "event_id": twin_id, "source": "app_push"}, 201, auth)
    same_ref = {**event, "event_id": str(uuid4())}
    req(device, "POST", url, same_ref, 201, {"Authorization": "Bearer " + other_token})
    inbox = f"card-events/unassigned?trip_id={trip}&scoped=true"
    req(device, "GET", inbox, status=401)
    req(outsider, "GET", inbox, status=403)
    rows = req(owner, "GET", inbox)["unassigned_cards"]
    assert len(rows) == 1 and len(rows[0]["duplicate_event_ids"]) == 1
    reviews = f"v1/trips/{trip}/card-events"
    confirmation = {"card_event_id": event["event_id"], "payer_member_id": payer}
    req(owner, "POST", reviews, {**confirmation, "payer_member_id": guest}, 404)
    confirmed = req(owner, "POST", reviews, confirmation, 201)["data"]
    assert confirmed["krw_amount"] == 1400
    original_id = confirmed["expense_id"]
    req(owner, "POST", reviews, confirmation, 409)
    assert not req(owner, "GET", inbox)["unassigned_cards"]
    assert len(req(outsider, "GET", f"card-events/unassigned?trip_id={second_trip}&scoped=true")["unassigned_cards"]) == 1
    late = req(device, "POST", url, {**event, "event_id": str(uuid4())}, 201, auth)["card_event"]
    assert late["expense_id"] == original_id
    parse_url = "v1/card-events/parse"
    blank = req(owner, "POST", parse_url, {"message": "인증번호 012345"})["data"]
    assert blank["amount"] is None and blank["warnings"]
    ambiguous = req(owner, "POST", parse_url, {"message": "해외승인 JPY 300 A점 해외승인 JPY 400 B점"})["data"]
    assert ambiguous["amount"] is None
    for message, value, code, shop in [
        ("[카드] 해외승인 JPY 5,000 TOKYO SHOP 12/10 15:30", 5000, "JPY", "TOKYO SHOP"),
        ("[카드승인] 25,000원 / OO식당 / 11월 19일 12:30", 25000, "KRW", "OO식당"),
        ("[Web발신]\n현대 넥슨 승인\n김*별\n1,400원 일시불\n03/12 08:25\n예시마트\n누적23,700원", 1400, "KRW", "예시마트")
    ]:
        parsed = req(owner, "POST", parse_url, {"message":message})["data"]
        assert (parsed["amount"], parsed["currency"], parsed["merchant"], parsed["occurred_at"]) == (value,code,shop,None)
    approval = {"payer_member_id": payer, "event_id": str(uuid4()), "amount": 5000, "currency":"JPY",
                "issuer":"예시카드", "approval_ref":"ORDER2", "event_type":"approval","merchant":"TOKYO SHOP",
                "exchange_rate":"9.2","split_type":"equal","splits":[{"member_id":payer},{"member_id":guest}]}
    assert req(owner, "POST", reviews, approval, 201)["data"]["krw_amount"] == 46000
    req(owner, "POST", reviews, {**approval, "event_id":str(uuid4())}, 409)
    count = len(db.tables["expenses"])
    req(owner, "POST", reviews, {**approval,"event_id":str(uuid4()),"approval_ref":"other","currency":"USD","exchange_rate":None}, 422)
    assert len(db.tables["expenses"]) == count
    refund = {**event, "source":"message","event_id":str(uuid4()), "amount":"399","event_type":"cancel"}
    req(device, "POST", url, refund, 201, auth)
    cancel_body = {"payer_member_id":payer,"card_event_id":refund["event_id"],"original_expense_id":original_id,
                   "event_type":"partial_cancellation"}
    db.fail_next.add("expense_splits")
    req(owner, "POST", reviews, cancel_body, 500)
    assert len(db.tables["expenses"]) == count
    credited = req(owner, "POST", reviews, cancel_body, 201)["data"]
    assert credited["krw_amount"] == -399
    req(owner, "POST", reviews, cancel_body, 409)
    over = {"payer_member_id":payer, "original_expense_id":original_id, "event_id":str(uuid4()),
            "event_type":"cancellation","amount":1400,"currency":"KRW"}
    req(owner, "POST", reviews, over, 422)
    req(owner, "POST", reviews, {**over,"amount":1001}, 201)
    credits = [r for r in db.tables["expenses"] if r.get("original_expense_id") == original_id]
    assert sum(r["krw_amount"] for r in credits) == -1400
    spend_ids = {original_id, *(r["id"] for r in credits)}
    for member in (guest,payer):
        assert sum(s["split_krw_amount"] for s in db.tables["expense_splits"]
                   if s["member_id"] == member and s["expense_id"] in spend_ids) == 0
    assert all("message" not in row for row in req(owner, "GET", reviews)["data"])

    settle = f"v1/trips/{trip}/settlements"
    estimate = req(owner, "GET", settle + "/preview")["data"]["transfers"]
    assert estimate and not db.tables.get("settlements")
    transfers = req(owner, "POST", settle, {}, 201)["data"]
    stable_id = transfers[0]["id"]
    assert req(owner, "POST", settle, {}, 201)["data"][0]["id"] == stable_id
    cash = {"title":"식비","payer_member_id":payer,"amount":2000,"currency":"KRW","payment_method":"cash"}
    cash_url = f"v1/trips/{trip}/expenses"
    cash_id = req(owner,"POST",cash_url,cash,201)["data"]["id"]
    db.fail_next.add("expense_splits")
    req(owner,"PATCH",f"{cash_url}/{cash_id}",{"amount":4000},500)
    cash_row = next(r for r in db.tables["expenses"] if r["id"] == cash_id)
    assert cash_row["krw_amount"] == sum(r["split_krw_amount"] for r in db.tables["expense_splits"] if r["expense_id"] == cash_id) == 2000
    db.fail_next.add("settlements")
    req(owner, "POST", settle, {}, 500)
    assert req(owner, "GET", settle)["data"][0]["id"] == stable_id
    new = req(owner, "POST", settle, {}, 201)["data"][0]
    assert new["amount"] == transfers[0]["amount"] + 1000
    complete = settle + "/" + str(new["id"])
    done = req(owner,"PATCH",complete,{"status":"completed"})["data"]
    assert req(owner,"PATCH",complete,{"status":"completed"})["data"]["completed_at"] == done["completed_at"]
    assert req(owner,"POST",settle,{},201)["data"] == []


if __name__ == "__main__":
    test_mobile_and_reviewed_events()
    print("PASS: scoped ingestion, duplicate/late notifications, manual parsing, refunds and splits")
