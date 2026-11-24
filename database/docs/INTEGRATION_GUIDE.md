# 연동 가이드 (프론트엔드 · 카드 파싱 앱 담당자용)

이 문서만 보고 백엔드에 바로 연결할 수 있도록 정리했습니다. 각 API의 요청/응답 필드는 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)에 있습니다.

```
 ┌──────────────┐   fetch (JSON)   ┌────────────────────┐   supabase-py   ┌──────────┐
 │  프론트엔드   │ ───────────────▶ │  Flask 백엔드 서버  │ ──────────────▶ │ Supabase │
 └──────────────┘                  │  (이 database 폴더) │                 │ (Postgres)│
 ┌──────────────┐  POST /api/      │   http://IP:5000    │                 └──────────┘
 │ 카드 파싱 앱  │ ───────────────▶ │                    │
 └──────────────┘  collector/events     └────────────────────┘
```

> 프론트엔드와 파싱 앱은 **Supabase에 직접 접속하지 않습니다.** 모든 데이터는 백엔드 API를 통해서만 읽고 씁니다.

---

## 1. 백엔드 서버 띄우기 (공통)

```bash
cd database
python -m venv venv
.\venv\Scripts\Activate.ps1        # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env             # 값 채우기 (README의 환경변수 표 참고)
python app.py
```

서버가 켜지면 콘솔에 접속 주소가 나옵니다.
```
이 PC에서        : http://localhost:5000/api/health
같은 와이파이에서 : http://192.168.0.10:5000/api/health
```

**연결 확인**: 브라우저에서 `http://localhost:5000/api/health?db=true` → `"database": "connected"`가 보이면 준비 완료.

### 다른 기기(휴대폰, 다른 PC)에서 접속이 안 될 때
| 증상 | 해결 |
| :--- | :--- |
| 휴대폰에서 `localhost`로 접속 | 휴대폰의 localhost는 휴대폰 자신입니다. 서버 PC의 IP(`192.168.x.x`)를 쓰세요 |
| 같은 와이파이인데 연결 안 됨 | Windows 방화벽에서 Python의 "개인 네트워크" 허용, 또는 5000번 포트 인바운드 허용 |
| 안드로이드 앱에서 `http://` 차단 | `AndroidManifest.xml`의 `<application android:usesCleartextTraffic="true">` (개발 중에만) |
| 안드로이드 에뮬레이터 | PC의 localhost는 `http://10.0.2.2:5000` |
| 학교/공용 와이파이 | 기기 간 통신이 막혀 있을 수 있음 → 휴대폰 핫스팟에 PC를 연결해서 테스트 |

---

## 2. 프론트엔드 연결

### 2-1. 준비
1. `examples/frontend/api.js`를 프론트엔드 프로젝트로 복사 (예: `src/api/api.js`)
2. 서버 주소 지정
   ```js
   import { api, setBaseUrl, ApiError } from "./api/api.js";
   setBaseUrl(import.meta.env.VITE_API_URL ?? "http://localhost:5000");
   ```
3. CORS: 개발 중에는 서버 기본값(`CORS_ORIGINS=*`)으로 바로 동작합니다. 배포 시 서버 `.env`의 `CORS_ORIGINS`에 프론트 주소를 넣으세요.

### 2-2. 응답·오류 처리 규칙
- 성공: `{ "status": "success", ...데이터 }` → `api.js`는 이 객체를 그대로 반환
- 실패: HTTP 4xx/5xx + `{ "status": "error", "message": "한국어 메시지" }` → `api.js`가 `ApiError`를 던짐
- `e.message`는 사용자에게 그대로 보여줘도 되는 문장입니다.
```js
try {
  await api.joinTrip({ share_code, nickname, user_id });
} catch (e) {
  if (e.status === 409) toast("이미 참여 중이거나 닉네임이 중복됩니다");
  else toast(e.message);
}
```

### 2-3. 화면별 호출 순서

