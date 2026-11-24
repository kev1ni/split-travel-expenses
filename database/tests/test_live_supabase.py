"""
실제 Supabase DB 연결 통합 테스트

.env의 Supabase에 실제로 데이터를 넣고 → 전체 API 흐름을 검증한 뒤 → 만든 데이터를 모두 삭제합니다.
(Flask 서버를 따로 켤 필요 없음. 앱을 내부에서 직접 호출합니다.)

실행:
    python tests/test_live_supabase.py            # 연결 대상 확인 후 y 입력 시 실행
    python tests/test_live_supabase.py --yes      # 확인 없이 실행
    python tests/test_live_supabase.py --keep     # 테스트 데이터를 지우지 않고 남김 (대시보드에서 확인용)
    RUN_LIVE_TESTS=1 pytest tests                 # pytest로 실행할 때 (기본은 건너뜀)

안전장치
- 테스트 데이터는 login_id / 닉네임 / event_id가 모두 `livetest_xxxxxxxx`로 시작합니다.
- 실패하거나 중간에 멈춰도(Ctrl+C 포함) 만든 데이터는 finally에서 삭제합니다.
- 삭제는 이 실행에서 만든 user/trip/event ID로만 하므로 기존 데이터는 건드리지 않습니다.
"""

import argparse
import os
import sys
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from config import settings  # noqa: E402
from core import db  # noqa: E402
from core.db import (  # noqa: E402
    TABLE_CARD_EVENTS, TABLE_CURRENCY_EXCHANGES, TABLE_EXPENSE_SPLITS, TABLE_EXPENSES,
    TABLE_SETTLEMENTS, TABLE_TRIP_MEMBERS, TABLE_TRIPS, TABLE_USERS,
)

KST = timezone(timedelta(hours=9))


class StepFailed(Exception):
    pass


