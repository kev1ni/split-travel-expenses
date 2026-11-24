# ✈️ Split Travel (여행 경비 자동 정산 시스템)

**React와 수집기를 연결하는 현재 API는 `/api/v1`이다.** [서버 실행·DB 마이그레이션·팀 연동 방법](docs/BACKEND_V1.md)과 [팀 API 명세](../docs/API.md)를 먼저 참고한다. 아래 팀 DB 문서는 기본 스키마와 기존 서버 간 인터페이스를 설명한다.


> **여행 경비 관리 및 카드 결제 문자 자동 파싱 기반 스마트 정산 백엔드/데이터베이스 시스템**

**Split Travel**은 여행 중 발생하는 복잡한 현지 통화 지출, 환전 내역, 카드 결제 내역을 손쉽게 기록하고, 동행자 간의 정산을 최소한의 송금 횟수로 자동 계산해 주는 정산 관리 플랫폼입니다.

---

## 📌 주요 특징 (Key Features)

1. **안전한 회원 인증 & 유연한 멤버 관리**
   - Flask(Werkzeug) 보안 기능을 활용한 솔트 기반 비밀번호 단방향 암호화 (`USERS`)
   - 앱 계정이 없는 동행자도 닉네임만으로 초대할 수 있는 게스트 지원 (`TRIP_MEMBERS.user_id: NULL`)
   - 6자리 영숫자 고유 초대 코드(`share_code`)를 통한 간편 여행 방 입장 (헷갈리는 `0/O/1/I` 제외)

2. **카드 앱 승인 푸시 자동 등록 (`CARD_EVENTS`)**
   - 연결한 휴대폰이 카드사 앱의 승인 푸시를 보내면 여행 지출과 균등 분담을 자동 생성합니다.
   - 재전송 시 같은 `event_id`를 사용하면 이미 반영한 지출을 반환합니다. [휴대폰 연결](../card-collector/README.md)

3. **다양한 지출 분할 방식 & 금액 정합성 검증 (`EXPENSE_SPLITS`)**
   - **균등 분할(equal)**: `percentage_bp`(10000 = 100.00%)를 자동 배분하고 원 단위 나머지를 보정
   - **금액 직접 분할(exact)**: 인원별 분담 금액을 직접 지정
   - **비율 분할(percentage)**: 인원별 비율(bp)을 지정하면 금액을 자동 계산
   - **검증**: 분할 합계가 원화 총액(`krw_amount`)과 1원이라도 다르면 저장을 차단

4. **최소 거래 횟수 자동 정산 알고리즘 (`SETTLEMENTS`)**
   - 모든 멤버의 총 결제액(`Paid`)과 분담액(`Owed`)을 대조해 순 잔액(`Net Balance`) 계산
   - 이미 송금 완료된 건을 반영하고, 큰 금액부터 매칭하는 탐욕(Greedy) 방식으로 **최소 송금 내역** 산출
   - 정산 버튼을 여러 번 눌러도 대기 중(pending) 정산이 중복 생성되지 않음

5. **대시보드 통계 및 환전 관리**
   - 카테고리별 · 결제수단별 · 날짜별 · 결제자별 지출 통계
   - 통화별 환전 합계, 평균 환율, 현금 사용액 기준 남은 외화 추정치

---

## 🛠️ 기술 스택 (Tech Stack)

| 분류 | 기술 |
| :--- | :--- |
| **Backend Framework** | Python 3.10+, Flask 3 (Blueprint), Flask-CORS, waitress |
| **Database** | Supabase (PostgreSQL 15+) |
| **Database Client** | `supabase-py` (v2.x), `PostgREST` |
| **Security** | Werkzeug Security (Scrypt / PBKDF2 Password Hashing) |
| **Configuration** | `python-dotenv` |

---

## 🗄️ 데이터베이스 ERD 구조

본 시스템은 Supabase(PostgreSQL) 상에서 8개의 테이블로 구성되어 있습니다.

```
[USERS] ────────< [TRIP_MEMBERS] >──────── [TRIPS]
  │                     │                     │
  │                     ├──────────┐          │
  ▼                     ▼          ▼          ▼
[TRIPS]           [EXPENSES]  [SETTLEMENTS] [CURRENCY_EXCHANGES]
(created_by)            │
                        ▼
                [EXPENSE_SPLITS]
                        ▲
                        │ (연동)
                 [CARD_EVENTS]
```

