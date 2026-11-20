# N빵트립 (NTrip) Frontend

대학교 심화프로그래밍 팀 프로젝트 **N빵트립(NTrip)** 여행 경비 정산 웹앱의 React + Vite 프론트엔드입니다.

## 기술 스택

- React 18 + Vite 6 (JSX)
- Tailwind CSS 3 (CSS 변수 기반 테마 토큰)
- React Router DOM 6
- Lucide React (아이콘)

## 실행 방법

```bash
cd frontend
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173` 에서 실행됩니다.

프로덕션 빌드 확인:

```bash
npm run build
npm run preview
```

## 환경 변수 및 Mock / 실제 API 모드 전환

`frontend/.env.development` 또는 `.env.local` 에서 모드를 전환할 수 있습니다.

```env
# 'mock' (개발용 샘플/Mock 모드) 또는 'api' (Flask 백엔드 실제 연동)
VITE_API_MODE=mock

# 실제 API 모드 시 백엔드 기본 URL (비워두면 Vite 프록시 /api -> http://localhost:5000 사용)
VITE_API_BASE_URL=
```

> **주의**: 현재 백엔드 Flask API 연동 전에는 `VITE_API_MODE=mock` 모드로 동작합니다.
> - Mock 모드에서는 화면 상단에 **개발용 Mock 모드** 배너가 표시됩니다.
> - Mock 테스트 계정: `demo` / `ntrip1234` (또는 회원가입 화면에서 새 계정을 생성해 현재 세션 내에서 로그인 테스트 가능)
> - 비밀번호는 `localStorage` 나 콘솔에 저장·출력하지 않습니다.
> - 실제 운영 환경(`VITE_API_MODE=api`)에서는 `/api/auth/me` 서버 검증 및 Flask HttpOnly 쿠키 기반 세션 인증(`credentials: 'include'`)을 전제로 동작합니다.

## 구현된 화면 및 경로

- `/` : 랜딩 페이지
- `/login` : 로그인
- `/signup` : 회원가입
- `/home` : 메인 홈 대시보드 (로그인 보호 라우트)
- `/trips` : 내 여행 목록 및 초대 코드 입력
- `/trips/new` : 새 여행 만들기 기본 UI (백엔드 저장 API 연동 대기)
- `/trips/:tripId` : 여행 상세 페이지 (기본 정보, 참여 친구 및 비회원 추가, 총지출, 현금/카드 지출 목록, 정산 결과, 지출 통계)
- `/invite/:inviteCode` : 친구 초대 수락 화면 (미로그인 시 로그인 후 자동 복귀)
- `/trips/:tripId/expenses/cash` : 현금 지출 직접 입력
- `/trips/:tripId/expenses/card` : 카드 결제 메시지 파싱 확인 및 등록 (신규/중복/분석실패/취소/부분취소 상태 UI 지원)
- `/expenses`, `/settlements` : 경비 관리 / 정산 내역 요약 화면

## 추후 Flask 백엔드 연동이 필요한 API (임시 제안 경로)

엔드포인트는 `src/services/apiClient.js` 의 `API_ENDPOINTS` 에서 중앙 관리합니다.

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard`
- `GET /api/trips`, `POST /api/trips`
- `GET /api/trips/:tripId`
- `GET /api/trips/:tripId/members`, `POST /api/trips/:tripId/members/guest`
- `POST /api/trips/:tripId/invitations`
- `GET /api/invitations/:inviteCode`, `POST /api/invitations/:inviteCode/accept`
- `GET /api/trips/:tripId/expenses`, `POST /api/trips/:tripId/expenses`
- `POST /api/card-events/parse`