class LiveTest:
    def __init__(self, verbose: bool = True):
        self.run_id = uuid.uuid4().hex[:8]
        self.prefix = f"livetest_{self.run_id}"
        self.verbose = verbose
        self.created = {"users": [], "trips": [], "events": []}
        self.results = []  # (name, ok, detail)
        settings.parser_api_key = None  # 내부 호출이라 API 키 검사 생략
        from app import create_app

        self.client = create_app(legacy_test=True).test_client()

    # ------------------------------------------------------------
    # 도우미
    # ------------------------------------------------------------
    def call(self, method, url, body=None, expect=None):
        fn = getattr(self.client, method)
        r = fn(url, json=body) if body is not None else fn(url)
        data = r.get_json(silent=True)
        if expect is not None and r.status_code != expect:
            msg = data.get("message") if isinstance(data, dict) else r.data[:300]
            raise StepFailed(f"{method.upper()} {url} → {r.status_code} (기대 {expect}): {msg}")
        return data

    def step(self, name, fn, critical=True, hint=None):
        """단계 실행. critical 단계가 실패하면 이후 단계는 진행하지 않음"""
        started = time.perf_counter()
        try:
            fn()
            self.results.append((name, True, f"{(time.perf_counter() - started) * 1000:.0f}ms"))
            if self.verbose:
                print(f"  ✅ {name}")
        except Exception as e:  # noqa: BLE001
            detail = str(e) if isinstance(e, (StepFailed, AssertionError)) else f"{type(e).__name__}: {e}"
            if hint:
                detail += f"\n       💡 {hint}"
            self.results.append((name, False, detail))
            if self.verbose:
                print(f"  ❌ {name}\n       {detail}")
            if critical:
                raise StepFailed(name)

    # ------------------------------------------------------------
    # 시나리오
    # ------------------------------------------------------------
    def run(self):
        p, s = self.prefix, {}

        def health():
            data = self.call("get", "/api/health?db=true")
            assert data and data.get("database") == "connected", f"DB 연결 실패: {data}"

        self.step("1. DB 연결 (/api/health?db=true)", health,
                  hint=".env의 SUPABASE_URL / 키 확인, 인터넷 연결 확인")

        def tables():
            sb = db.get_supabase_client()
            missing = []
            for t in (TABLE_USERS, TABLE_TRIPS, TABLE_TRIP_MEMBERS, TABLE_CURRENCY_EXCHANGES,
                      TABLE_EXPENSES, TABLE_EXPENSE_SPLITS, TABLE_SETTLEMENTS, TABLE_CARD_EVENTS):
                try:
                    sb.table(t).select("*").limit(1).execute()
                except Exception as e:  # noqa: BLE001
                    missing.append(f"{t} ({str(e)[:80]})")
            assert not missing, "조회 실패 테이블: " + ", ".join(missing)

        self.step("2. 테이블 8개 접근", tables,
                  hint="sql/schema.sql 실행 여부, core/db.py 테이블명 대소문자, RLS 설정 확인")

        # ---------- 회원 ----------
        def users():
            pw = "livetest-pass-1234"
            for key in ("a", "b"):
                u = self.call("post", "/api/register", {
                    "login_id": f"{p}_{key}", "password": pw, "name": f"테스트{key}",
                    "email": f"{p}_{key}@example.com",
                }, 201)["user"]
                self.created["users"].append(u["id"])
                s[f"user_{key}"] = u
            self.call("post", "/api/register", {
                "login_id": f"{p}_a", "password": pw, "name": "x", "email": f"{p}_dup@example.com"}, 409)
            logged = self.call("post", "/api/login", {"login_id": f"{p}_a", "password": pw}, 200)["user"]
            assert logged["id"] == s["user_a"]["id"] and "password_hash" not in logged
            self.call("post", "/api/login", {"login_id": f"{p}_a", "password": "wrong-password"}, 401)

        self.step("3. 회원가입 / 중복 409 / 로그인 / 로그인 실패 401", users)

        # ---------- 여행 / 멤버 ----------
        def trips():
            res = self.call("post", "/api/trips", {
                "title": f"{p} 도쿄", "destination_country": "일본", "destination_currency": "JPY",
                "start_date": "2026-11-25", "end_date": "2026-11-29",
                "created_by": s["user_a"]["id"], "creator_nickname": f"{p}_방장",
            }, 201)
            s["trip"] = res["trip"]
            self.created["trips"].append(res["trip"]["id"])
            s["m1"] = res["owner_member"]["id"]
            code = res["trip"]["share_code"]

            preview = self.call("get", f"/api/trips/share/{code.lower()}", expect=200)["trip"]
            assert preview["member_count"] == 1, preview
            s["m2"] = self.call("post", "/api/trips/join", {
                "share_code": code, "user_id": s["user_b"]["id"], "nickname": f"{p}_철수"}, 201)["member"]["id"]
            self.call("post", "/api/trips/join", {
                "share_code": code, "user_id": s["user_b"]["id"], "nickname": f"{p}_철수2"}, 409)
            s["m3"] = self.call("post", f"/api/trips/{s['trip']['id']}/members",
                                {"nickname": f"{p}_영희"}, 201)["member"]["id"]

            detail = self.call("get", f"/api/trips/{s['trip']['id']}", expect=200)["trip"]
            assert detail["member_count"] == 3, detail
            my = self.call("get", f"/api/users/{s['user_a']['id']}/trips", expect=200)["trips"]
            assert any(t["id"] == s["trip"]["id"] and t["my_member_id"] == s["m1"] for t in my)

        self.step("4. 여행 생성 / 초대코드 참가 / 게스트 추가 / 상세", trips)
        tid = s["trip"]["id"]
        members = [s["m1"], s["m2"], s["m3"]]

        # ---------- 지출 ----------
        def expense_equal():
            res = self.call("post", f"/api/trips/{tid}/expenses", {
                "expense": {"payer_member_id": s["m1"], "title": "라멘", "category": "식비",
                            "amount": 3960, "currency": "JPY", "exchange_rate": 9.1,
                            "spent_at": "2026-11-25 12:30:00"},
                "split": {"split_type": "equal", "member_ids": members},
            }, 201)
            assert res["expense"]["krw_amount"] == 36036, res["expense"]
            assert sorted(x["split_krw_amount"] for x in res["splits"]) == [12012] * 3
            spent = datetime.fromisoformat(res["expense"]["spent_at"].replace("Z", "+00:00")).astimezone(KST)
            assert spent.hour == 12 and spent.minute == 30, f"시간대 오차: {res['expense']['spent_at']}"
            s["e1"] = res["expense"]["id"]

        self.step("5. 지출 등록 (JPY 균등 분할, 원화 자동 계산, +09:00 시간대)", expense_equal)

        def expense_decimal():
            res = self.call("post", f"/api/trips/{tid}/expenses", {
                "expense": {"payer_member_id": s["m2"], "title": "택시", "category": "교통",
                            "amount": "12.50", "currency": "USD", "exchange_rate": 1400, "payment_method": "cash"},
            }, 201)
            assert res["expense"]["krw_amount"] == 17500
            assert float(res["expense"]["amount"]) == 12.5, f"소수 금액 저장 안 됨: {res['expense']['amount']}"
            s["e2"] = res["expense"]["id"]

        self.step("6. 외화 소수 금액 (12.50 USD, 분할 생략 → 전체 균등)", expense_decimal, critical=False,
                  hint="amount 컬럼이 INTEGER면 실패합니다 → sql/migrations/001_improvements.sql 실행")

        def expense_percentage():
            res = self.call("post", f"/api/trips/{tid}/expenses", {
                "expense": {"payer_member_id": s["m3"], "title": "숙소", "category": "숙박", "amount": 10001},
                "split": {"split_type": "percentage", "splits": [
                    {"member_id": s["m1"], "percentage_bp": 3333},
                    {"member_id": s["m2"], "percentage_bp": 3333},
                    {"member_id": s["m3"], "percentage_bp": 3334}]},
            }, 201)
            assert sum(x["split_krw_amount"] for x in res["splits"]) == 10001
            s["e3"] = res["expense"]["id"]

        self.step("7. 비율 분할 (합계 1원까지 일치)", expense_percentage)

        def expense_rollback():
            before = len(self.call("get", f"/api/trips/{tid}/expenses", expect=200)["expenses"])
            self.call("post", f"/api/trips/{tid}/expenses", {
                "expense": {"payer_member_id": s["m1"], "title": "x", "amount": 10000},
                "split": {"split_type": "exact", "splits": [{"member_id": s["m1"], "split_krw_amount": 5000}]},
            }, 400)
            self.call("post", f"/api/trips/{tid}/expenses",
                      {"expense": {"payer_member_id": 999999999, "title": "x", "amount": 1}}, 400)
            after = len(self.call("get", f"/api/trips/{tid}/expenses", expect=200)["expenses"])
            assert before == after, "실패한 지출이 DB에 남음"

        self.step("8. 잘못된 지출 400 + 고아 데이터 없음", expense_rollback)

        def expense_query_update():
            food = self.call("get", f"/api/trips/{tid}/expenses?category=식비", expect=200)["expenses"]
            assert [e["id"] for e in food] == [s["e1"]], food
            one = self.call("get", f"/api/trips/{tid}/expenses/{s['e3']}", expect=200)["expense"]
            assert one["payer_nickname"] == f"{p}_영희"
            upd = self.call("patch", f"/api/trips/{tid}/expenses/{s['e3']}", {
                "expense": {"amount": 20000},
                "split": {"split_type": "equal", "member_ids": [s["m1"], s["m3"]]}}, 200)
            assert [x["split_krw_amount"] for x in upd["splits"]] == [10000, 10000], upd["splits"]

        self.step("9. 지출 필터 조회 / 1건 조회 / 수정(분할 교체)", expense_query_update)

        # ---------- 환전 / 통계 ----------
        def exchange_summary():
            ex = self.call("post", f"/api/trips/{tid}/exchanges", {
                "member_id": s["m1"], "currency": "jpy", "original_krw_amount": 91000,
                "exchanged_amount": 10000, "memo": p}, 201)["exchange"]
            assert float(ex["exchange_rate"]) == 9.1, ex
            assert len(self.call("get", f"/api/trips/{tid}/exchanges", expect=200)["exchanges"]) == 1
            sm = self.call("get", f"/api/trips/{tid}/summary", expect=200)["summary"]
            assert sm["expense_count"] >= 2 and sm["by_date"].get("2026-11-25") == 36036, sm
            assert sm["exchange_summary"]["by_currency"]["JPY"]["average_rate"] == 9.1

        self.step("10. 환전 등록(환율 자동) / 대시보드 통계", exchange_summary,
                  hint="exchange_rate 컬럼이 TEXT여도 동작해야 함. 실패 메시지 확인")

        # ---------- 정산 ----------
        def settle():
            first = self.call("post", f"/api/trips/{tid}/settle", expect=200)["settlements"]
            second = self.call("post", f"/api/trips/{tid}/settle", expect=200)["settlements"]
            assert len(first) == len(second) > 0
            pending = self.call("get", f"/api/trips/{tid}/settlements?status=pending", expect=200)["settlements"]
            assert len(pending) == len(second), "정산이 중복 생성됨"
            bal = self.call("get", f"/api/trips/{tid}/balances", expect=200)["balances"]
            assert sum(b["net_balance"] for b in bal) == 0, bal

            sid = second[0]["id"]
            done = self.call("patch", f"/api/settlements/{sid}/complete", expect=200)["settlement"]
            assert done["status"] == "completed"
            self.call("patch", f"/api/settlements/{sid}/complete", expect=409)
            for x in self.call("post", f"/api/trips/{tid}/settle", expect=200)["settlements"]:
                self.call("patch", f"/api/settlements/{x['id']}/complete", expect=200)
            assert self.call("post", f"/api/trips/{tid}/settle", expect=200)["settlements"] == []
            bal = self.call("get", f"/api/trips/{tid}/balances", expect=200)["balances"]
            assert all(b["outstanding_balance"] == 0 for b in bal), bal
            self.call("patch", f"/api/settlements/{sid}/cancel", expect=200)

        self.step("11. 정산 계산 / 재계산 중복 없음 / 송금 완료·취소", settle,
                  hint="status CHECK 제약 오류면 migration 미적용(대문자 'PENDING' 기본값) 가능성")

        # ---------- 카드 이벤트 ----------
        def card_events():
            ev = {"event_id": f"{p}_push", "source": "push", "issuer": f"{p}_카드", "event_type": "approval",
                  "amount": "1,400", "merchant": f"{p}_마트", "approval_ref": f"{p}_A1",
                  "received_at": datetime.now(KST).isoformat()}
            self.created["events"] += [f"{p}_rcs", f"{p}_push", f"{p}_sms"]
            assert self.call("post", "/api/card-events", ev, 201)["duplicate"] is False
            assert self.call("post", "/api/card-events", ev, 200)["duplicate"] is True
            self.call("post", "/api/card-events", {**ev, "event_id": f"{p}_rcs", "source": "rcs"}, 422)

            cards = self.call("get", f"/api/card-events/unassigned?trip_id={tid}&limit=100", expect=200)["unassigned_cards"]
            mine = [c for c in cards if c["event_id"] in (f"{p}_rcs", f"{p}_push")]
            assert len(mine) == 1 and not mine[0]["duplicate_event_ids"]

            res = self.call("post", f"/api/trips/{tid}/expenses", {
                "expense": {"payer_member_id": s["m1"], "title": "마트", "amount": 1400},
                "card_event_id": f"{p}_push"}, 201)
            assert res["linked_card_event_ids"] == [f"{p}_push"]
            assert res["expense"]["entry_type"] == "auto_card"
            self.call("post", f"/api/trips/{tid}/expenses", {
                "expense": {"payer_member_id": s["m1"], "title": "마트", "amount": 1400},
                "card_event_id": f"{p}_push"}, 409)

            self.call("post", "/api/card-events", {**ev, "event_id": f"{p}_sms", "source": "sms"}, 422)

            self.call("delete", f"/api/trips/{tid}/expenses/{res['expense']['id']}", expect=200)
            cards = self.call("get", f"/api/card-events/unassigned?trip_id={tid}&limit=100", expect=200)["unassigned_cards"]
            assert any(c["event_id"].startswith(p) for c in cards), "지출 삭제 후 카드 이벤트가 미등록으로 돌아오지 않음"

        self.step("12. 카드 푸시 수신 / 재전송 / 문자 거부 / 지출 연결 및 삭제", card_events)

        def not_found():
            self.call("get", "/api/trips/2147483000", expect=404)
            self.call("get", "/api/trips/2147483000/summary", expect=404)
            self.call("patch", "/api/settlements/2147483000/complete", expect=404)

        self.step("13. 없는 리소스 404", not_found, critical=False)

    # ------------------------------------------------------------
    # 정리
    # ------------------------------------------------------------
    def cleanup(self):
        sb = db.get_supabase_client()
        trips, users, events = self.created["trips"], self.created["users"], self.created["events"]
        errors = []

        def delete(table, column, values):
            if not values:
                return
            try:
                sb.table(table).delete().in_(column, values).execute()
            except Exception as e:  # noqa: BLE001
                errors.append(f"{table}: {e}")

        # FK 순서: 카드이벤트 → 정산 → 분할 → 지출 → 환전 → 멤버 → 여행 → 회원
        delete(TABLE_CARD_EVENTS, "event_id", events)
        delete(TABLE_CARD_EVENTS, "trip_id", trips)
        delete(TABLE_SETTLEMENTS, "trip_id", trips)
        delete(TABLE_EXPENSE_SPLITS, "trip_id", trips)
        if trips:  # 수정/취소 지출이 원본을 참조할 수 있으므로 참조 먼저 끊기
            try:
                sb.table(TABLE_EXPENSES).update({"original_expense_id": None}).in_("trip_id", trips).execute()
            except Exception:  # noqa: BLE001
                pass
        delete(TABLE_EXPENSES, "trip_id", trips)
        delete(TABLE_CURRENCY_EXCHANGES, "trip_id", trips)
        delete(TABLE_TRIP_MEMBERS, "trip_id", trips)
        delete(TABLE_TRIPS, "id", trips)
        delete(TABLE_USERS, "id", users)
        return errors

    def report(self) -> bool:
        passed = sum(1 for _, ok, _ in self.results if ok)
        failed = [(n, d) for n, ok, d in self.results if not ok]
        print(f"\n결과: {passed}개 통과, {len(failed)}개 실패")
        for n, d in failed:
            print(f"  ❌ {n}\n       {d}")
        return not failed


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="실제 Supabase DB 통합 테스트")
    ap.add_argument("--yes", action="store_true", help="확인 없이 실행")
    ap.add_argument("--keep", action="store_true", help="테스트 데이터를 삭제하지 않음")
    args = ap.parse_args(argv)

    if not settings.supabase_url or not settings.supabase_key:
        print("❌ .env에 SUPABASE_URL과 Supabase 키가 없습니다.")
        return 2

    print("=== 실제 Supabase DB 통합 테스트 ===")
    print(f"연결 대상 : {settings.supabase_url}")
    print(f"사용 키   : {settings.supabase_key_name}")
    print("이 DB에 테스트 데이터를 만들고, 끝나면 삭제합니다." + (" (--keep: 삭제 안 함)" if args.keep else ""))
    if not args.yes and input("계속할까요? (y/N): ").strip().lower() != "y":
        print("취소했습니다.")
        return 1

    test = LiveTest()
    print(f"테스트 ID : {test.prefix}\n")
    try:
        test.run()
    except StepFailed:
        print("\n⛔ 핵심 단계가 실패해서 이후 단계는 건너뜁니다.")
    except KeyboardInterrupt:
        print("\n⛔ 중단됨")
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    finally:
        if args.keep:
            print(f"\n🗂  테스트 데이터를 남겼습니다. (이름이 {test.prefix} 로 시작) 직접 삭제하세요.")
        else:
            errors = test.cleanup()
            if errors:
                print(f"\n⚠️  일부 테스트 데이터 삭제 실패 ({test.prefix}):")
                for e in errors:
                    print("   -", e)
            else:
                print("\n🧹 테스트 데이터 삭제 완료")

    return 0 if test.report() else 1


def test_live_supabase():
    """pytest용: RUN_LIVE_TESTS=1 일 때만 실행"""
    import pytest

    if os.environ.get("RUN_LIVE_TESTS") != "1":
        pytest.skip("실제 DB 테스트는 RUN_LIVE_TESTS=1 일 때만 실행합니다.")
    assert main(["--yes"]) == 0


if __name__ == "__main__":
    sys.exit(main())
