"""Exercise automatic mobile expenses, retries, duplicates and signed refund amounts through Flask."""

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fake_supabase import FakeClient
from app import create_app
from config import settings
from core.db import set_supabase_client
from core.web_session import SESSION_AGE


def test_android_login_survives_reopening_the_webview(monkeypatch):
    monkeypatch.setattr("core.db._client", FakeClient())
    app = create_app()
    phone = app.test_client()
    login = {"login_id": "mobile-relaunch", "password": "test-password"}
    assert phone.post("/api/v1/auth/signup", json={**login, "nickname": "여행자"}).status_code == 201
    headers = {"User-Agent": "Android WebView NTripAndroid/0.5"}
    assert phone.post("/api/v1/auth/login", json=login, headers=headers).status_code == 200
    cookie = phone.get_cookie("session")
    assert cookie.expires is not None
    lifetime = (cookie.expires - datetime.now(timezone.utc)).total_seconds()
    assert SESSION_AGE - 60 < lifetime <= SESSION_AGE

    # Reopening starts a new WebView and restores only persistent cookies.
    reopened = app.test_client()
    reopened.set_cookie("session", cookie.value)
    me = reopened.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200 and me.get_json()["data"]["login_id"] == login["login_id"]
    assert "Set-Cookie" not in me.headers  # The collector is bound to this cookie's fingerprint.
    assert reopened.post("/api/v1/auth/logout").status_code == 200
    assert phone.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_native_session_connection(monkeypatch):
    db = FakeClient()
    monkeypatch.setattr("core.db._client", db)
    monkeypatch.setattr(settings, "collector_signing_key", None)
    app = create_app()
    web, other, device, guest = (app.test_client() for _ in range(4))

    def post(client, path, body=None, status=200, headers=None):
        response = client.post("/api/" + path, json=body, headers=headers)
        assert response.status_code == status, (path, response.status_code, response.get_json())
        return response

    def login(client, name):
        creds = {"login_id": name, "password": "test-password"}
        post(client, "v1/auth/signup", {**creds, "nickname": name}, 201)
        return creds, post(client, "v1/auth/login", creds).get_json()["data"]

    owner_creds, owner = login(web, "trip-device")
    other_creds, other_login = login(other, "trip-companion")
    trip = post(web, "v1/trips", {"title": "여행 A"}, 201).get_json()["data"]
    another = post(web, "v1/trips", {"title": "여행 B"}, 201).get_json()["data"]
    path = f"v1/trips/{trip['id']}/collector-connection"
    web_auth = {"Authorization": "Bearer " + owner["access_token"]}
    post(device, path, status=401)
    post(other, path, status=403)
    post(guest, "v1/invitations/accept", {"share_code": trip["share_code"], "nickname": "게스트"}, 201)
    post(guest, path, status=401)
    post(web, path, headers={"Origin": "https://unrelated.example"}, status=403)
    for field in ("user_id", "trip_id", "payer_member_id"):
        post(web, path, {field: 123}, 422)
    response = post(web, path)
    assert response.cache_control.no_store
    connection = response.get_json()["data"]
    assert connection == {"trip_id": trip["id"], "trip_title": "여행 A", "payer_member_id": trip["my_member_id"],
                          "user_id": owner["user"]["id"], "token": connection["token"]}
    assert connection == post(device, path, {}, headers=web_auth).get_json()["data"]

    def upload(config, status=201):
        auth = {"Authorization": "Bearer " + config["token"]}
        body = {"event_id": str(uuid4()), "source": "app_push", "issuer": "QA카드", "amount": "1400",
                "currency": "KRW", "event_type": "approval", "received_at": "2026-11-24T12:00:00+09:00"}
        return post(device, "collector/events", body, status, headers=auth).get_json()

    selected = post(web, f"v1/trips/{another['id']}/collector-connection").get_json()["data"]
    for config in (connection, selected):
        event = upload(config)["card_event"]
        assert event["trip_id"] == config["trip_id"] and event["payer_member_id"] == config["payer_member_id"]
        assert event["expense_id"]
    # Devices and invitees have separate sessions. Replacing a login on this device only revokes this login.
    joined = post(other, "v1/invitations/accept", {"share_code": trip["share_code"]}, 201).get_json()["data"]
    companion = post(other, path).get_json()["data"]
    assert companion["payer_member_id"] == joined["member_id"] and companion["user_id"] == other_login["user"]["id"]
    post(web, "v1/auth/login", other_creds)
    upload(connection, 401)
    upload(selected, 401)
    assert upload(companion)["card_event"]["payer_member_id"] == joined["member_id"]
    post(other, "v1/auth/logout")
    upload(companion, 401)
    post(web, "v1/auth/login", owner_creds)
    renewed = post(web, path).get_json()["data"]
    assert renewed["token"] != connection["token"]
    db.table("trip_members").update({"user_id": None}).eq("id", trip["my_member_id"]).execute()
    upload(renewed, 403)
    db.table("trip_members").update({"user_id": owner["user"]["id"]}).eq("id", trip["my_member_id"]).execute()
    db.table("web_sessions").update({"expires_at": "2000-01-01T00:00:00+00:00"}).eq("user_id", owner["user"]["id"]).execute()
    upload(renewed, 401)
    assert len(db.tables["expenses"]) == 3


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
    event = {"event_id": str(uuid4()), "source": "app_push", "issuer": "데모카드", "message_format": None,
             "amount": "1400", "currency": "KRW", "merchant": "예시마트", "approval_ref": "A1023",
             "occurred_at": None, "received_at": datetime.now(timezone.utc).isoformat(), "event_type": "approval"}
    url = "collector/events"
    req(device, "POST", url, event, 401)
    req(device, "POST", url, {**event, "trip_id": second_trip}, 400, auth)
    req(device, "POST", url, {**event, "amount": "-1"}, 400, auth)
    for fmt in (None, "rcs", "sms"):
        req(device, "POST", url, {**event, "source": "message", "message_format": fmt}, 422, auth)
    assert not db.tables.get("card_events")
    accepted = req(device, "POST", url, event, 201, auth)
    assert accepted["registration_status"] == "registered" and accepted["card_event"]["trip_id"] == trip
    original_id = accepted["card_event"]["expense_id"]
    assert sorted(s["split_krw_amount"] for s in db.tables["expense_splits"] if s["expense_id"] == original_id) == [700, 700]
    assert req(device, "POST", url, event, 200, auth)["duplicate"]
    req(device, "POST", url, {**event, "amount": "900"}, 409, auth)
    req(device, "POST", url, event, 409, {"Authorization": "Bearer " + other_token})
    same_ref = {**event, "event_id": str(uuid4())}
    req(device, "POST", url, same_ref, 201, {"Authorization": "Bearer " + other_token})
    inbox = f"card-events/unassigned?trip_id={trip}&scoped=true"
    req(device, "GET", inbox, status=401)
    req(outsider, "GET", inbox, status=403)
    rows = req(owner, "GET", inbox)["unassigned_cards"]
    assert not rows
    reviews = f"v1/trips/{trip}/card-events"
    confirmation = {"card_event_id": event["event_id"], "payer_member_id": payer}
    req(owner, "POST", reviews, {**confirmation, "payer_member_id": guest}, 404)
    req(owner, "POST", reviews, confirmation, 409)
    assert not req(owner, "GET", inbox)["unassigned_cards"]
    assert not req(outsider, "GET", f"card-events/unassigned?trip_id={second_trip}&scoped=true")["unassigned_cards"]
    req(owner, "POST", "v1/card-events/parse", {"message": "결제 문자"}, 410)
    approval = {"payer_member_id": payer, "event_id": str(uuid4()), "amount": 5000, "currency":"JPY",
                "issuer":"예시카드", "approval_ref":"ORDER2", "event_type":"approval","merchant":"TOKYO SHOP",
                "exchange_rate":"9.2","split_type":"equal","splits":[{"member_id":payer},{"member_id":guest}]}
    req(owner, "POST", reviews, {**approval, "message": "결제 문자"}, 422)
    req(owner, "POST", reviews, {**approval, "source": "message"}, 422)
    assert req(owner, "POST", reviews, approval, 201)["data"]["krw_amount"] == 46000
    req(owner, "POST", reviews, {**approval, "event_id":str(uuid4())}, 409)
    count = len(db.tables["expenses"])
    req(owner, "POST", reviews, {**approval,"event_id":str(uuid4()),"approval_ref":"other","currency":"USD","exchange_rate":None}, 422)
    assert len(db.tables["expenses"]) == count
    refund = {**event, "event_id":str(uuid4()), "amount":"399","event_type":"cancel"}
    db.fail_next.add("expense_splits")
    req(device, "POST", url, refund, 500, auth)
    assert len(db.tables["expenses"]) == count
    refunded = req(device, "POST", url, refund, 200, auth)
    refund_id = refunded["card_event"]["expense_id"]
    assert next(e["krw_amount"] for e in db.tables["expenses"] if e["id"] == refund_id) == -399
    cancel_body = {"payer_member_id":payer,"card_event_id":refund["event_id"],"original_expense_id":original_id,
                   "event_type":"partial_cancellation"}
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

    sync = f"v1/trips/{trip}/card-events/sync"
    req(outsider, "POST", sync, {}, 403)
    # A cancellation may reach the server before its purchase. Collecting the purchase
    # applies the waiting credit even when there is no browser open.
    early = {**event, "event_id": str(uuid4()), "approval_ref": "ARRIVED-LATER", "event_type": "cancel"}
    assert req(device, "POST", url, early, 201, auth)["registration_status"] == "pending_original"
    purchase = {**early, "event_id": str(uuid4()), "event_type": "approval"}
    bought = req(device, "POST", url, purchase, 201, auth)["card_event"]["expense_id"]
    assert any(e.get("original_expense_id") == bought and e["krw_amount"] == -1400 for e in db.tables["expenses"])
    # Prior databases cannot safely distinguish simultaneous equal-value refund receipts.
    # Neither ingest nor an explicit original selection may claim a different push or message.
    isolated = {**event, "event_id": str(uuid4()), "approval_ref": "REFUND-GUARD"}
    isolated_id = req(device, "POST", url, isolated, 201, auth)["card_event"]["expense_id"]
    coincident = {**isolated, "event_type": "cancel", "amount": "388", "occurred_at": "2026-11-17T12:00:00+09:00"}
    twin_id = str(uuid4())
    db.table("card_events").insert({**coincident, **pair_args, "event_id": twin_id, "source": "message"}).execute()
    next_refund = {**coincident, "event_id": str(uuid4())}
    assert req(device, "POST", url, next_refund, 201, auth)["registration_status"] == "pending_original"
    req(owner, "POST", reviews, {"card_event_id": next_refund["event_id"], "payer_member_id": payer,
            "original_expense_id": isolated_id}, 422)
    assert not any(r.get("expense_id") for r in db.tables["card_events"]
                   if r["event_id"] in (twin_id, next_refund["event_id"]))

    # A missing quote persists the raw USD receipt and signals a retry to the phone.
    from unittest.mock import patch
    from core.errors import AppError
    fx = {**event, "event_id": str(uuid4()), "approval_ref": "USD01", "merchant": "Blue Cafe",
          "amount": "12.50", "currency": "USD", "occurred_at": "2026-11-17T01:30:00+09:00"}
    with patch("services.reference_rates.lookup", side_effect=AppError("unavailable", 503)):
        req(device, "POST", url, fx, 503, auth)
        assert req(owner, "POST", sync, {})["data"]["registered_count"] == 0
    assert any(e["event_id"] == fx["event_id"] and not e.get("expense_id") for e in db.tables["card_events"])
    with patch("services.reference_rates.lookup", return_value={"rate": 1401.2, "rate_date": "2026-11-16"}) as get_rate:
        assert req(owner, "POST", sync, {})["data"]["registered_count"] == 1
        get_rate.assert_called_once_with("USD", "KRW", "2026-11-17")
    fx_id = req(device, "POST", url, fx, 200, auth)["card_event"]["expense_id"]
    expense = next(e for e in db.tables["expenses"] if e["id"] == fx_id)
    assert expense["krw_amount"] == 17515 and expense["rate_date"] == "2026-11-16"
    assert sorted(s["split_krw_amount"] for s in db.tables["expense_splits"] if s["expense_id"] == fx_id) == [8757, 8758]
    req(owner, "DELETE", f"{cash_url}/{fx_id}", status=409)
    # Exercise the older management endpoint/service, which allows explicit removal of card purchases.
    from services import expenses
    expenses.delete_expense(trip, fx_id)
    req(owner, "POST", sync, {})
    assert req(device, "POST", url, fx, 200, auth)["registration_status"] == "skipped"
    assert not any(e["title"] == "Blue Cafe" for e in db.tables["expenses"])
    # The collector now accepts only app pushes. Two different notification UUIDs are
    # independent even when a card issuer reuses its approval reference and amount.
    new_push = req(device, "POST", url, {**event, "event_id": str(uuid4())}, 201, auth)["card_event"]
    assert new_push["expense_id"] != original_id
    db.table("card_events").insert({**event, **pair_args, "event_id": "0001-incomplete", "amount": "?"}).execute()
    db.table("card_events").insert({**event, **pair_args, "event_id": "0002-no-payer", "payer_member_id": None}).execute()
    db.table("card_events").insert({**event, **pair_args, "event_id": "0003-old-message", "source": "message"}).execute()
    db.table("card_events").insert({**event, **pair_args, "event_id": "0004-old-push", "received_at": None,
                                    "created_at": event["received_at"]}).execute()
    assert req(owner, "POST", sync, {})["data"]["registered_count"] == 1
    archive = req(owner, "GET", reviews)["data"]
    assert {row["event_id"] for row in archive if not row.get("expense_id")} >= {
        "0001-incomplete", "0002-no-payer", "0003-old-message"}
    assert next(row for row in archive if row["event_id"] == "0004-old-push")["expense_id"]
    assert all(r["source"] == "app_push" for r in req(owner, "GET", reviews + "?source=app_push")["data"])
    revision = f"v1/trips/{trip}/expense-revision"
    req(outsider, "GET", revision, status=403)
    ids = [r["id"] for r in db.tables["expenses"] if r["trip_id"] == trip]
    assert req(owner, "GET", revision)["data"] == {"count": len(ids), "latest_id": max(ids)}


if __name__ == "__main__":
    test_mobile_and_reviewed_events()
    print("PASS: signed push-only ingestion, automatic registration, retries, refunds and splits")
