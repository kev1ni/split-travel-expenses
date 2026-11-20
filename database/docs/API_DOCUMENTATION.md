# 여행 경비 정산 앱 API 명세서 (For Frontend & Parser Team)

> 버전: v3 (2026-11-20) · 🆕 = v2 이후 추가된 API/필드 · ⚠️ = 기존과 달라진 점
>
> 처음 연결한다면 [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)를 먼저 보세요. 바로 쓸 수 있는 클라이언트 코드: `examples/frontend/api.js`, `examples/parser/send_card_event.py`

- 기본 서버 주소: `http://localhost:5000` (개발 환경)
- 모든 요청 본문과 응답은 `application/json` 입니다. (요청 시 `Content-Type: application/json` 헤더 필수)
- CORS가 활성화되어 있습니다. (허용 출처는 서버 `.env`의 `CORS_ORIGINS`)

---

## 0. 공통 규칙

### 0-1. 응답 형식
```json
// 성공
{ "status": "success", "<데이터 키>": { ... } }

// 실패
{ "status": "error", "message": "사람이 읽을 수 있는 오류 메시지" }
```

### 0-2. HTTP 상태 코드
| 코드 | 의미 | 예시 |
| :-: | :--- | :--- |
| 200 | 성공 (조회/수정) | |
| 201 | 생성됨 | 회원가입, 여행 생성, 지출 등록 |
| 400 | 요청 값 오류 | 필수값 누락, 형식 오류, 분할 합계 불일치, JSON이 아닌 본문 |
| 401 | 인증 실패 | 로그인 실패, 파싱 앱 API 키 불일치 |
| 404 | 대상 없음 | 없는 여행/지출/정산, 잘못된 초대 코드, 없는 API 경로 (⚠️ v3부터 없는 여행의 `summary`·`balances`도 404) |
| 409 | 중복/상태 충돌 ⚠️ | 이미 있는 아이디·이메일, 이미 참여한 회원, 이미 완료된 송금 |
| 500 | 서버/DB 오류 | |

⚠️ 기존에는 중복 아이디가 400, 이미 참여한 회원은 500이었으나 v2부터 **409**로 통일했습니다.

### 0-3. 값 형식
| 종류 | 형식 | 예시 |
| :--- | :--- | :--- |
| 날짜 | `YYYY-MM-DD` | `"2026-11-25"` |
| 시각 | ISO 8601, **오프셋 포함 권장** | `"2026-11-25T12:30:00+09:00"` |
| 통화 | ISO 4217 3자리 (소문자로 보내도 대문자로 저장) | `"KRW"`, `"JPY"`, `"USD"` |
| 원화 금액 | 정수 | `36036` |
| 외화 금액 | 숫자 또는 문자열, 소수 2자리까지 | `3960`, `"12.50"` |
| 비율 | basis point 정수 (10000 = 100%) | `3333` |

- 시각에 오프셋이 없으면(`"2026-11-25 12:30:00"`) 서버가 **`+09:00`(한국 시간)** 으로 간주합니다.
- DB는 시각을 UTC로 돌려줍니다. (예: `"2026-11-25T03:30:00+00:00"` = 한국 시간 12:30)
- 코드 값(`entry_type`, `split_type`, `status`, `payment_method`)은 **소문자**로 저장·응답됩니다. 허용 값 목록은 `GET /api/meta`로 받을 수 있습니다.

### 0-4. 인증 헤더
| API | 헤더 | 설명 |
| :--- | :--- | :--- |
| `POST /api/card-events` | `X-API-Key: <PARSER_API_KEY>` | 🆕 서버 `.env`에 `PARSER_API_KEY`가 설정된 경우에만 필수. 틀리면 401 |
| 그 외 | 없음 | 로그인 토큰 인증은 아직 없음 (로그인 응답의 `user.id`를 프론트에서 보관) |

---

## 1. 인증 및 회원 관리 (USERS)

### 1-1. 회원가입
- **URL**: `POST /api/register`
- **Request Body**:

| 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :-: | :--- |
| `login_id` | string | ✅ | 최대 50자, 중복 불가 |
| `password` | string | ✅ | **8자 이상** ⚠️. (기존 키 `password_hash`도 허용) |
| `name` | string | ✅ | 최대 50자 |
| `email` | string | ✅ | 이메일 형식, 중복 불가 (소문자로 저장) |

