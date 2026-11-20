# N빵트립 (NTrip)

대학교 심화프로그래밍 4인 팀 프로젝트 — 친구들과의 여행 경비를 기록하고 쉽고 빠르게 정산하는 웹앱 **N빵트립(NTrip)** 입니다.

## 프론트엔드 실행 방법 (`frontend/`)

```bash
cd frontend
npm install
npm run dev
```

- 기본 접속 주소: `http://localhost:5173`
- 프로덕션 빌드: `npm run build`
- 자세한 프론트엔드 구조, Mock 모드 안내 및 백엔드 API 연동 계약은 [`frontend/README.md`](./frontend/README.md)를 참고해 주세요.

> **백엔드 연동 상태 안내**
> 현재 프론트엔드는 Flask 백엔드 API가 준비되기 전 UI 및 사용자 흐름 검증을 위해 기본 `VITE_API_MODE=mock` 모드로 설정되어 있습니다. 실제 인증(`/api/auth/*`), 여행/지출 저장, 초대 코드 발급/검증, 카드 메시지 파싱(`POST /api/card-events/parse`)은 추후 Flask REST API 연동이 필요합니다.