* **`USERS`**: 회원 계정 정보 (이메일/아이디 고유값, 해시 암호화)
* **`TRIPS`**: 여행 그룹 기본 정보 및 초대 코드
* **`TRIP_MEMBERS`**: 여행 방별 참가자 (회원 또는 게스트, 같은 여행 내 닉네임 중복 불가)
* **`CURRENCY_EXCHANGES`**: 외화 환전 기록
* **`EXPENSES`**: 결제 내역 (현지 통화 금액, 원화 환산액, 결제 수단, 카테고리)
* **`EXPENSE_SPLITS`**: 개별 지출에 대한 인원별 분담금
* **`SETTLEMENTS`**: 최종 채권자/채무자 간 송금 정산 내역
* **`CARD_EVENTS`**: 외부에서 수신된 카드 승인 원천 데이터

### 코드 값 규칙 (모두 소문자로 저장)

| 컬럼 | 허용 값 |
| :--- | :--- |
| `EXPENSES.entry_type` | `manual`, `auto_card`, `correction`, `cancellation` |
| `EXPENSES.split_type` | `equal`, `exact`, `percentage` (요청 시 `custom`은 `exact`로 변환) |
| `SETTLEMENTS.status` | `pending`, `completed` |

---

## 📂 프로젝트 디렉터리 구조

```text
database/
├── app.py                     # 서버 진입점: create_app() + 실행 (python app.py)
├── config.py                  # .env 설정을 한 곳에서 읽음 (settings)
├── requirements.txt
├── .env.example               # .env 작성 예시 (.env는 Git에 올리지 않음)
│
├── core/                      # 공통 기반
│   ├── db.py                  #   Supabase 클라이언트 + 테이블명 상수
│   ├── errors.py              #   예외 → HTTP 상태코드 (400/401/404/409/500)
│   ├── validators.py          #   입력 검증·변환 (정수, 금액, 통화, 날짜, 시간대)
│   ├── constants.py           #   코드 값 (split_type 등) — GET /api/meta로도 제공
│   └── http.py                #   응답 형식, 에러 핸들러, 파싱 앱 API 키, 요청 로그
│
├── services/                  # 비즈니스 로직 (도메인별, Flask와 무관)
│   ├── common.py              #   여행·멤버 존재 확인 등 공통 조회
│   ├── users.py               #   회원가입 / 로그인 / 내 여행 목록
│   ├── trips.py               #   여행 생성·상세·초대 코드 / 참가자
│   ├── expenses.py            #   지출 + 분할 계산(build_splits) / 수정 / 삭제 / 조회
│   ├── settlements.py         #   잔액 계산 / 최소 송금 정산 / 송금 완료·취소
│   ├── exchanges.py           #   환전
│   ├── card_events.py         #   카드 앱 푸시 수신 / UUID 재전송 / 지출 연결
│   └── summary.py             #   대시보드 통계
│
├── routes/                    # REST API (Flask Blueprint, 도메인별 1파일)
│   ├── __init__.py            #   register_blueprints()
│   ├── meta.py  users.py  trips.py  expenses.py
│   └── settlements.py  exchanges.py  card_events.py
│
├── sql/
│   ├── schema.sql             # 전체 스키마 (DROP 후 재생성 → 새 DB용)
│   └── migrations/
│       └── 001_improvements.sql  # 기존 DB에 v2 변경사항만 적용 (데이터 유지)
│
├── docs/
│   ├── API_DOCUMENTATION.md   # 전체 API 명세
│   └── INTEGRATION_GUIDE.md   # 프론트엔드 · 파싱 앱 연동 가이드 ← 연결 담당자는 여기부터
│
├── examples/                  # 그대로 복사해서 쓰는 연결 코드
│   ├── frontend/api.js        #   프론트엔드용 API 클라이언트 (fetch, 의존성 없음)
│   └── parser/send_card_event.py  # 파싱 앱 전송 예제 (재시도·중복 처리 포함)
│
└── tests/
    ├── fake_supabase.py       # 실제 DB 없이 테스트하는 가짜 Supabase
    ├── test_api.py            # 전체 API 통합 테스트 (가짜 DB)
    └── test_live_supabase.py  # 실제 Supabase 연결 통합 테스트 (데이터 자동 정리)
```

**요청 흐름**: `routes/*.py` (요청 파싱·응답) → `services/*.py` (검증·계산·DB) → `core/db.py` (Supabase)