```json
{
  "login_id": "hong123",
  "password": "mypassword123!",
  "name": "홍길동",
  "email": "hong@gmail.com"
}
```
- **Response (201 Created)**: (비밀번호 해시는 응답에 포함되지 않음)
```json
{
  "status": "success",
  "user": { "id": 1, "login_id": "hong123", "name": "홍길동", "email": "hong@gmail.com" }
}
```
- **오류**: 400 (필수값/형식/비밀번호 길이), 409 (`이미 존재하는 아이디(login_id)입니다: hong123`)

### 1-2. 로그인
- **URL**: `POST /api/login`
- **Request Body**: `{ "login_id": "hong123", "password": "mypassword123!" }`
- **Response (200 OK)**:
```json
{
  "status": "success",
  "message": "로그인에 성공했습니다.",
  "user": { "id": 1, "login_id": "hong123", "name": "홍길동", "email": "hong@gmail.com" }
}
```
- **실패 시 (401 Unauthorized)**: 아이디/비밀번호 중 무엇이 틀렸는지 구분하지 않습니다.
```json
{ "status": "error", "message": "아이디 또는 비밀번호를 틀렸습니다." }
```

> ℹ️ 현재는 토큰 기반 인증이 없습니다. 프론트엔드는 응답의 `user.id`를 저장해 이후 요청에 사용합니다.

### 1-3. 내가 참여 중인 여행 목록
- **URL**: `GET /api/users/<user_id>/trips`
- 최근 시작일 순으로 정렬됩니다.
- **Response (200 OK)**:
```json
{
  "status": "success",
  "trips": [
    {
      "id": 1,
      "title": "3박 4일 도쿄 여행",
      "description": "식도락 위주 여행",
      "destination_country": "일본",
      "destination_currency": "JPY",
      "start_date": "2026-11-25",
      "end_date": "2026-11-29",
      "share_code": "9AK2F7",
      "created_by": 1,
      "created_at": "2026-11-20T07:00:00+00:00",
      "my_nickname": "길동(방장)",
      "my_member_id": 1
    }
  ]
}
```
- 🆕 `my_member_id`: 이 여행에서 나의 `TRIP_MEMBERS.id`. 지출 등록 시 `payer_member_id`로 사용합니다.

---

## 2. 여행 그룹 관리 (TRIPS & TRIP_MEMBERS)

### 2-1. 여행 생성 (방장 멤버 자동 등록)
- **URL**: `POST /api/trips`

| 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :-: | :--- |
| `title` | string | ✅ | 최대 100자 |
| `created_by` | int \| string | ✅ | 생성자 `user_id` 또는 `login_id` |
| `creator_nickname` | string | | 방장 닉네임 (기본 `"방장"`) |
| `description` | string | | |
| `destination_country` | string | | |
| `destination_currency` | string | | 3자리 통화 코드 (기본 `KRW`) |
| `start_date` / `end_date` | date | | `end_date >= start_date` |

```json
{
  "title": "3박 4일 도쿄 여행",
  "description": "식도락 위주 여행",
  "destination_country": "일본",
  "destination_currency": "JPY",
  "start_date": "2026-11-25",
  "end_date": "2026-11-29",
  "created_by": "hong123",
  "creator_nickname": "길동(방장)"
}
```
- **Response (201 Created)**:
```json
{
  "status": "success",
  "trip": {
    "id": 1, "title": "3박 4일 도쿄 여행", "destination_currency": "JPY",
    "start_date": "2026-11-25", "end_date": "2026-11-29",
    "share_code": "9AK2F7", "created_by": 1, "created_at": "2026-11-20T07:00:00+00:00"
  },
  "owner_member": { "id": 1, "trip_id": 1, "user_id": 1, "nickname": "길동(방장)" }
}
```
- 🆕 `owner_member`: 자동 등록된 방장 멤버 정보
- **오류**: 400 (필수값/날짜), 404 (없는 회원)

### 2-2. 🆕 여행 상세 조회
- **URL**: `GET /api/trips/<trip_id>`
- **Response (200 OK)**: `trip` 객체에 `members` 배열과 `member_count`가 포함됩니다.
```json
{
  "status": "success",
  "trip": {
    "id": 1, "title": "3박 4일 도쿄 여행", "share_code": "9AK2F7", "...": "...",
    "members": [
      { "id": 1, "trip_id": 1, "user_id": 1, "nickname": "길동(방장)", "is_guest": false },
      { "id": 3, "trip_id": 1, "user_id": null, "nickname": "영희", "is_guest": true }
    ],
    "member_count": 2
  }
}
```
- **오류**: 404

