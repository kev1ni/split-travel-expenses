"""
잔액 계산 + 정산 (SETTLEMENTS): 멤버 잔액, 최소 송금 계산, 송금 완료/취소
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional

from core.constants import UNKNOWN_NICKNAME
from core.db import TABLE_EXPENSE_SPLITS, TABLE_EXPENSES, TABLE_SETTLEMENTS, TABLE_TRIP_MEMBERS, get_supabase_client
from core.errors import ConflictError, NotFoundError, ValidationError
from core.validators import db_call, first, now_iso, to_int
from services.common import get_trip_or_404, member_name_map


# ------------------------------------------------------------------
# 잔액
# ------------------------------------------------------------------
def compute_trip_balances(client, trip_id: int) -> Dict[int, Dict[str, int]]:
    """
    멤버별 잔액
    - paid / owed : 결제한 금액 / 분담할 금액
    - net         : paid - owed (+ 받을 돈, - 보낼 돈)
    - sent / received : 송금 완료(completed)로 보낸 / 받은 금액
    - outstanding : 완료 송금 반영 후 남은 잔액 = net + sent - received
    """
    members = client.table(TABLE_TRIP_MEMBERS).select("id").eq("trip_id", trip_id).execute().data or []
    expenses = client.table(TABLE_EXPENSES).select("payer_member_id, krw_amount").eq("trip_id", trip_id).execute().data or []
    splits = client.table(TABLE_EXPENSE_SPLITS).select("member_id, split_krw_amount").eq("trip_id", trip_id).execute().data or []
    completed = (
        client.table(TABLE_SETTLEMENTS).select("sender_member_id, receiver_member_id, amount")
        .eq("trip_id", trip_id).eq("status", "completed").execute().data or []
    )
    return balances_from_rows(members, expenses, splits, completed)


def balances_from_rows(members, expenses, splits, completed):
    balances = defaultdict(lambda: {"paid": 0, "owed": 0, "sent": 0, "received": 0})
    for m in members:
        balances[m["id"]]
    for e in expenses:
        balances[e["payer_member_id"]]["paid"] += int(e["krw_amount"])
    for s in splits:
        balances[s["member_id"]]["owed"] += int(s["split_krw_amount"])
    for s in completed:
        balances[s["sender_member_id"]]["sent"] += int(s["amount"])
        balances[s["receiver_member_id"]]["received"] += int(s["amount"])

    for b in balances.values():
        b["net"] = b["paid"] - b["owed"]
        b["outstanding"] = b["net"] + b["sent"] - b["received"]
    return dict(balances)


def _balance_view(trip_id: int, member_id: int, b: Dict[str, int]) -> Dict[str, Any]:
    return {
        "trip_id": trip_id,
        "member_id": member_id,
        "total_paid": b["paid"],
        "total_owed": b["owed"],
        "net_balance": b["net"],
        "settled_sent": b["sent"],
        "settled_received": b["received"],
        "outstanding_balance": b["outstanding"],
    }


def get_member_balance(trip_id: int, member_id: int) -> Dict[str, Any]:
    client = get_supabase_client()
    get_trip_or_404(client, trip_id)
    empty = {"paid": 0, "owed": 0, "net": 0, "sent": 0, "received": 0, "outstanding": 0}
    return _balance_view(trip_id, member_id, compute_trip_balances(client, trip_id).get(member_id, empty))


def get_trip_balances(trip_id: int) -> List[Dict[str, Any]]:
    client = get_supabase_client()
    get_trip_or_404(client, trip_id)
    names = member_name_map(client, trip_id)
    return balance_rows(trip_id, compute_trip_balances(client, trip_id), names)


def balance_rows(trip_id, balances, names):
    return [
        {**_balance_view(trip_id, mid, b), "nickname": names.get(mid, UNKNOWN_NICKNAME)}
        for mid, b in sorted(balances.items())
    ]


# ------------------------------------------------------------------
# 정산
# ------------------------------------------------------------------
def transfer_rows(trip_id, balances):
    """Compute transfers from remaining KRW balances without writing to the database."""
    creditors = sorted(([m, b["outstanding"]] for m, b in balances.items() if b["outstanding"] > 0), key=lambda x: (-x[1], x[0]))
    debtors = sorted(([m, -b["outstanding"]] for m, b in balances.items() if b["outstanding"] < 0), key=lambda x: (-x[1], x[0]))

    rows, c, d = [], 0, 0
    while c < len(creditors) and d < len(debtors):
        amt = min(creditors[c][1], debtors[d][1])
        rows.append({
            "trip_id": trip_id,
            "sender_member_id": debtors[d][0],
            "receiver_member_id": creditors[c][0],
            "amount": amt,
            "status": "pending",
        })
        creditors[c][1] -= amt
        debtors[d][1] -= amt
        c += creditors[c][1] == 0
        d += debtors[d][1] == 0

    return rows


def calculate_settlements(trip_id: int) -> List[Dict[str, Any]]:
    """
    최소 송금 정산 (큰 금액부터 매칭하는 Greedy).
    completed 송금은 유지·반영, 기존 pending 정산은 삭제 후 새로 계산 (중복 생성 없음).
    """
    client = get_supabase_client()
    trip_id = to_int(trip_id, "trip_id")
    get_trip_or_404(client, trip_id)

    balances = compute_trip_balances(client, trip_id)
    if not any(b["paid"] or b["owed"] for b in balances.values()):
        raise ValidationError("정산할 지출 내역이 없습니다.")

    rows = transfer_rows(trip_id, balances)
    current = list_settlements(trip_id, "pending")
    def signature(items):
        return sorted((i["sender_member_id"], i["receiver_member_id"], i["amount"]) for i in items)
    if signature(rows) == signature(current):
        return current

    db_call("기존 대기 정산 삭제",
            lambda: client.table(TABLE_SETTLEMENTS).delete().eq("trip_id", trip_id).eq("status", "pending").execute())
    if not rows:
        return []
    saved = db_call("정산 저장", lambda: client.table(TABLE_SETTLEMENTS).insert(rows).execute()).data or rows
    return _attach_names(client, trip_id, saved)


def _attach_names(client, trip_id: int, settlements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return named_settlements(settlements, member_name_map(client, trip_id))


def named_settlements(settlements, names):
    for s in settlements:
        s["sender_nickname"] = names.get(s["sender_member_id"], UNKNOWN_NICKNAME)
        s["receiver_nickname"] = names.get(s["receiver_member_id"], UNKNOWN_NICKNAME)
    return settlements


def _settlement_rpc(name, params):
    client = get_supabase_client()
    def run():
        try:
            return client.rpc(name, params).execute().data
        except Exception as exc:
            if getattr(exc, "code", None) == "40001":
                raise ConflictError("지출 내역이 변경 중입니다. 잠시 후 다시 확인해주세요.") from exc
            if getattr(exc, "code", None) == "P0002":
                raise NotFoundError("이 여행의 정산 내역을 찾을 수 없습니다.") from exc
            raise
    return db_call("여행 정산", run)


def confirm_trip_settlements(trip_id):
    return _settlement_rpc("confirm_trip_settlements", {"p_trip_id": trip_id})


def complete_trip_settlement(trip_id, settlement_id):
    return _settlement_rpc("complete_trip_settlement", {"p_trip_id": trip_id, "p_settlement_id": settlement_id})


def list_settlements(trip_id: int, status: Optional[str] = None) -> List[Dict[str, Any]]:
    client = get_supabase_client()
    q = client.table(TABLE_SETTLEMENTS).select("*").eq("trip_id", trip_id)
    if status:
        q = q.eq("status", status.strip().lower())
    return _attach_names(client, trip_id, q.order("id").execute().data or [])


def _get_settlement_or_404(client, settlement_id: int) -> Dict[str, Any]:
    row = first(client.table(TABLE_SETTLEMENTS).select("*").eq("id", settlement_id).execute())
    if not row:
        raise NotFoundError(f"존재하지 않는 정산 내역입니다 (settlement_id: {settlement_id}).")
    return row


def complete_settlement(settlement_id: int) -> Dict[str, Any]:
    """송금 완료 (pending → completed)"""
    client = get_supabase_client()
    row = _get_settlement_or_404(client, settlement_id)
    if row.get("status") == "completed":
        raise ConflictError("이미 송금 완료 처리된 정산입니다.")
    update = {"status": "completed", "completed_at": now_iso()}
    res = db_call("송금 완료 처리", lambda: client.table(TABLE_SETTLEMENTS).update(update).eq("id", settlement_id).execute())
    return first(res) or {**row, **update}


def cancel_settlement(settlement_id: int) -> Dict[str, Any]:
    """송금 완료 취소 (completed → pending)"""
    client = get_supabase_client()
    row = _get_settlement_or_404(client, settlement_id)
    if row.get("status") != "completed":
        raise ConflictError("송금 완료 상태가 아닌 정산입니다.")
    update = {"status": "pending", "completed_at": None}
    res = db_call("송금 완료 취소", lambda: client.table(TABLE_SETTLEMENTS).update(update).eq("id", settlement_id).execute())
    return first(res) or {**row, **update}
