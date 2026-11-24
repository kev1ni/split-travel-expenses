# N빵트립 (NTrip) 백엔드 API 명세서

> **상태:** 협의용 초안 (Draft v0.1)  
> **작성 목적:** React 프론트엔드와 Python 백엔드 간 API 계약 정의  
> **주의:** 아래 경로, 필드명, 응답 및 오류 코드는 제안 사항이며 실제 구현 여부를 확인한 내용이 아닙니다. 백엔드/DB 담당자와 확정 후 갱신하세요.

## 1. 공통 규칙

- **Base URL (예시):** `http://localhost:5000/api/v1`
- **Content-Type:** `application/json` (이미지 업로드 제외)
- **인증:** `Authorization: Bearer <access_token>` (JWT 방식 제안, 최종 협의 필요)
- **ID:** 예시에서는 정수 사용. 실제 DB 타입과 일치시킬 것.
- **날짜/시간:** ISO 8601 (`2026-11-21T09:00:00+09:00`), 날짜만 필요한 경우 `YYYY-MM-DD`.
- **금액:** JSON 숫자. 금융 계산은 서버에서 `Decimal` 등 정확한 십진수 타입 사용 권장.
- **통화:** ISO 4217 코드 (`KRW`, `JPY`, `USD` 등).
- **환율 기준:** `exchange_rate`는 **외화 1단위당 KRW**. `krw_amount = amount × exchange_rate`. 예: 1 JPY = 9.2 KRW.
- **권한:** 여행 관련 데이터는 해당 여행 멤버만 조회/수정 가능. 생성·초대·삭제 권한은 정책 협의.
- **민감 정보:** 비밀번호는 해시 저장. 토큰/실제 비밀번호를 로그에 남기지 않음.

### 공통 성공 응답 (제안)

```json
{
  "data": { "id": 12 },
  "message": "성공"
}
```

목록은 `data`를 배열로 반환하고, 필요하면 `pagination`을 추가합니다.