### 2-3. 초대 코드로 여행 정보 조회 (입장 전 미리보기)
- **URL**: `GET /api/trips/share/<share_code>` (대소문자 무관)
- **Response (200 OK)**:
```json
{
  "status": "success",
  "trip": { "id": 1, "title": "3박 4일 도쿄 여행", "start_date": "2026-11-25", "end_date": "2026-11-29", "share_code": "9AK2F7", "member_count": 3, "...": "..." }
}
```
- **오류**: 404 (`유효하지 않은 초대 코드입니다.`)

### 2-4. 초대 코드로 여행 참가하기
- **URL**: `POST /api/trips/join`

| 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :-: | :--- |
| `share_code` | string | ✅ | |
| `nickname` | string | ✅ | 여행 내 중복 불가 |
| `user_id` | int | | 회원이면 입력. `user_id`·`login_id` 둘 다 없으면 게스트 |
| `login_id` | string | | `user_id` 대신 사용 가능 |

```json
{ "share_code": "9AK2F7", "user_id": 2, "nickname": "철수" }
```
- **Response (201 Created)**:
```json
{
  "status": "success",
  "trip": { "id": 1, "title": "3박 4일 도쿄 여행", "...": "..." },
  "member": { "id": 2, "trip_id": 1, "user_id": 2, "nickname": "철수" }
}
```
- **오류**: 400 (`share_code`/`nickname` 누락), 404 (잘못된 코드, 없는 회원), 409 (이미 참여 중, 닉네임 중복)

### 2-5. 참가자 추가 (회원 또는 게스트)
- **URL**: `POST /api/trips/<trip_id>/members`
- **Request Body**: `{ "nickname": "영희" }` (게스트) 또는 `{ "nickname": "철수", "user_id": 2 }`
- **Response (201 Created)**: `{ "status": "success", "member": { "id": 3, "trip_id": 1, "user_id": null, "nickname": "영희" } }`
- **오류**: 400, 404 (없는 여행/회원), 409 (중복)

### 2-6. 여행 참가자 목록 조회
- **URL**: `GET /api/trips/<trip_id>/members`
- **Response (200 OK)**:
```json
{
  "status": "success",
  "members": [
    { "id": 1, "trip_id": 1, "user_id": 1, "nickname": "길동(방장)", "is_guest": false },
    { "id": 2, "trip_id": 1, "user_id": 2, "nickname": "철수", "is_guest": false },
    { "id": 3, "trip_id": 1, "user_id": null, "nickname": "영희", "is_guest": true }
  ]
}
```
- 🆕 `is_guest`: 게스트(비회원) 여부

### 2-7. 여행 대시보드 요약 통계
- **URL**: `GET /api/trips/<trip_id>/summary`
- **Response (200 OK)**:
```json
{
  "status": "success",
  "summary": {
    "trip_id": 1,
    "total_krw_spent": 150000,
    "expense_count": 5,
    "by_category": { "식비": 80000, "교통": 20000, "숙박": 50000 },
    "by_payment_method": { "card": 120000, "cash": 30000 },
    "by_date": { "2026-11-25": 70000, "2026-11-26": 80000 },
    "by_payer": { "길동(방장)": 100000, "철수": 50000 },
    "exchange_summary": {
      "total_krw_used": 200000,
      "total_foreign_obtained": 22000,
      "currency": "JPY",
      "by_currency": {
        "JPY": {
          "krw_used": 200000,
          "foreign_obtained": 22000,
          "average_rate": 9.0909,
          "cash_spent": 3300,
          "remaining_estimate": 18700
        }
      }
    }
  }
}
```
- 🆕 `by_date`: 한국 시간(+09:00) 기준 날짜별 합계 (날짜 오름차순)
- 🆕 `by_payer`: 결제자 닉네임별 합계
- 🆕 `exchange_summary.by_currency`: 통화별 환전 원화·외화 합계, 평균 환율(원/외화), 현금 지출 외화 합계, 남은 외화 추정치
- ⚠️ 환전 통화가 2개 이상이면 `currency`는 `"MIXED"`, `total_foreign_obtained`는 `null` 입니다. (`by_currency`를 사용하세요)

---

## 3. 지출 및 분할 관리 (EXPENSES & EXPENSE_SPLITS)

### 3-1. 지출 등록 및 분할 동시 등록
- **URL**: `POST /api/trips/<trip_id>/expenses`
- **Request Body** 구조: `{ "expense": {...}, "split": {...}, "card_event_id": "..." }`

**`expense` 필드**

