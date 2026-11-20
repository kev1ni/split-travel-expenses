/**
 * Split Travel 백엔드 API 클라이언트 (프론트엔드용)
 *
 * - 프레임워크 무관 (React / Vue / 순수 JS 모두 사용 가능), 의존성 없음 (fetch 사용)
 * - 프로젝트에 그대로 복사해서 사용하세요. 예: src/api/api.js
 *
 * 사용 예)
 *   import { api, setBaseUrl, ApiError } from "./api.js";
 *   setBaseUrl("http://localhost:5000");          // 기본값. 배포 시 서버 주소로 변경
 *
 *   const { user } = await api.login("hong123", "mypassword123!");
 *   const { trips } = await api.getUserTrips(user.id);
 *
 *   try {
 *     await api.createExpense(tripId, { payer_member_id: 1, title: "라멘", amount: 3960, currency: "JPY", exchange_rate: 9.1 });
 *   } catch (e) {
 *     if (e instanceof ApiError) alert(e.message);   // 서버가 보낸 한국어 오류 메시지
 *   }
 *
 * 모든 함수는 서버 응답 JSON 전체({ status: "success", ... })를 반환합니다.
 * 실패(HTTP 4xx/5xx)하면 ApiError를 던집니다. (e.status = HTTP 코드, e.message = 서버 메시지)
 */

let BASE_URL = "http://localhost:5000";

export function setBaseUrl(url) {
  BASE_URL = url.replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 400 입력 오류, 401 인증, 404 없음, 409 중복/상태충돌, 500 서버
    this.body = body;
  }
}

function toQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, "서버에 연결할 수 없습니다. 서버 주소와 실행 여부를 확인하세요.", null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new ApiError(res.status, (data && data.message) || `요청 실패 (HTTP ${res.status})`, data);
  }
  return data;
}

export const api = {
  // ---------- 서버 ----------
  health: (checkDb = false) => request("GET", `/api/health${checkDb ? "?db=true" : ""}`),
  /** 드롭다운용 코드 값: { meta: { split_types, categories, payment_methods, ... } } */
  getMeta: () => request("GET", "/api/meta"),

  // ---------- 회원 ----------
  /** → { user: { id, login_id, name, email } } */
  register: ({ login_id, password, name, email }) =>
    request("POST", "/api/register", { login_id, password, name, email }),
  /** → { user } , 실패 시 ApiError(401) */
  login: (login_id, password) => request("POST", "/api/login", { login_id, password }),
  /** → { trips: [ { ..., my_member_id, my_nickname } ] } */
  getUserTrips: (userId) => request("GET", `/api/users/${userId}/trips`),

  // ---------- 여행 / 참가자 ----------
  /** data: { title, created_by, creator_nickname?, description?, destination_country?, destination_currency?, start_date?, end_date? }
   *  → { trip, owner_member } */
  createTrip: (data) => request("POST", "/api/trips", data),
  /** → { trip: { ..., members: [...], member_count } } */
  getTrip: (tripId) => request("GET", `/api/trips/${tripId}`),
  getTripByShareCode: (shareCode) => request("GET", `/api/trips/share/${encodeURIComponent(shareCode)}`),
  /** 회원: { share_code, nickname, user_id } / 게스트: { share_code, nickname } → { trip, member } */
  joinTrip: (data) => request("POST", "/api/trips/join", data),
  /** 게스트: { nickname } / 회원: { nickname, user_id } → { member } */
  addMember: (tripId, data) => request("POST", `/api/trips/${tripId}/members`, data),
  getMembers: (tripId) => request("GET", `/api/trips/${tripId}/members`),
  getSummary: (tripId) => request("GET", `/api/trips/${tripId}/summary`),

  // ---------- 지출 ----------
  /**
   * expense: { payer_member_id, title, amount, currency?, exchange_rate?, krw_amount?, category?, payment_method?, spent_at? }
   * split (생략 시 전체 균등):
   *   { split_type: "equal", member_ids: [1,2,3] }
   *   { split_type: "exact", splits: [{ member_id, split_krw_amount }] }
   *   { split_type: "percentage", splits: [{ member_id, percentage_bp }] }   // bp 합계 10000
   * cardEventId: 미등록 카드 내역에서 고른 event_id (선택)
   * → { expense, splits, linked_card_event_ids }
   */
  createExpense: (tripId, expense, split = undefined, cardEventId = undefined) =>
    request("POST", `/api/trips/${tripId}/expenses`, { expense, split, card_event_id: cardEventId }),
  /** filters: { category, payer_member_id, from: "YYYY-MM-DD", to: "YYYY-MM-DD", limit, offset } → { expenses } */
  getExpenses: (tripId, filters = {}) => request("GET", `/api/trips/${tripId}/expenses${toQuery(filters)}`),
  getExpense: (tripId, expenseId) => request("GET", `/api/trips/${tripId}/expenses/${expenseId}`),
  /** expense: 바꿀 필드만, split: 분할을 바꿀 때만 → { expense, splits } */
  updateExpense: (tripId, expenseId, expense = {}, split = undefined) =>
    request("PATCH", `/api/trips/${tripId}/expenses/${expenseId}`, { expense, split }),
  deleteExpense: (tripId, expenseId) => request("DELETE", `/api/trips/${tripId}/expenses/${expenseId}`),

  // ---------- 잔액 / 정산 ----------
  getMemberBalance: (tripId, memberId) => request("GET", `/api/trips/${tripId}/members/${memberId}/summary`),
  getBalances: (tripId) => request("GET", `/api/trips/${tripId}/balances`),
  /** 지출 등록·수정·삭제 후 다시 호출하세요 → { settlements } */
  settle: (tripId) => request("POST", `/api/trips/${tripId}/settle`),
  /** status: "pending" | "completed" | undefined */
  getSettlements: (tripId, status) => request("GET", `/api/trips/${tripId}/settlements${toQuery({ status })}`),
  completeSettlement: (settlementId) => request("PATCH", `/api/settlements/${settlementId}/complete`),
  cancelSettlement: (settlementId) => request("PATCH", `/api/settlements/${settlementId}/cancel`),

  // ---------- 환전 ----------
  /** data: { member_id, currency, original_krw_amount, exchanged_amount, exchange_rate?, exchange_date?, rate_type?, memo? } */
  createExchange: (tripId, data) => request("POST", `/api/trips/${tripId}/exchanges`, data),
  getExchanges: (tripId) => request("GET", `/api/trips/${tripId}/exchanges`),

  // ---------- 카드 결제 (파싱 앱이 보낸 내역) ----------
  /** filters: { trip_id, payer_member_id, limit } → { unassigned_cards: [ { event_id, merchant, amount, ..., duplicate_event_ids } ] } */
  getUnassignedCards: (filters = {}) => request("GET", `/api/card-events/unassigned${toQuery(filters)}`),
};

export default api;
