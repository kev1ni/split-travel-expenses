# NTrip 백엔드 실행과 연결

팀의 [API 명세](../../docs/API.md)에 맞춘 Flask API 주소는 `/api/v1`이다. `feature/backend` 브랜치에는 Supabase 스키마와 서버가 들어 있다. 팀 전체 테스트는 `develop`에서 진행한다. 이 브랜치에는 서버와 React 프론트, 갤럭시 APK, 아이폰 단축어가 함께 있다.

## 1. DB 준비

- **팀 DB가 이미 feature/database 버전이면** Supabase SQL Editor에서 [002 계정 세션](../sql/migrations/002_web_sessions.sql), [003 카드 취소](../sql/migrations/003_card_refunds.sql), [004 정산](../sql/migrations/004_settlement_transactions.sql), [005 서버 전용 접근](../sql/migrations/005_backend_only_access.sql)을 순서대로 적용한다. ⑤부터 공개 키를 사용하던 직접 테이블 접근은 차단된다. Flask 설정에 서버 전용 secret 또는 service-role 키를 준비한다.
- **비어 있는 새 프로젝트라면** [schema.sql](../sql/schema.sql)로 테이블을 만든 후 위 002~005를 적용한다. `schema.sql` 앞부분에는 기존 테이블을 삭제하는 SQL이 포함돼 있다. 기존 팀 데이터가 있는 프로젝트에서는 위 마이그레이션 경로를 사용한다.

## 2. 서버 시작

저장소 루트에서 PowerShell로 실행한다.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r database/requirements.txt
Copy-Item database/.env.example database/.env
```

`database/.env`에 Supabase 프로젝트 URL과 서버 키를 설정한다. `NTRIP_SESSION_SECRET`과 `COLLECTOR_SIGNING_KEY`는 아래 명령을 각각 실행해 얻은 서로 다른 값으로 채운다. 재시작 후 기존 로그인 및 휴대폰 연결을 유지하려면 같은 키를 사용한다.

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
.\.venv\Scripts\python database/app.py
```

`http://127.0.0.1:5000/api/health?db=true`에서 `database: connected`를 확인한다. `/api`에는 실행 중인 라우트 목록이 있다. 웹과 API를 같은 HTTPS 주소에 배포할 때에는 `SESSION_COOKIE_SECURE=true`로 설정하고, 리버스 프록시가 원래 Host를 전달하게 하거나 `CORS_ORIGINS`에 정확한 웹 주소를 넣는다. Supabase 서버 키와 서명 키는 서버에만 둔다.

## 3. React와 휴대폰 연결

`git switch develop`과 `git pull --ff-only`로 최신 코드를 받은 뒤 `cd frontend` → `npm ci` → `npm run dev`를 실행한다. 웹은 기본적으로 실제 API를 호출하고 Vite가 `/api`를 Flask로 전달한다. `npm run build` 후에는 Flask 한 프로세스가 같은 주소에서 결과물과 API를 함께 제공한다.

1. 웹에서 회원가입·로그인 후 여행을 만든다. 친구는 초대 링크에서 닉네임을 입력해 게스트로 참여할 수 있다.
2. 여행의 **카드 지출 → 휴대폰 수집기 연결**에서 결제자를 선택하고 계정 비밀번호로 연결 토큰을 발급한다. 본인의 결제자를 연결할 수 있고 방장은 여행의 게스트도 연결할 수 있다.
3. 휴대폰에 기기에서 접근 가능한 **HTTPS 주소 + `/api/collector/events`** 및 해당 토큰을 입력한다. 갤럭시는 수집 앱, 아이폰은 **NTrip 현대카드 전송** 단축어를 사용한다. PC의 localhost는 휴대폰에서 PC 서버를 가리키지 않는다. 개발 화면에서 휴대폰용 HTTPS 주소를 따로 표시하려면 프론트 빌드 환경에 `VITE_COLLECTOR_PUBLIC_ORIGIN`을 설정한다.
4. 수신한 알림을 웹에서 검토해 지출로 확정하고, **정산 계산**으로 멤버별 송금액을 확인한다. 승인번호가 없는 서로 다른 채널의 결제는 사용자가 확인한다. 금액만 같은 두 결제를 자동 병합하지 않는다.

## API에서 정한 동작

| 항목 | 구현 |
|---|---|
| 사용자 인증 | 로그인 응답의 Bearer 토큰 또는 브라우저 HttpOnly 세션 쿠키. 유효기간 7일이며 로그아웃이 서버 세션을 폐기한다. 초대 게스트의 세션은 참여한 여행에만 접근한다. |
| 금액 | 외화 1단위당 KRW 기준으로 Decimal 계산 후 원 단위 반올림. 직접 분할은 합계가 일치해야 한다. 저장된 환율과 기준일은 지출에 보관한다. |
| 환율 조회 | [Frankfurter 기준 환율](https://frankfurter.dev/)을 사용한다. 같은 통화의 환율은 1이다. 외화 조회 실패 시 직접 입력할 수 있고 가상 환율은 저장하지 않는다. |
| 카드 | 파싱은 저장 전 미리보기다. 휴대폰은 여행·결제자 범위의 별도 Bearer 토큰을 사용한다. 같은 UUID 전송은 멱등 처리하고 연관된 채널 이벤트는 지출 하나에 연결한다. 취소·부분 취소는 원거래와 연결된 음수 지출을 남긴다. |
| 정산 | 미리보기는 조회만 수행한다. 방장이 확정하고 송금 당사자 또는 방장이 완료할 수 있다. 이미 완료한 송금은 잔액에 반영한다. |
| 기존 서버 API | 구버전 비회원용 원시 라우트를 사용하는 서버 간 호출은 서버에서 별도로 지정한 `NTRIP_LEGACY_API_KEY`를 `X-Legacy-Key`로 전달한다. 웹·휴대폰에는 이 키가 필요 없다. |

## 검증

```powershell
.\.venv\Scripts\python -m pip install pytest
.\.venv\Scripts\python -m pytest -q database/tests
```

기본 테스트는 메모리 DB를 사용한다. 실제 DB용 시험은 별도의 테스트 프로젝트에서 실행한다. 운영 팀 DB에는 테스트 데이터를 자동으로 넣지 않는다.