| 무엇을 고치고 싶을 때 | 볼 파일 |
| :--- | :--- |
| 새 API 추가 | `routes/<도메인>.py`에 함수 추가 (Blueprint에 자동 등록) |
| 분할·정산 계산 방식 | `services/expenses.py`의 `build_splits`, `services/settlements.py`의 `calculate_settlements` |
| 입력 검증 규칙 | `core/validators.py`, `core/constants.py` |
| 환경 설정 항목 | `config.py`, `.env.example` |

---

## 🚀 빠른 시작 (Getting Started)

### 1. 가상환경 생성 및 의존 패키지 설치
```bash
# 가상환경 생성 및 활성화 (Windows PowerShell 기준)
python -m venv venv
.\venv\Scripts\Activate.ps1

# 필수 라이브러리 설치
pip install -r requirements.txt
```

### 2. 데이터베이스 준비
- **새 DB**: Supabase SQL Editor에서 `sql/schema.sql` 실행
- **이미 데이터가 있는 DB**: `sql/migrations/001_improvements.sql` 실행 (파일 상단의 사전 확인 쿼리 먼저). 이미 실행했다면 다시 할 필요 없음

> ⚠️ `sql/schema.sql`은 맨 위에서 모든 테이블을 `DROP`합니다. 운영 중인 DB에는 실행하지 마세요.

### 3. 환경 변수 설정 (`.env`)
`.env.example`을 복사해 `.env`를 만들고 Supabase 대시보드(`Project Settings > API Keys`)의 값을 입력합니다.

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...          # 권장 (백엔드 전용)
# SUPABASE_PUBLISHABLE_KEY=sb_publishable_... # secret key가 없을 때만
```

| 변수 | 필수 | 설명 |
| :--- | :---: | :--- |
| `SUPABASE_URL` | ✅ | 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | 둘 중 하나 | 백엔드 전용 키. 우선 사용됨 (`SUPABASE_SERVICE_ROLE_KEY`도 인식) |
| `SUPABASE_PUBLISHABLE_KEY` | 둘 중 하나 | 공개 키. RLS가 꺼져 있어야 동작 |
| `FLASK_DEBUG` | | `true`면 디버그 모드 + 500 에러 상세 메시지 노출 (기본 `false`) |
| `PORT` | | 서버 포트 (기본 `5000`) |
| `CORS_ORIGINS` | | 허용 출처, 쉼표 구분 (기본 `*`) |
| `DEFAULT_UTC_OFFSET` | | 시간대 없이 들어온 시각에 붙일 오프셋 (기본 `+09:00`) |
| `HOST` | | 바인딩 주소 (기본 `0.0.0.0` = 같은 네트워크의 다른 기기에서 접속 가능) |
| `PARSER_API_KEY` | | 설정하면 `POST /api/card-events`에 `X-API-Key` 헤더 필수 (파싱 앱 전용 비밀값) |

> **🔐 보안 주의 (publishable key + RLS 꺼짐)**  
> publishable key는 앱·웹에 노출돼도 되는 **공개 키**입니다. RLS가 꺼진 상태에서는 이 키만 있으면 누구나 Supabase REST API로 `USERS`(비밀번호 해시 포함)를 직접 조회·수정할 수 있습니다.  
> 개발 중에는 괜찮지만, 배포 전에는 **`.env`를 `SUPABASE_SECRET_KEY`로 바꾸고 모든 테이블의 RLS를 켜는 것**(`sql/schema.sql` 하단 주석)을 권장합니다. 그러면 Flask 서버만 DB에 접근할 수 있습니다.

### 4. Flask API 서버 실행
```bash
python app.py
```
* 콘솔에 이 PC 주소와 **같은 와이파이용 주소**(휴대폰 파싱 앱용)가 출력됩니다.
* `http://localhost:5000/api/health?db=true` → Supabase 연결까지 확인
* `waitress`가 설치돼 있으면 운영용 서버로, `FLASK_DEBUG=true`면 자동 재시작되는 개발 서버로 실행됩니다.

### 5. 테스트 (선택)
```bash
python tests/test_api.py               # 가짜 DB로 전체 API 흐름 검증 (인터넷·Supabase 불필요)
python tests/test_live_supabase.py     # 실제 Supabase DB로 13단계 검증 (y 입력 후 실행)
```
- `test_live_supabase.py`는 `.env`의 Supabase에 `livetest_xxxxxxxx` 이름의 테스트 데이터를 만들고, 끝나면(실패해도) 모두 삭제합니다. 기존 데이터는 건드리지 않습니다.
- 단계별로 ✅/❌와 원인 힌트(마이그레이션 미적용, 테이블명, RLS 등)를 보여줍니다.
- 옵션: `--yes`(확인 생략), `--keep`(데이터를 남겨서 Supabase 대시보드에서 확인)