| 화면 | 호출 | 저장해둘 값 |
| :--- | :--- | :--- |
| 회원가입 | `api.register({login_id, password, name, email})` | |
| 로그인 | `api.login(login_id, password)` | `user.id` (localStorage 등) |
| 내 여행 목록 | `api.getUserTrips(user.id)` | 각 여행의 `id`, **`my_member_id`** |
| 여행 만들기 | `api.createTrip({title, created_by: user.id, creator_nickname, ...})` | `trip.id`, `trip.share_code`, `owner_member.id` |
| 초대 링크 열기 | `api.getTripByShareCode(code)` → 미리보기 → `api.joinTrip({...})` | `member.id` |
| 게스트 추가 | `api.addMember(tripId, {nickname})` | |
| 여행 홈 | `api.getTrip(tripId)` (멤버 포함), `api.getSummary(tripId)` | |
| 지출 등록 | `api.getMeta()`(드롭다운) → `api.createExpense(tripId, expense, split)` | |
| 카드 지출 확인 | 연결한 카드 앱이 푸시를 보내면 자동 등록된 지출을 여행 상세에서 조회 | |
| 지출 목록 | `api.getExpenses(tripId, {limit: 20, offset})` | |
| 지출 수정/삭제 | `api.updateExpense(...)` / `api.deleteExpense(...)` | |
| 정산 | `api.settle(tripId)` → `api.getBalances(tripId)` | |
| 송금 완료 | `api.completeSettlement(id)` (잘못 눌렀으면 `cancelSettlement`) | |
| 환전 | `api.createExchange(tripId, {...})`, `api.getExchanges(tripId)` | |

**⚠️ `user.id`와 `member_id`는 다릅니다.**
- `user.id`: 회원 계정 번호 (USERS)
- `member_id`: 특정 여행 안에서의 참가자 번호 (TRIP_MEMBERS). 지출의 `payer_member_id`, 분할의 `member_id`, 정산은 모두 **member_id** 를 씁니다.
- 내 member_id는 `getUserTrips` 응답의 `my_member_id`로 얻습니다.

### 2-4. 카드 지출 확인

연결한 휴대폰의 승인 푸시를 서버가 직접 등록합니다. 여행 화면은 지출 목록에서 금액과 분담금을 읽습니다. [카드 푸시 API](../../docs/API.md)

### 2-5. 표시 팁
- 시각은 UTC로 옵니다 (`2026-11-25T03:30:00+00:00`). `new Date(value).toLocaleString("ko-KR")`로 표시하면 한국 시간으로 바뀝니다.
- 외화 `amount`, `exchange_rate`는 숫자로 옵니다. 원화(`krw_amount`, 분할·정산 금액)는 항상 정수입니다.
- 비율 `percentage_bp`는 10000 = 100% → `(bp / 100).toFixed(2) + "%"`.

---

## 3. 카드 앱 푸시 연결

1. N빵트립 0.5 이상에서 로그인하고 **내 여행**에서 원하는 여행의 **이 여행에 카드 연결**을 누릅니다.
2. **카드 수집 설정**에서 푸시를 보낼 앱을 선택하고 알림 접근을 허용합니다.
3. 승인 푸시가 오면 휴대폰이 `POST /api/collector/events`로 전송합니다. 여행 상세에서 자동 등록된 금액과 분담금을 확인합니다.

[갤럭시·아이폰 설정과 JSON 예시](../../card-collector/README.md)

---

## 4. 문제 해결

| 증상 | 원인 / 해결 |
| :--- | :--- |
| `/api/health?db=true`가 503 | `.env`의 `SUPABASE_URL`·키 확인, 인터넷 연결 확인 |
| 모든 API가 500 + "relation ... does not exist" | Supabase에 `sql/schema.sql`을 아직 실행하지 않음, 또는 테이블 이름 대소문자 문제 (`core/db.py` 상단 주석 참고) |
| 브라우저 콘솔 CORS 오류 | 서버 `.env`의 `CORS_ORIGINS`에 프론트 주소 추가 후 서버 재시작 |
| 500인데 메시지가 "서버 내부 오류" 뿐 | 서버 `.env`에 `FLASK_DEBUG=true` → 상세 메시지 표시 (서버 콘솔에도 전체 오류 출력) |
| 지출 등록 400 "금액 불일치" | `exact` 분할의 합계가 원화 총액과 다름. 외화면 `krw_amount = round(amount × exchange_rate)` 기준 |
| 지출 등록 400 "참가자가 아닌 member_id" | `user.id`를 `member_id` 자리에 넣었는지 확인 (2-3의 ⚠️ 참고) |
| 정산 금액이 이상함 | 지출을 바꾼 뒤 `POST /settle`을 다시 호출했는지 확인 |
