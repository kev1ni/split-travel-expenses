"""
카드 파싱 앱 → 백엔드 전송 예제 (표준 라이브러리만 사용, 설치 필요 없음)

파싱 앱이 카드 승인 문자/RCS/푸시를 파싱한 뒤, 아래 send_card_event()처럼
POST /api/card-events 로 JSON을 보내면 됩니다.

실행 (서버가 켜져 있어야 함):
    python examples/parser/send_card_event.py
    python examples/parser/send_card_event.py --url http://192.168.0.10:5000 --api-key 내키

핵심 규칙
1. event_id는 알림 1건마다 한 번 만든 UUID를 끝까지 재사용 → 재전송해도 중복 저장 안 됨 (200 + duplicate)
2. 승인/취소를 구분하고 푸시에 표시된 승인번호가 있으면 전달
3. 시각은 오프셋 포함 ISO 8601 (예: 2026-11-17T09:59:30+09:00)
4. 서버 .env에 PARSER_API_KEY가 있으면 X-API-Key 헤더 필수 (없으면 401)
5. 네트워크 오류·5xx는 재시도, 4xx는 데이터 문제이므로 재시도하지 말고 로그 확인
"""

import argparse
import json
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def send_card_event(base_url: str, event: dict, api_key: str = None, retries: int = 3, timeout: float = 5.0) -> dict:
    """
    카드 이벤트 1건 전송. 성공 시 서버 응답(dict) 반환.
    - 201: 새로 저장 / 200: 이미 받은 event_id (duplicate=True)
    - 4xx: 재시도 없이 예외, 네트워크 오류·5xx: 지수 백오프로 재시도
    """
    url = base_url.rstrip("/") + "/api/card-events"
    body = json.dumps(event, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    last_error = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            if 400 <= e.code < 500:
                raise RuntimeError(f"[{e.code}] 요청 데이터 오류 (재시도 안 함): {detail}") from e
            last_error = f"[{e.code}] {detail}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_error = f"연결 실패: {e}"
        time.sleep(2 ** (attempt - 1))  # 1초, 2초, 4초...
    raise RuntimeError(f"{retries}회 시도 후 실패: {last_error}")


def build_event(parsed: dict) -> dict:
    """
    파싱 결과(dict)를 서버 형식으로 변환하는 예시.
    parsed 예: {"issuer": "현대카드", "type": "승인", "amount": "1,400", "merchant": "예시마트", "approval_no": "30012345", "time": datetime}
    """
    return {
        "event_id": str(uuid.uuid4()),                     # 알림 1건당 1번 생성 → 재전송 시 같은 값
        "source": "app_push",
        "message_format": None,
        "issuer": parsed["issuer"],
        "event_type": "cancel" if parsed.get("type") == "취소" else "approval",
        "amount": str(parsed["amount"]),                   # 원문 그대로 OK ("1,400")
        "currency": parsed.get("currency", "KRW"),
        "merchant": parsed.get("merchant"),
        "approval_ref": parsed.get("approval_no"),
        "occurred_at": parsed["time"].isoformat() if parsed.get("time") else None,
        "received_at": datetime.now(KST).isoformat(),
        # 앱에서 현재 여행/결제자를 알고 있으면 함께 보내기 (모르면 생략)
        # "trip_id": 1,
        # "payer_member_id": 1,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5000")
    ap.add_argument("--api-key", default=None)
    args = ap.parse_args()

    parsed = {
        "issuer": "현대카드", "type": "승인", "amount": "1,400", "merchant": "예시마트샘플점",
        "approval_no": "30012345", "time": datetime.now(KST),
    }
    event = build_event(parsed)
    print("1) 최초 전송:", send_card_event(args.url, event, args.api_key))
    print("2) 같은 event_id 재전송 (duplicate=True 기대):", send_card_event(args.url, event, args.api_key)["duplicate"])