| 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :-: | :--- |
| `payer_member_id` | int | ✅ | 결제한 멤버의 `TRIP_MEMBERS.id` (이 여행 참가자여야 함) |
| `title` | string | ✅ | 최대 100자 |
| `amount` | number | ✅ | 현지 통화 결제 금액 (소수 2자리까지) |
| `currency` | string | | 기본 `KRW` |
| `exchange_rate` | number | | 1 외화당 원화 (예: JPY → `9.1`) |
| `krw_amount` | int | 조건부 | 🆕 생략 가능: KRW면 `amount`, 외화면 `round(amount × exchange_rate)`로 자동 계산. 외화인데 둘 다 없으면 400 |
| `category` | string | | 기본 `"기타"` |
| `payment_method` | string | | 기본 `"card"` (예: `card`, `cash`) |
| `spent_at` | datetime | | 🆕 생략 시 현재 시각 |
| `entry_type` | string | | `manual`(기본) · `auto_card` · `correction` · `cancellation`. `card_event_id`가 있으면 자동 `auto_card` |
| `original_expense_id` | int | | 수정/취소 지출이 참조하는 원본 지출 |
| `rate_date` | date | | 환율 기준일 |
| `receipt_image_path` | string | | 영수증 이미지 경로 |

**`split` 필드** (🆕 생략하면 여행 전체 멤버 균등 분할)

| `split_type` | 필요한 필드 | 설명 |
| :--- | :--- | :--- |
| `equal` (기본) | `member_ids: [int]` | 균등 분할. 1원 단위 나머지는 배열 앞쪽 멤버부터 +1원. `member_ids` 생략 시 전체 멤버 |
| `exact` | `splits: [{member_id, split_krw_amount}]` | 금액 직접 지정. 합계 = `krw_amount` 이어야 함. (`custom`도 허용) |
| 🆕 `percentage` | `splits: [{member_id, percentage_bp}]` | 비율 지정. 합계 = 10000 이어야 함. 금액은 서버가 계산 |

- `split.split_type`이 없으면 `expense.split_type`을 사용합니다.
- 같은 멤버를 두 번 넣거나, 이 여행 참가자가 아닌 멤버를 넣으면 400입니다.

**`card_event_id`** (선택): 카드 이벤트(`CARD_EVENTS.event_id`)를 이 지출에 연결합니다. 같은 결제의 다른 채널 이벤트도 함께 연결됩니다.

**균등 분할 예시**
```json
{
  "expense": {
    "payer_member_id": 1,
    "title": "이치란 라멘 점심",
    "category": "식비",
    "amount": 3960,
    "currency": "JPY",
    "exchange_rate": 9.1,
    "payment_method": "card",
    "spent_at": "2026-11-25T12:30:00+09:00"
  },
  "split": { "split_type": "equal", "member_ids": [1, 2, 3] },
  "card_event_id": null
}
```

**금액 직접 분할 예시**
```json
{
  "expense": { "payer_member_id": 2, "title": "편의점", "amount": 10000 },
  "split": {
    "split_type": "exact",
    "splits": [
      { "member_id": 1, "split_krw_amount": 7000 },
      { "member_id": 2, "split_krw_amount": 3000 }
    ]
  }
}
```

**비율 분할 예시**
```json
{
  "expense": { "payer_member_id": 3, "title": "숙소", "amount": 300, "currency": "USD", "exchange_rate": 1400 },
  "split": {
    "split_type": "percentage",
    "splits": [
      { "member_id": 1, "percentage_bp": 5000 },
      { "member_id": 2, "percentage_bp": 2500 },
      { "member_id": 3, "percentage_bp": 2500 }
    ]
  }
}
```

- **Response (201 Created)**:
```json
{
  "status": "success",
  "expense": {
    "id": 10, "trip_id": 1, "payer_member_id": 1, "entry_type": "manual",
    "title": "이치란 라멘 점심", "category": "식비",
    "amount": 3960, "currency": "JPY", "exchange_rate": 9.1, "krw_amount": 36036,
    "payment_method": "card", "split_type": "equal",
    "spent_at": "2026-11-25T03:30:00+00:00", "...": "..."
  },
  "splits": [
    { "id": 1, "trip_id": 1, "expense_id": 10, "member_id": 1, "split_krw_amount": 12012, "percentage_bp": 3334 },
    { "id": 2, "trip_id": 1, "expense_id": 10, "member_id": 2, "split_krw_amount": 12012, "percentage_bp": 3333 },
    { "id": 3, "trip_id": 1, "expense_id": 10, "member_id": 3, "split_krw_amount": 12012, "percentage_bp": 3333 }
  ],
  "linked_card_event_ids": []
}
```
- 🆕 `linked_card_event_ids`: 이 지출에 연결된 카드 이벤트 ID 목록
- **오류**: 400 (검증 실패, `[금액 불일치] 분할 금액 합계(5000원) != 지출 총액(10000원)`), 404 (없는 여행/카드 이벤트), 409 (이미 지출로 등록된 카드 이벤트)
- 분할 저장이 실패하면 지출도 함께 취소되므로 "분할 없는 지출"은 남지 않습니다.

