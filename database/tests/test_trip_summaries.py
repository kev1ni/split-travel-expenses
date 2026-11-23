"""Overview totals across PostgREST pages, trip batches and guest scopes."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fake_supabase import FakeClient
from core.db import set_supabase_client
from services.trip_summaries import get_trip_summaries


def test_summary_pages_and_membership():
    db = FakeClient()
    db.tables["trips"] = [{"id": n} for n in range(1, 83)]
    db.tables["trip_members"] = [
        {"id": n, "trip_id": n, "user_id": 8 if n == 82 else 7, "nickname": str(n)}
        for n in range(1, 83)]
    db.tables["trip_members"].append({"id": 83, "trip_id": 1, "user_id": None, "nickname": "Guest"})
    db.tables["web_guest_members"] = [
        {"token_hash": "guest", "trip_id": 1, "member_id": 83},
        {"token_hash": "guest", "trip_id": 82, "member_id": 82},  # not a guest seat
    ]
    db.tables["expenses"] = [{"id": n, "trip_id": 1, "payer_member_id": 1, "krw_amount": 2}
                             for n in range(1, 504)]
    db.tables["expense_splits"] = [{"id": n, "trip_id": 1, "member_id": 83, "split_krw_amount": 2}
                                   for n in range(1, 504)]
    db.tables["settlements"] = [{"id": 1, "trip_id": 1, "sender_member_id": 83, "receiver_member_id": 1,
                                 "status": "completed", "amount": 6}]
    set_supabase_client(db)
    try:
        summaries = get_trip_summaries({"user_id": 7})
        assert {row["id"] for row in summaries} == set(range(1, 82))
        first = next(row for row in summaries if row["id"] == 1)
        assert (first["expense_count"], first["total_krw_amount"], first["my_unsettled_krw_amount"]) == (503, 1006, 1000)
        guest, = get_trip_summaries({"user_id": None, "token_hash": "guest"})
        assert (guest["id"], guest["my_member_id"], guest["my_unsettled_krw_amount"]) == (1, 83, -1000)
    finally:
        set_supabase_client(None)
