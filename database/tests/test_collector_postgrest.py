"""Integration checks against a disposable PostgREST database with migrations 002–004.

The fixture creates its own accounts and trip. Run via check_postgrest(app, client);
pytest does not connect to a database by default.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4


def check_postgrest(app, db):
    web = app.test_client()
    suffix = uuid4().hex[:12]
    login = {"login_id": "qa" + suffix, "password": uuid4().hex}

    def call(method, path, data=None, status=200, headers=None, client=web):
        response = client.open("/api/" + path, method=method, json=data, headers=headers)
        assert response.status_code == status, (method, path, response.status_code, response.get_json())
        return response.get_json()

    call("POST", "v1/auth/signup", {**login,"nickname":"QA"}, 201)
    session_token = call("POST","v1/auth/login",login)["data"]["access_token"]
    session_auth = {"Authorization":"Bearer " + session_token}
    tid = call("POST","v1/trips",{"title":"승인 동시성 QA","destination_currency":"KRW"},201)["data"]["id"]
    payer = call("GET",f"v1/trips/{tid}/members")["data"][0]["id"]
    guest = call("POST",f"v1/trips/{tid}/members/guests",{"nickname":"QA 친구"},201)["data"]["id"]
    receive = "collector/events"
    auth = {"Authorization":"Bearer " + call("POST","collector/pair",{**login,"trip_id":tid,"payer_member_id":payer})["token"]}
    reviews = f"v1/trips/{tid}/card-events"
    event = {"event_id":str(uuid4()),"event_type":"approval","amount":"1400","currency":"KRW",
             "source":"message","issuer":"QA카드","merchant":"상점","approval_ref":"승인-0123","received_at":"2026-11-21T08:00:00+09:00"}

    def race(method, path, requests, headers):
        ready = Barrier(len(requests))
        def send(body):
            with app.test_client() as browser:
                ready.wait(timeout=5)
                res = browser.open("/api/" + path,method=method,json=body,headers=headers)
                return res.status_code, res.get_json()
        with ThreadPoolExecutor(max_workers=len(requests)) as workers:
            return list(workers.map(send, requests))

    responses = race("POST",receive,[event]*4,auth)
    assert sorted(s for s,_ in responses) == [200,200,200,201], responses
    twin = {**event,"event_id":str(uuid4()),"source":"app_push"}
    call("POST",receive,twin,201,auth)
    req = {"card_event_id":event["event_id"],"payer_member_id":payer}
    bodies = [req,{**req,"card_event_id":twin["event_id"]}]*2
    confirmations = race("POST",reviews,bodies,session_auth)
    assert sorted(s for s,_ in confirmations) == [201,409,409,409],confirmations
    original = next(j["data"]["expense_id"] for s,j in confirmations if s == 201)
    rows = db.table("expenses").select("*").eq("trip_id",tid).execute().data
    assert len(rows) == 1 and rows[0]["id"] == original
    late = call("POST",receive,{**event,"event_id":str(uuid4())},201,auth)["card_event"]
    assert late["expense_id"] == original

    # Two competing 800-won refunds can never credit 1,600 against a 1,400-won bill.
    refund_req = {"payer_member_id":payer,"event_type":"partial_cancellation","original_expense_id":original,
                  "amount":800,"currency":"KRW","merchant":"예시 상점"}
    refund_results = race("POST",reviews,[{**refund_req, "event_id":str(uuid4())} for _ in range(2)],session_auth)
    assert list(s for s,_ in refund_results).count(201) == 1 and all(s in (201,409,422) for s,_ in refund_results),refund_results
    refunded = db.table("expenses").select("*").eq("original_expense_id",original).execute().data
    assert len(refunded) == 1 and refunded[0]["krw_amount"] == -800
    settle_path=f"v1/trips/{tid}/settlements"
    previews = call("GET",settle_path+"/preview")["data"]["transfers"]
    assert len(previews)==1 and previews[0]["amount"]==300
    plans = race("POST",settle_path,[{}]*4,session_auth)
    assert all(s==201 and len(p["data"])==1 for s,p in plans),plans
    ids = {p["data"][0]["id"] for _,p in plans}
    assert len(ids)==1 and len(db.table("settlements").select("id").eq("trip_id",tid).execute().data)==1
    transfer_id=ids.pop()
    payments=race("PATCH",settle_path+"/"+str(transfer_id),[{"status":"completed"}]*4,session_auth)
    assert all(s==200 for s,p in payments) and len({p["data"]["completed_at"] for _,p in payments})==1,payments
    done = call("POST",reviews,{**refund_req,"event_id":str(uuid4()),"event_type":"cancellation","amount":"600"},201)["data"]
    assert done["krw_amount"]==-600
    expenses=db.table("expenses").select("id").eq("trip_id",tid).execute().data
    splits=db.table("expense_splits").select("member_id,split_krw_amount").in_("expense_id",[e["id"] for e in expenses]).execute().data
    assert len(expenses)==3 and all(sum(s["split_krw_amount"] for s in splits if s["member_id"]==m)==0 for m in (payer,guest))
    print("PASS PostgreSQL/PostgREST: parallel ingestion, parallel sibling confirmations, zero orphan expenses, refunds, concurrent settlements")