### 3-2. 지출 내역 및 분할 상세 조회
- **URL**: `GET /api/trips/<trip_id>/expenses`
- 🆕 **Query (모두 선택)**:

| 파라미터 | 설명 |
| :--- | :--- |
| `category` | 카테고리 일치 |
| `payer_member_id` | 결제자 |
| `from` / `to` | `YYYY-MM-DD` (한국 시간 기준, 양 끝 포함) 또는 ISO 시각 |
| `limit` | 1~500 |
| `offset` | 기본 0 (`limit`과 함께 페이지네이션) |

예: `GET /api/trips/1/expenses?category=식비&from=2026-11-25&to=2026-11-26&limit=20&offset=0`

- **Response (200 OK)**: 최근 결제 순
```json
{
  "status": "success",
  "expenses": [
    {
      "id": 10,
      "title": "이치란 라멘 점심",
      "category": "식비",
      "amount": 3960,
      "currency": "JPY",
      "krw_amount": 36036,
      "payer_member_id": 1,
      "payer_nickname": "길동(방장)",
      "spent_at": "2026-11-25T03:30:00+00:00",
      "splits": [
        { "member_id": 1, "member_nickname": "길동(방장)", "split_krw_amount": 12012, "percentage_bp": 3334 },
        { "member_id": 2, "member_nickname": "철수", "split_krw_amount": 12012, "percentage_bp": 3333 },
        { "member_id": 3, "member_nickname": "영희", "split_krw_amount": 12012, "percentage_bp": 3333 }
      ]
    }
  ]
}
```

### 3-3. 🆕 지출 1건 조회
- **URL**: `GET /api/trips/<trip_id>/expenses/<expense_id>`
- **Response (200 OK)**: `{ "status": "success", "expense": { ...3-2의 항목 1개와 동일... } }`
- **오류**: 404

### 3-4. 🆕 지출 수정
- **URL**: `PATCH /api/trips/<trip_id>/expenses/<expense_id>`
- **Request Body**: `expense`에는 **바꿀 필드만** 넣습니다. `split`은 선택.
```json
{
  "expense": { "amount": 4500, "title": "이치란 라멘 + 교자" },
  "split": { "split_type": "equal", "member_ids": [1, 2] }
}
```
- 동작 규칙
  - `amount` / `currency` / `exchange_rate`가 바뀌고 `krw_amount`를 안 보내면 `krw_amount`를 다시 계산합니다.
  - `split`을 보내면 분할을 새로 계산해 **교체**합니다.
  - `split` 없이 원화 금액이 바뀌면: 기존이 `equal`이면 같은 멤버로 자동 재분할, `exact`/`percentage`면 400 (`split`을 함께 보내야 함).
- **Response (200 OK)**: `{ "status": "success", "expense": {...}, "splits": [...] }`
- **오류**: 400, 404

### 3-5. 🆕 지출 삭제
- **URL**: `DELETE /api/trips/<trip_id>/expenses/<expense_id>`
- 분할 내역은 함께 삭제되고, 연결돼 있던 카드 이벤트는 다시 "미등록" 상태가 됩니다.
- **Response (200 OK)**: `{ "status": "success", "deleted_expense_id": 10 }`
- **오류**: 404

> 💡 지출을 등록·수정·삭제한 뒤에는 `POST /api/trips/<trip_id>/settle`을 다시 호출해 정산을 갱신하세요.

---

## 4. 잔액 및 최종 정산 (BALANCES & SETTLEMENTS)

### 4-1. 개인 잔액 요약
- **URL**: `GET /api/trips/<trip_id>/members/<member_id>/summary`
- **Response (200 OK)**:
```json
{
  "status": "success",
  "summary": {
    "trip_id": 1,
    "member_id": 2,
    "total_paid": 21000,
    "total_owed": 19012,
    "net_balance": 1988,
    "settled_sent": 0,
    "settled_received": 0,
    "outstanding_balance": 1988
  }
}
```