### 6. 프론트엔드 · 파싱 앱 연결
👉 [docs/INTEGRATION_GUIDE.md](./docs/INTEGRATION_GUIDE.md) — 서버 주소, 화면별 호출 순서, 오류 처리, 파싱 앱 전송 규칙, 문제 해결

---

## 📡 REST API 요약

상세한 요청/응답 JSON 규격은 [docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md)를 참고하세요. (🆕 = v2 이후 신규)

### 서버
- `GET /api/health` : 서버 상태 (`?db=true`로 DB 연결 확인)
- 🆕 `GET /api/meta` : 코드 값 목록 (분할 방식, 카테고리 등 드롭다운용)

### 인증 & 회원
- `POST /api/register` : 신규 회원가입
- `POST /api/login` : 로그인 및 비밀번호 검증
- `GET /api/users/<user_id>/trips` : 내가 참여 중인 여행 목록

### 여행 그룹 & 참가자
- `POST /api/trips` : 여행 그룹 생성 (방장 멤버 자동 등록)
- 🆕 `GET /api/trips/<trip_id>` : 여행 상세 + 참가자 목록
- `GET /api/trips/share/<share_code>` : 초대 코드로 여행 정보 미리보기
- `POST /api/trips/join` : 초대 코드로 여행 참가
- `GET /api/trips/<trip_id>/summary` : 대시보드 통계
- `POST /api/trips/<trip_id>/members` : 참가자(회원/게스트) 추가
- `GET /api/trips/<trip_id>/members` : 참가자 목록
- `GET /api/trips/<trip_id>/members/<member_id>/summary` : 개인 잔액
- 🆕 `GET /api/trips/<trip_id>/balances` : 전체 멤버 잔액

### 지출 & 정산
- `POST /api/trips/<trip_id>/expenses` : 지출 + 분할 (+ 카드 이벤트 연결) 한 번에 등록
- `GET /api/trips/<trip_id>/expenses` : 지출 목록 (🆕 카테고리·기간·결제자 필터, 페이지네이션)
- 🆕 `GET /api/trips/<trip_id>/expenses/<expense_id>` : 지출 1건 조회
- 🆕 `PATCH /api/trips/<trip_id>/expenses/<expense_id>` : 지출 수정
- 🆕 `DELETE /api/trips/<trip_id>/expenses/<expense_id>` : 지출 삭제
- `POST /api/trips/<trip_id>/settle` : 정산 계산 (기존 대기 정산 교체)
- `GET /api/trips/<trip_id>/settlements` : 정산 내역 (🆕 `?status=` 필터)
- `PATCH /api/settlements/<id>/complete` : 송금 완료 처리
- 🆕 `PATCH /api/settlements/<id>/cancel` : 송금 완료 취소

### 환전
- `POST /api/trips/<trip_id>/exchanges` : 환전 등록
- `GET /api/trips/<trip_id>/exchanges` : 환전 내역

### 카드 결제 파싱 연동
- `POST /api/card-events` : 카드 파싱 앱 데이터 수신 (🆕 `X-API-Key` 헤더, 서버 설정 시)
- `GET /api/card-events/unassigned` : 미등록 카드 결제 내역 (🆕 `trip_id`, `payer_member_id`, `limit` 필터)

---

## 🧱 v3 변경 사항 — 구조 개편 & 연동 준비

### 왜 구조를 바꿨나
| 이전 | 문제 | 이후 |
| :--- | :--- | :--- |
| `insert_to_db.py`(40KB) / `select_from_db.py` — **입력/조회 기준**으로 분리 | 지출 하나를 고치려면 두 파일을 오가야 하고, 정산 계산이 조회 파일의 잔액 함수에 의존해 서로 import가 꼬임 | `services/`에 **도메인 기준**으로 분리 (지출은 `expenses.py` 하나에 등록·조회·수정·삭제) |
| `app.py`(400줄)에 모든 라우트 | 파일 하나가 계속 커짐 | `routes/`에 도메인별 Blueprint, `app.py`는 조립만 |
| `.env`를 `db.py`, `app.py`, `insert_to_db.py`가 각자 읽음 | 설정이 흩어짐 | `config.py` 하나로 **통합** |
| 검증 헬퍼가 `insert_to_db.py` 안에 숨어 있음 | 재사용 불가 | `core/validators.py`로 분리 |
| 에러 핸들러·응답 함수가 `app.py`에 섞임 | | `core/http.py`로 **통합** |
| SQL·문서가 코드와 같은 폴더 | 파일이 많아 찾기 어려움 | `sql/`, `docs/`로 정리 |