### 공통 오류 응답 (제안)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": { "amount": "0보다 커야 합니다." }
  }
}
```

| HTTP | 의미 |
|---|---|
| 400 | 잘못된 요청 |
| 401 | 로그인/토큰 필요 |
| 403 | 여행 접근 권한 없음 |
| 404 | 대상 없음 |
| 409 | 중복 가입·초대·카드 이벤트 등 충돌 |
| 422 | 필드 유효성 오류 |
| 500 | 서버 오류 |

---

## 2. 인증 및 사용자 (USERS)

| Method | Endpoint | 기능 | 인증 |
|---|---|---|---|
| POST | `/auth/signup` | 회원가입 | X |
| POST | `/auth/login` | 로그인 | X |
| GET | `/auth/me` | 현재 사용자 조회 | O |
| POST | `/auth/logout` | 로그아웃 (토큰 방식에 따라 선택) | O |

### `POST /auth/signup`

요청:
```json
{
  "login_id": "traveler01",
  "password": "example-password",
  "nickname": "여행자"
}
```
응답 `201 Created`:
```json
{
  "data": {
    "id": 1,
    "login_id": "traveler01",
    "nickname": "여행자"
  }
}
```

### `POST /auth/login`

요청:
```json
{
  "login_id": "traveler01",
  "password": "example-password"
}
```
응답 `200 OK`:
```json
{
  "data": {
    "access_token": "example.jwt.token",
    "token_type": "Bearer",
    "user": { "id": 1, "login_id": "traveler01", "nickname": "여행자" }
  }
}
```

> 토큰 저장 방식, 만료 및 갱신 정책은 백엔드와 별도 협의. 프론트엔드에서 평문 비밀번호를 저장하지 않습니다.

---

## 3. 여행 및 멤버 (TRIPS, TRIP_MEMBERS)

| Method | Endpoint | 기능 |
|---|---|---|
| GET | `/trips` | 내 여행 목록 |
| POST | `/trips` | 여행 생성 |
| GET | `/trips/{trip_id}` | 여행 상세 |
| PATCH | `/trips/{trip_id}` | 여행 정보 수정 |
| DELETE | `/trips/{trip_id}` | 여행 삭제 (정책 협의) |
| GET | `/trips/{trip_id}/members` | 멤버 목록 |
| POST | `/trips/{trip_id}/invitations` | 초대 코드/링크 생성·조회 |
| POST | `/invitations/accept` | 코드로 여행 참여 |
| POST | `/trips/{trip_id}/members/guests` | 비회원 참여자 등록 |
| DELETE | `/trips/{trip_id}/members/{member_id}` | 멤버 제거 (정책 협의) |

### `POST /trips`

요청:
```json
{
  "title": "도쿄 3박 4일",
  "destination_country": "JP",
  "destination_currency": "JPY",
  "start_date": "2026-12-10",
  "end_date": "2026-12-13"
}
```
응답 `201 Created`:
```json
{
  "data": {
    "id": 12,
    "title": "도쿄 3박 4일",
    "destination_country": "JP",
    "destination_currency": "JPY",
    "start_date": "2026-12-10",
    "end_date": "2026-12-13",
    "created_by": 1,
    "share_code": "TOKYO7"
  }
}
```

### `GET /trips/{trip_id}`

응답:
```json
{
  "data": {
    "id": 12,
    "title": "도쿄 3박 4일",
    "destination_country": "JP",
    "destination_currency": "JPY",
    "start_date": "2026-12-10",
    "end_date": "2026-12-13",
    "member_count": 3,
    "total_krw_amount": 180000,
    "my_unsettled_krw_amount": 30000
  }
}
```

### `GET /trips/{trip_id}/members`

응답:
```json
{
  "data": [
    { "id": 31, "user_id": 1, "nickname": "여행자", "is_guest": false },
    { "id": 32, "user_id": null, "nickname": "친구A", "is_guest": true }
  ]
}
```

> **중요:** 지출 분배와 정산에서는 `user_id`가 아닌 `TRIP_MEMBERS.id`(`member_id`)를 기준으로 사용하면 비회원도 포함할 수 있습니다.

### `POST /trips/{trip_id}/invitations`

응답:
```json
{
  "data": {
    "share_code": "TOKYO7",
    "invite_path": "/invite/TOKYO7"
  }
}
```

### `POST /invitations/accept`

요청:
```json
{ "share_code": "TOKYO7", "nickname": "친구B" }
```
응답:
```json
{ "data": { "trip_id": 12, "member_id": 33 } }
```

> 비회원의 초대 링크 열람/참여 허용 범위와 중복 참여 방지는 정책 확정 필요.

---

## 4. 지출 및 분배 (EXPENSES, EXPENSE_SPLITS)

| Method | Endpoint | 기능 |
|---|---|---|
| GET | `/trips/{trip_id}/expenses` | 여행 지출 목록 |
| POST | `/trips/{trip_id}/expenses` | 현금·수동 지출 등록 |
| GET | `/trips/{trip_id}/expenses/{expense_id}` | 지출 상세 |
| PATCH | `/trips/{trip_id}/expenses/{expense_id}` | 지출 수정 |
| DELETE | `/trips/{trip_id}/expenses/{expense_id}` | 지출 삭제 (정책 협의) |
| GET | `/trips/{trip_id}/expenses/summary` | 카테고리·통화·총액 통계 |

### `GET /trips/{trip_id}/expenses`

선택 쿼리: `?entry_type=cash&currency=JPY&page=1&page_size=20`

응답:
```json
{
  "data": [
    {
      "id": 101,
      "trip_id": 12,
      "title": "점심 식사",
      "category": "food",
      "entry_type": "manual",
      "payment_method": "cash",
      "payer_member_id": 31,
      "amount": 3000,
      "currency": "JPY",
      "exchange_rate": 9.2,
      "rate_date": "2026-12-10",
      "krw_amount": 27600,
      "split_type": "equal",
      "status": "active",
      "occurred_at": "2026-12-10T12:30:00+09:00"
    }
  ],
  "pagination": { "page": 1, "page_size": 20, "total": 1 }
}
```

### `POST /trips/{trip_id}/expenses`

요청 (현금 지출, 균등 분배):
```json
{
  "title": "점심 식사",
  "category": "food",
  "entry_type": "manual",
  "payment_method": "cash",
  "payer_member_id": 31,
  "amount": 3000,
  "currency": "JPY",
  "exchange_rate": 9.2,
  "rate_date": "2026-12-10",
  "split_type": "equal",
  "splits": [
    { "member_id": 31 },
    { "member_id": 32 },
    { "member_id": 33 }
  ],
  "occurred_at": "2026-12-10T12:30:00+09:00"
}
```
응답 `201 Created`:
```json
{
  "data": {
    "id": 101,
    "krw_amount": 27600,
    "splits": [
      { "member_id": 31, "krw_amount": 9200 },
      { "member_id": 32, "krw_amount": 9200 },
      { "member_id": 33, "krw_amount": 9200 }
    ]
  }
}
```

- `entry_type`: 예시 `manual` / `card_message`. 실제 DB의 enum과 맞출 것.
- `payment_method`: 예시 `cash` / `card`.
- `split_type`: `equal`(균등), `custom`(직접 금액 지정) 제안.
- `custom`일 때 `splits[].krw_amount`를 전달하고 **합계가 지출 원화 금액과 일치**해야 함.
- `payer_member_id`와 모든 `splits[].member_id`는 동일 여행의 멤버여야 함.
- 환산과 분배 금액은 서버에서 최종 계산·검증. 소수점 반올림으로 생긴 잔액은 결정적인 규칙으로 한 명에게 배정.
- 카드 결제 취소·부분 취소는 원본 지출을 임의로 덮어쓰지 말고 이벤트/연결 기록을 유지하는 방식 권장.

---

## 5. 카드 앱 푸시 수집 (CARD_EVENTS)

| Method | 전체 경로 | 기능 |
|---|---|---|
| POST | `/api/v1/trips/{trip_id}/collector-connection` | 앱 로그인 세션으로 내 여행 멤버를 자동 연결. 요청 본문은 비워 두거나 `{}` 사용. 응답 `data`에 `trip_id`, `trip_title`, `user_id`, `payer_member_id`, `token` 포함 |
| POST | `/api/collector/pair` | 아이폰 단축어·구버전 앱의 수동 연결용 토큰 발급 |
| POST | `/api/collector/events` | 연결된 앱의 결제 푸시를 받아 지출과 분담 자동 등록 |
| GET | `/api/v1/trips/{trip_id}/card-events?source=app_push` | 해당 여행에 도착한 카드 앱 푸시 내역 |
| POST | `/api/v1/trips/{trip_id}/card-events/sync` | 미반영 푸시 재시도 |
| POST | `/api/v1/trips/{trip_id}/card-events` | 자동으로 식별하지 못한 취소의 원거래 연결 |

휴대폰은 푸시 하나에 UUID를 하나 부여하고, 같은 푸시를 재전송할 때는 해당 UUID를 유지한다. 새 수신은 HTTP 201, 재전송은 HTTP 200이다. 등록 성공 응답의 `card_event.expense_id`는 생성한 여행 지출을 가리킨다. 문자 출처는 HTTP 422로 거절한다. [휴대폰 설정과 요청 JSON](../card-collector/README.md)

카드 승인은 연결된 멤버가 결제하고 등록 시점의 여행 멤버 전원이 균등 분담한다. 구분 가능한 취소는 원 지출에 연결해 차감한다. 이미 등록한 지출을 확인하려면 여행 지출 목록을 조회한다.

---

## 6. 환율 (CURRENCY_EXCHANGES)

| Method | Endpoint | 기능 |
|---|---|---|
| GET | `/exchange-rates` | 기준 통화별 환율 조회 |
| GET | `/trips/{trip_id}/exchange-rates` | 여행 관련 환율 기록 조회 (선택) |

### `GET /exchange-rates?base=JPY&quote=KRW&date=2026-12-10`

응답 (값은 **설명용 예시**, 실시간 환율 아님):
```json
{
  "data": {
    "base": "JPY",
    "quote": "KRW",
    "rate": 9.2,
    "rate_date": "2026-12-10",
    "source": "mock",
    "is_estimated": true
  }
}
```

**필수 규칙**

1. 여행의 `destination_currency`는 입력 화면의 **기본 선택값**일 뿐, 지출마다 다른 통화를 선택할 수 있음.
2. 모든 지출은 원본 `amount`·`currency`와 환산 `exchange_rate`·`rate_date`·`krw_amount`를 함께 보관.
3. 사용자 직접 입력 환율은 허용하되 출처를 `manual` 등으로 구분하는 방안 협의.
4. `KRW → KRW`의 환율은 `1`.
5. 환율 API가 실패하면 Mock/최근 환율을 사용할지, 직접 입력을 요구할지 정책 확정 필요.
6. 지출 저장 후 환율이 바뀌더라도 기존 지출의 저장된 환산 금액을 자동 변경하지 않음.

---

## 7. 정산 (SETTLEMENTS)

| Method | Endpoint | 기능 |
|---|---|---|
| GET | `/trips/{trip_id}/settlements/preview` | 정산 미리보기 (서버 계산) |
| GET | `/trips/{trip_id}/settlements` | 확정된 정산 내역 |
| POST | `/trips/{trip_id}/settlements` | 정산 확정/생성 (정책 협의) |
| PATCH | `/trips/{trip_id}/settlements/{settlement_id}` | 송금 완료 상태 변경 |

### `GET /trips/{trip_id}/settlements/preview`

응답:
```json
{
  "data": {
    "trip_id": 12,
    "currency": "KRW",
    "transfers": [
      {
        "from_member_id": 32,
        "to_member_id": 31,
        "amount": 15000
      },
      {
        "from_member_id": 33,
        "to_member_id": 31,
        "amount": 10000
      }
    ]
  }
}
```

### `PATCH /trips/{trip_id}/settlements/{settlement_id}`

요청:
```json
{ "status": "completed" }
```
응답:
```json
{
  "data": {
    "id": 901,
    "status": "completed",
    "completed_at": "2026-12-14T12:00:00+09:00"
  }
}
```

- 정산 기준은 **KRW** 제안.
- 정산 계산: 멤버별 `총 결제 금액 - 본인 부담 금액`의 순잔액을 기준으로 송금 관계 생성.
- 이미 완료된 송금을 재계산에 반영할지, 정산 확정 후 지출 수정 허용 여부를 정해야 함.
- 중복 정산 생성과 중복 완료 요청에 대한 멱등성 정책 필요.

---

## 8. 홈 대시보드

홈 화면은 여행/지출/정산 상세 목록을 중복 제공하지 않고 **대표 여행, 빠른 실행, 최근 활동** 중심으로 구성합니다.

**초기 구현 권장:** 기존 API를 조합해 구현.
- `GET /trips` → 진행 중·예정 여행 선택
- `GET /trips/{trip_id}` → 대표 여행 카드
- `GET /trips/{trip_id}/expenses` → 최근 지출 2~3건
- `GET /trips/{trip_id}/settlements/preview` → 정산 요약

성능이 필요해지면 `GET /dashboard` 집계 API를 추가하는 방안을 검토합니다. 현재 필수 API는 아닙니다.

---

## 9. 프론트엔드 연동 매핑

| 프론트엔드 서비스 | 관련 API |
|---|---|
| `authService.js` | `/auth/*` |
| `tripService.js` | `/trips/*`, `/invitations/accept` |
| `expenseService.js` | `/trips/{trip_id}/expenses*`, `/trips/{trip_id}/settlements*` (별도 서비스 분리 가능) |
| `cardEventService.js` | `/trips/{trip_id}/card-events`, `/trips/{trip_id}/card-events/sync` |
| `exchangeRateService.js` | `/exchange-rates` |
| `mockData.js` | 백엔드 연동 전 개발용 데이터 (실 API 아님) |

프론트엔드 라우팅(예: `/invite/:code`)과 백엔드 API 경로(예: `/api/v1/invitations/accept`)는 서로 다른 개념입니다.

---

## 10. DB 테이블 대응 (기존 논의 기준)

| 테이블 | 주요 역할 |
|---|---|
| `USERS` | 계정 및 로그인 정보 |
| `TRIPS` | 여행·국가·기본 통화·공유 코드 |
| `TRIP_MEMBERS` | 회원/비회원 여행 참여자 |
| `EXPENSES` | 지출 원금·통화·환율·원화 금액·결제 방식·취소 원본 연결 |
| `CURRENCY_EXCHANGES` | 환율 조회/기록 |
| `CARD_EVENTS` | 카드 알림·중복 방지·승인/취소 이벤트 |
| `EXPENSE_SPLITS` | 멤버별 부담 금액 |
| `SETTLEMENTS` | 정산 송금 관계·완료 상태 |

> ERD에 아직 없는 `title`, `category`, `merchant`, `occurred_at`, `status` 등 예시 필드는 실제 스키마에 존재하는지 확인하고, 없으면 스키마 변경 또는 API 응답 가공으로 합의해야 합니다.

---

## 11. 백엔드 팀과 확정해야 할 항목

- [ ] Flask 등 백엔드 프레임워크 및 Base URL 확정
- [ ] 로그인 방식(JWT/세션), 토큰 만료·갱신 정책 확정
- [ ] 실제 ERD 컬럼명/타입과 요청·응답 필드 일치 확인
- [ ] `entry_type`, `payment_method`, `split_type`, `status` enum 확정
- [ ] 비회원 초대·참여·권한 범위 확정
- [ ] 카드 알림 파싱 결과 형식과 승인/취소/부분 취소 처리 확정
- [ ] 환율 API 제공자, 기준 시점, 직접 수정·실패 처리 확정
- [ ] 카드 실제 원화 청구액 처리 방식 확정
- [ ] 분할 반올림 및 정산 완료 이후 수정 정책 확정
- [ ] 이미지 영수증 업로드 API 필요 여부 확정
- [ ] CORS, 환경변수, 오류 형식, 페이지네이션 규약 확정

## 12. 우선 구현 순서 (제안)

1. 인증 (`signup`, `login`, `me`)
2. 여행 CRUD 및 멤버/초대
3. 지출 CRUD와 분배
4. 환율 조회 및 원화 환산
5. 카드 앱 푸시 자동 등록과 취소 처리
6. 정산 미리보기 및 완료 처리
7. 프론트엔드 Mock 제거 및 통합 테스트