| 필드 | 설명 |
| :--- | :--- |
| `total_paid` | 내가 결제한 지출의 원화 합계 |
| `total_owed` | 내가 분담해야 할 원화 합계 |
| `net_balance` | `total_paid - total_owed` (양수: 받을 돈, 음수: 보낼 돈) |
| 🆕 `settled_sent` | 송금 완료 처리된, 내가 보낸 금액 |
| 🆕 `settled_received` | 송금 완료 처리된, 내가 받은 금액 |
| 🆕 `outstanding_balance` | 완료된 송금까지 반영한 **남은** 잔액 = `net_balance + settled_sent - settled_received` |

### 4-2. 🆕 전체 멤버 잔액
- **URL**: `GET /api/trips/<trip_id>/balances`
- **Response (200 OK)**: 4-1과 같은 필드를 멤버별로 반환 (+ `nickname`). 모든 멤버의 `net_balance` 합은 항상 0입니다.
```json
{
  "status": "success",
  "balances": [
    { "member_id": 1, "nickname": "길동(방장)", "total_paid": 36036, "total_owed": 29012, "net_balance": 7024, "settled_sent": 0, "settled_received": 0, "outstanding_balance": 7024 },
    { "member_id": 2, "nickname": "철수", "total_paid": 21000, "total_owed": 19012, "net_balance": 1988, "settled_sent": 0, "settled_received": 0, "outstanding_balance": 1988 },
    { "member_id": 3, "nickname": "영희", "total_paid": 20000, "total_owed": 29012, "net_balance": -9012, "settled_sent": 0, "settled_received": 0, "outstanding_balance": -9012 }
  ]
}
```

### 4-3. 정산 계산 실행 및 저장
- **URL**: `POST /api/trips/<trip_id>/settle` (Body 없음)
- ⚠️ 동작 변경
  - 기존 **대기(pending) 정산은 삭제 후 새로 계산**합니다. 여러 번 호출해도 중복되지 않습니다.
  - **완료(completed)된 송금은 유지**되고 잔액 계산에 반영됩니다.
  - 모두 정산이 끝났으면 빈 배열을 반환합니다.
- **Response (200 OK)**: 새로 만들어진 대기 정산 목록 (🆕 `sender_nickname`, `receiver_nickname` 포함)
```json
{
  "status": "success",
  "settlements": [
    { "id": 5, "trip_id": 1, "sender_member_id": 3, "receiver_member_id": 1, "amount": 7024, "status": "pending", "completed_at": null, "sender_nickname": "영희", "receiver_nickname": "길동(방장)" },
    { "id": 6, "trip_id": 1, "sender_member_id": 3, "receiver_member_id": 2, "amount": 1988, "status": "pending", "completed_at": null, "sender_nickname": "영희", "receiver_nickname": "철수" }
  ]
}
```
- **오류**: 400 (지출 내역 없음), 404 (없는 여행)

### 4-4. 정산 결과 목록 조회
- **URL**: `GET /api/trips/<trip_id>/settlements`
- 🆕 **Query**: `status=pending` 또는 `status=completed` (선택)
- **Response (200 OK)**:
```json
{
  "status": "success",
  "settlements": [
    {
      "id": 5,
      "trip_id": 1,
      "sender_member_id": 3,
      "sender_nickname": "영희",
      "receiver_member_id": 1,
      "receiver_nickname": "길동(방장)",
      "amount": 7024,
      "status": "pending",
      "completed_at": null,
      "created_at": "2026-11-29T10:00:00+00:00"
    }
  ]
}
```

### 4-5. 송금 완료 처리
- **URL**: `PATCH /api/settlements/<settlement_id>/complete` (Body 없음)
- **Response (200 OK)**: ⚠️ 응답 키가 `data`(배열) → **`settlement`(객체)** 로 바뀌었습니다.
```json
{
  "status": "success",
  "settlement": { "id": 5, "status": "completed", "completed_at": "2026-11-29T19:10:00.123456+09:00", "...": "..." }
}
```
- **오류**: 404 (없는 정산), 409 (이미 완료됨)

### 4-6. 🆕 송금 완료 취소
- **URL**: `PATCH /api/settlements/<settlement_id>/cancel` (Body 없음)
- 잘못 완료 처리한 송금을 다시 `pending`으로 되돌립니다.
- **Response (200 OK)**: `{ "status": "success", "settlement": { "id": 5, "status": "pending", "completed_at": null, "...": "..." } }`
- **오류**: 404, 409 (완료 상태가 아님)

---

## 5. 환전 관리 (CURRENCY_EXCHANGES)

### 5-1. 환전 내역 등록
- **URL**: `POST /api/trips/<trip_id>/exchanges`