### 연동을 위해 추가한 것
- **`docs/INTEGRATION_GUIDE.md`**: 프론트엔드·파싱 앱 담당자가 이 문서만 보고 연결할 수 있게 정리 (주소, 방화벽, 화면별 API 순서, `user_id`/`member_id` 구분, 재시도 규칙, Kotlin 예시)
- **`examples/frontend/api.js`**: 모든 API를 함수로 감싼 클라이언트. 오류는 `ApiError`(상태코드 + 한국어 메시지)로 통일
- **`examples/parser/send_card_event.py`**: 파싱 앱 전송 예제 (UUID 재사용, 4xx/5xx 구분 재시도)
- **파싱 앱 API 키** (`PARSER_API_KEY` → `X-API-Key` 헤더): 외부에서 가짜 결제 데이터를 넣지 못하게
- **`GET /api/meta`**: 분할 방식·카테고리 등 코드 값을 프론트가 하드코딩하지 않도록
- **요청 로그**: 서버 콘솔에 `POST /api/trips 201 (12ms)` 형태로 출력 → 연동 중 어떤 요청이 왔는지 바로 확인
- **실행 시 접속 주소 출력** (같은 와이파이 IP 포함), `waitress` 운영 서버 지원
- **CORS**: `X-API-Key` 헤더와 `PATCH`/`DELETE` 메서드 명시 허용
- **`tests/`**: 가짜 Supabase로 전체 API 통합 테스트 (`python tests/test_api.py`)

### 동작 변경 (API)
- 없는 여행의 `GET /summary`, `GET /balances` → 404 (이전: 0으로 채운 응답)
- `POST /settle` 응답에 `sender_nickname`, `receiver_nickname` 포함
- 요청/응답 형식은 그 외 v2와 동일합니다.

---

## 🔧 v2 개선 사항 (변경 이력)

### 1. 반드시 고쳐야 했던 문제 (버그)

| # | 문제 | 영향 | 조치 |
| :-: | :--- | :--- | :--- |
| 1 | `app.py`, `select_from_db.py`가 `from db import get_supabase_client`를 쓰는데 **`db.py` 파일이 없음** | 서버가 시작되지 않음 (`ModuleNotFoundError`) | `db.py` 신규 작성 (v3에서 `core/db.py`) |
| 2 | 코드에서 테이블명을 대문자(`"USERS"`)로 요청 | `schema.sql`은 따옴표 없이 만들어 실제 테이블명이 소문자(`users`)라서, 대소문자를 구분하는 Supabase REST API가 테이블을 찾지 못함 | 테이블명 상수를 소문자로 변경 (`core/db.py`, Table Editor에서 대문자로 만들었다면 상수만 되돌리면 됨) |
| 3 | `/settle`을 호출할 때마다 정산이 **새로 INSERT** | 정산 내역이 계속 중복 누적 | 기존 `pending` 정산을 지우고 다시 계산, `completed` 송금은 잔액에 반영 |
| 4 | 지출 저장 후 분할 저장이 실패하면 지출만 남음 | 분할 없는 "고아" 지출 → 정산 금액 틀어짐 | 모든 검증·계산을 먼저 끝낸 뒤 저장, 분할 실패 시 지출 삭제(보상 처리). 여행 생성+방장 등록도 동일 |
| 5 | 코드 값 대소문자 불일치 (DB 기본값 `'MANUAL'`, `'PENDING'` / 코드 `'manual'`, `'pending'`) | 필터·비교 결과가 섞임 | 소문자로 통일 + DB `CHECK` 제약 추가 |
| 6 | 외화 `amount`가 `INTEGER` | `12.50 USD` 같은 소수 금액 저장 불가 | `NUMERIC(14,2)`로 변경, 환율도 `TEXT` → `NUMERIC(18,6)` |
| 7 | `"2026-11-25 12:30:00"`처럼 시간대 없이 저장 | Supabase는 UTC로 해석해서 **9시간 어긋남** | 시간대 없는 시각에 `+09:00`(설정 가능) 자동 부착, 날짜별 통계도 한국 시간 기준 |
| 8 | 요청 본문이 비었거나 JSON이 아니면 `None.get()` 오류 | 400이어야 할 요청이 500 | `get_json_body()`로 공통 처리 |
| 9 | 초대 코드 참가에서 `share_code` 누락 시 `None.strip()` 오류 | 500 | 400으로 처리 |
| 10 | 존재하지 않는 정산 ID로 송금 완료 요청해도 200 | 프론트가 실패를 알 수 없음 | 404 / 이미 완료된 건은 409 |
| 11 | 같은 회원이 같은 여행에 다시 참가하면 DB 오류가 그대로 500 | | 409 + 안내 메시지, 같은 여행 내 닉네임 중복도 방지 |
| 12 | 다른 여행의 `member_id`로 지출·분할 등록 가능 | 정산이 다른 여행과 섞일 수 있음 | 결제자·분할 대상이 해당 여행 참가자인지 검증 |
| 13 | 환전 요약이 여러 통화를 하나로 합산 (JPY + USD) | 의미 없는 숫자 | 통화별(`by_currency`) 집계 |
| 14 | `get_trip_by_share_code`의 참가자 수가 `count="exact"` 대신 `len(data)` 사용 | 1000명 넘으면 부정확 | `res.count` 사용 |

