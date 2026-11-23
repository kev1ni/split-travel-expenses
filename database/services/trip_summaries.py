"""Build the home and trip list cards from current memberships and balances."""
from collections import defaultdict

from core.db import (TABLE_EXPENSE_SPLITS, TABLE_EXPENSES, TABLE_SETTLEMENTS,
                     TABLE_TRIP_MEMBERS, TABLE_TRIPS, get_supabase_client)
from core.errors import NotFoundError
from services.settlements import balance_rows, balances_from_rows, named_settlements


def _pages(query, key="id"):
    """Use an ordered cursor and the returned count, even with a lower PostgREST row cap."""
    after = None
    while True:
        page = query().order(key).limit(500)
        if after is not None:
            page = page.gt(key, after)
        result = page.execute()
        rows = result.data or []
        yield from rows
        if not rows or len(rows) == result.count:
            return
        after = rows[-1][key]


def _group_rows(client, table, columns, trip_ids, *, completed_only=False):
    def query():
        rows = client.table(table).select(columns, count="exact").in_("trip_id", trip_ids)
        return rows.eq("status", "completed") if completed_only else rows

    groups = defaultdict(list)
    for row in _pages(query):
        groups[row["trip_id"]].append(row)
    return groups


def get_trip_summaries(session_row):
    client = get_supabase_client()
    user_id = session_row["user_id"]
    if user_id is None:
        links = _pages(lambda: client.table("web_guest_members").select("trip_id,member_id", count="exact")
                       .eq("token_hash", session_row["token_hash"]), key="trip_id")
        my_members = {link["trip_id"]: link["member_id"] for link in links}
    else:
        links = _pages(lambda: client.table(TABLE_TRIP_MEMBERS).select("id,trip_id", count="exact")
                       .eq("user_id", user_id))
        my_members = {link["trip_id"]: link["id"] for link in links}

    return _summaries_for_members(client, my_members, user_id)


def get_settlement_detail(trip_id, member):
    rows = _summaries_for_members(get_supabase_client(), {trip_id: member["id"]},
                                  member.get("user_id"), show_transfers=True)
    if not rows:
        raise NotFoundError("이 여행 또는 참가자를 찾을 수 없습니다.")
    return rows[0]


def _summaries_for_members(client, my_members, user_id, *, show_transfers=False):
    summaries = []
    trip_ids = list(my_members)
    # Keep filters below URL length limits even for accounts with many trips.
    for start in range(0, len(trip_ids), 80):
        batch = trip_ids[start:start + 80]
        members = _group_rows(client, TABLE_TRIP_MEMBERS, "id,trip_id,user_id,nickname", batch)
        allowed = [tid for tid in batch if any(
            m["id"] == my_members[tid] and m.get("user_id") == user_id for m in members[tid]
        )]
        if not allowed:
            continue
        trip_rows = _pages(lambda: client.table(TABLE_TRIPS).select("*", count="exact").in_("id", allowed))
        expenses = _group_rows(client, TABLE_EXPENSES, "id,trip_id,payer_member_id,krw_amount", allowed)
        splits = _group_rows(client, TABLE_EXPENSE_SPLITS, "id,trip_id,member_id,split_krw_amount", allowed)
        transfer_columns = "*" if show_transfers else "id,trip_id,sender_member_id,receiver_member_id,amount,status"
        transfers = _group_rows(client, TABLE_SETTLEMENTS, transfer_columns, allowed, completed_only=not show_transfers)
        for trip in trip_rows:
            tid = trip["id"]
            completed = (s for s in transfers[tid] if s["status"] == "completed")
            balances = balances_from_rows(members[tid], expenses[tid], splits[tid], completed)
            summary = {
                **trip, "members": members[tid], "member_count": len(members[tid]), "my_member_id": my_members[tid],
                "expense_count": len(expenses[tid]), "total_krw_amount": sum(b["paid"] for b in balances.values()),
                "my_unsettled_krw_amount": balances[my_members[tid]]["outstanding"],
                "has_unsettled_balance": any(b["outstanding"] for b in balances.values()),
            }
            if show_transfers:
                names = {m["id"]: m["nickname"] for m in members[tid]}
                summary["balances"] = balance_rows(tid, balances, names)
                summary["settlements"] = named_settlements(transfers[tid], names)
            summaries.append(summary)
    return sorted(summaries, key=lambda row: (row.get("start_date") is None, row.get("start_date") or ""),
                  reverse=True)