| 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :-: | :--- |
| `member_id` | int | ✅ | 환전한 멤버 (이 여행 참가자) |
| `currency` | string | ✅ | 받은 외화 통화 코드 |
| `original_krw_amount` | int | ✅ | 사용한 원화 (1 이상) |
| `exchanged_amount` | number | ✅ | 받은 외화 (소수 가능, 0 초과) |
| `exchange_rate` | number | | 🆕 생략 시 `original_krw_amount ÷ exchanged_amount`로 자동 계산 |
| `exchange_date` | date | | 🆕 생략 시 오늘 |
| `rate_type` | string | | 예: `"우대 90%"` |
| `memo` | string | | |

```json
{
  "member_id": 1,
  "currency": "JPY",
  "original_krw_amount": 91000,
  "exchanged_amount": 10000,
  "exchange_date": "2026-11-20",
  "rate_type": "우대 90%",
  "memo": "공항 환전소"
}
```
- **Response (201 Created)**:
```json
{
  "status": "success",
  "exchange": {
    "id": 1, "trip_id": 1, "member_id": 1, "exchange_date": "2026-11-20", "currency": "JPY",
    "original_krw_amount": 91000, "exchanged_amount": 10000, "exchange_rate": 9.1,
    "rate_type": "우대 90%", "memo": "공항 환전소", "created_at": "..."
  }
}
```
- **오류**: 400, 404 (없는 여행)

### 5-2. 환전 내역 조회
- **URL**: `GET /api/trips/<trip_id>/exchanges`
- **Response (200 OK)**: 최근 환전일 순, 각 항목에 `member_nickname` 포함
```json
{
  "status": "success",
  "exchanges": [
    { "id": 1, "member_id": 1, "member_nickname": "길동(방장)", "currency": "JPY", "original_krw_amount": 91000, "exchanged_amount": 10000, "exchange_rate": 9.1, "exchange_date": "2026-11-20", "...": "..." }
  ]
}
```

---

## 6. 카드 파싱 앱 연동 (CARD_EVENTS)

### 6-1. 파싱 데이터 수신
- **URL**: `POST /api/card-events`
- **Header**: `Content-Type: application/json`, 🆕 `X-API-Key: <키>` (서버에 `PARSER_API_KEY`가 설정된 경우)
- 표에 없는 필드는 무시됩니다. (파싱 앱이 추가 정보를 보내도 오류가 나지 않음)

| 필드 | 타입 | 필수 | 설명 |
| :--- | :--- | :-: | :--- |
| `event_id` | string | ✅ | 이벤트 고유 ID (UUID, 최대 36자). **재전송 시 같은 값 사용** |
| `source` | string | | 수신 채널 (예: `message`, `rcs`, `push`) |
| `message_format` | string | | 메시지 형식 |
| `issuer` | string | | 카드사 (예: `현대카드`) |
| `event_type` | string | | 예: `approval`(승인), `cancel`(취소) |
| `amount` | string | | 원문 그대로 저장 (예: `"1,400"`) |
| `currency` | string | | 기본 `KRW` |
| `merchant` | string | | 가맹점 |
| `approval_ref` | string | | **승인번호** — 다채널 중복 판별에 사용 |
| `occurred_at` | datetime | | 결제 시각 |
| `received_at` | datetime | | 수신 시각 (🆕 생략 시 현재 시각) |
| `trip_id` | int | | 알고 있으면 지정 |
| `payer_member_id` | int | | 알고 있으면 지정 (`trip_id`의 참가자여야 함) |

```json
{
  "event_id": "b46e3781-e03f-4714-9061-1ab0afae51ae",
  "source": "rcs",
  "issuer": "현대카드",
  "event_type": "approval",
  "amount": "1400",
  "currency": "KRW",
  "merchant": "예시마트샘플점",
  "approval_ref": "30012345",
  "occurred_at": "2026-11-17T09:59:30+09:00",
  "received_at": "2026-11-17T10:00:00+09:00"
}
```
- **Response**
  - **201 Created**: 새로 저장됨 → `{ "status": "success", "card_event": {...}, "duplicate": false }`
  - 🆕 **200 OK**: 같은 `event_id`가 이미 있음 (저장 안 함, 기존 데이터 반환) → `{ "status": "success", "card_event": {...}, "duplicate": true }`
- 🆕 **다채널 자동 연결**: 같은 `approval_ref` + `issuer` + `event_type`의 이벤트가 이미 지출로 등록돼 있으면, 새 이벤트도 자동으로 같은 지출(`expense_id`)에 연결되어 저장됩니다.
- **오류**: 400 (`event_id` 누락, 통화/시각 형식), 401 (API 키 불일치), 404 (없는 `trip_id`)
- **재시도 규칙**: 네트워크 오류·5xx는 같은 `event_id`로 재시도하면 안전합니다. 4xx는 데이터 문제이므로 재시도하지 마세요.