### 2. 구조/품질 개선
- **에러 처리 통합**: `core/errors.py`의 예외(400/401/404/409/500)를 `core/http.py`의 `errorhandler`가 공통 JSON으로 변환 → 라우트마다 반복되던 `try/except` 제거
- **운영 설정 분리**: `debug=True` 하드코딩 → `FLASK_DEBUG` 환경변수, 500 에러의 내부 메시지는 디버그 모드에서만 노출
- **CORS 출처 제한 가능** (`CORS_ORIGINS`), 응답 JSON 한글 그대로 출력 (`ensure_ascii=False`)
- **입력 검증 강화**: 이메일 형식, 비밀번호 8자 이상, 통화 코드 3자리, 날짜 형식, `end_date >= start_date`, 문자열 길이
- **회원가입 비밀번호 키**: `password` 권장 (기존 `password_hash` 키도 계속 허용)
- **로그인 실패 시 `print()` 제거**, 응답에서 `password_hash` 항상 제외
- **`supabase` 키 우선순위**: secret → service_role → publishable
- **DB 인덱스 정리**: UNIQUE와 중복되던 `idx_trips_share_code` 제거, FK·조회 컬럼 인덱스 추가

### 3. 새 기능
- **지출 수정/삭제 API** — 금액 변경 시 균등 분할이면 자동 재계산, 삭제 시 연결된 카드 이벤트는 다시 '미등록'으로
- **비율 분할(`percentage`)** — 비율(bp) 합계 10000 검증, 남는 원 단위는 소수점이 큰 순서대로 배분
- **분할 생략 시 여행 전체 균등 분할**
- **`krw_amount` 자동 계산** — KRW면 `amount` 그대로, 외화면 `amount × exchange_rate` (반올림)
- **환전 환율 자동 계산** — `exchange_rate` 생략 시 `원화 ÷ 외화`
- **동일 푸시 재전송** — 같은 `event_id`는 HTTP 200과 기존 지출 ID를 반환
- **카드 이벤트로 지출 등록 시 `entry_type` 자동 `auto_card`**, 이미 연결된 이벤트는 409
- **전체 멤버 잔액 API**, **송금 완료 취소 API**, **여행 상세 API**
- **지출 목록 필터/페이지네이션** (`category`, `payer_member_id`, `from`, `to`, `limit`, `offset`)
- **대시보드 확장** — 날짜별·결제자별 지출, 통화별 평균 환율·남은 외화 추정치
- **헬스체크 DB 연결 확인** (`/api/health?db=true`)

### 4. 앞으로 하면 좋은 것 (미구현)
- **API 인증 토큰(JWT)**: 지금은 로그인 후에도 `user_id`만 알면 누구나 다른 사람의 여행을 조회·수정할 수 있습니다. 로그인 시 토큰을 발급하고 각 API에서 "요청자가 이 여행의 멤버인지" 확인하는 것이 다음 단계입니다. (Supabase Auth를 쓰는 방법도 있음)
- **진짜 트랜잭션**: 지금은 보상 처리(실패 시 되돌리기) 방식입니다. 지출+분할 저장을 PostgreSQL 함수(RPC)로 만들어 `client.rpc()`로 호출하면 완전한 원자성을 보장할 수 있습니다.
- **영수증 이미지 업로드**: Supabase Storage에 올리고 `receipt_image_path`에 경로 저장

---

## 📄 License
This project is licensed under the MIT License.