### 6-2. 미등록 카드 내역 조회 (프론트 원클릭 불러오기용)
- **URL**: `GET /api/card-events/unassigned`
- 🆕 **Query (모두 선택)**:

| 파라미터 | 설명 |
| :--- | :--- |
| `trip_id` | 해당 여행 이벤트 + 여행이 지정되지 않은 이벤트만 |
| `payer_member_id` | 해당 결제자 이벤트만 |
| `limit` | 1~100 (기본 20) |

- **Response (200 OK)**: 최근 수신 순. 🆕 같은 결제가 여러 채널로 들어오면 **한 건만** 보여주고 나머지 ID는 `duplicate_event_ids`에 담습니다.
```json
{
  "status": "success",
  "unassigned_cards": [
    {
      "event_id": "b46e3781-e03f-4714-9061-1ab0afae51ae",
      "source": "rcs",
      "issuer": "현대카드",
      "event_type": "approval",
      "amount": "1400",
      "currency": "KRW",
      "merchant": "예시마트샘플점",
      "approval_ref": "30012345",
      "received_at": "2026-11-17T01:00:00+00:00",
      "trip_id": null,
      "expense_id": null,
      "duplicate_event_ids": ["c1d2e3f4-0000-4000-8000-000000000002"]
    }
  ]
}
```
- 프론트에서 항목을 선택하면 3-1 지출 등록에 `card_event_id`로 넘겨주세요. `duplicate_event_ids`의 이벤트도 함께 연결됩니다.

---

## 7. 서버 상태 확인 & 코드 값

### 7-1. 헬스체크
- **URL**: `GET /api/health`
- 🆕 `?db=true`를 붙이면 Supabase 연결까지 확인합니다.
- **Response (200 OK)**:
```json
{ "status": "healthy", "service": "split_travel_backend", "supabase_key": "SUPABASE_PUBLISHABLE_KEY", "database": "connected" }
```
- DB 연결 실패 시 **503**: `{ "status": "degraded", "database": "unreachable", ... }`
- `supabase_key`는 사용 중인 키의 **환경변수 이름**만 표시합니다. (키 값은 노출하지 않음)
- 이 API만 `status`가 `"healthy"`/`"degraded"`입니다. (나머지는 `"success"`/`"error"`)

### 7-2. 🆕 코드 값 목록 (드롭다운용)
- **URL**: `GET /api/meta`
- **Response (200 OK)**:
```json
{
  "status": "success",
  "meta": {
    "entry_types": ["manual", "auto_card", "correction", "cancellation"],
    "split_types": ["equal", "exact", "percentage"],
    "settlement_statuses": ["pending", "completed"],
    "categories": ["식비", "교통", "숙박", "관광", "쇼핑", "기타"],
    "payment_methods": ["card", "cash"],
    "password_min_length": 8,
    "basis_point_total": 10000
  }
}
```
- `categories`, `payment_methods`는 기본 추천값이며 다른 값도 저장할 수 있습니다.

---

## 부록. 프론트엔드 변경 체크리스트 (v1 → v3)

| 항목 | v1 | v2 |
| :--- | :--- | :--- |
| 회원가입/로그인 비밀번호 키 | `password_hash` | `password` 권장 (`password_hash`도 계속 동작) |
| 비밀번호 최소 길이 | 없음 | 8자 |
| 중복 아이디/이메일 | 400 | 409 |
| 이미 참여한 회원 재참가 | 500 | 409 |
| 여행 생성 응답 | `trip` | `trip` + `owner_member` |
| 송금 완료 응답 | `data: [ ... ]` | `settlement: { ... }` |
| `/settle` 재호출 | 정산 중복 생성 | 대기 정산 교체 |
| 코드 값 대소문자 | 혼재 | 모두 소문자 |
| 외화 `amount` | 정수만 | 소수 2자리 가능 |
| 시각 오프셋 없음 | UTC로 저장(9시간 오차) | +09:00으로 저장 |
| 환전 요약 다중 통화 | 단순 합산 | `by_currency` 사용, `currency: "MIXED"` |
| 없는 여행의 summary/balances | 0으로 채운 응답 | 404 (v3) |
| 정산 계산 응답 | id만 | 닉네임 포함 (v3) |
| 파싱 앱 인증 | 없음 | `X-API-Key` (서버 설정 시, v3) |
