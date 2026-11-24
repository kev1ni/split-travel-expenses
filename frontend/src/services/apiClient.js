/**
 * 백엔드 API 연동 설정 및 공통 HTTP 클라이언트
 *
 * - VITE_API_MODE=mock : 백엔드 API 준비 전 프론트엔드 개발/검증용 Mock 모드
 * - VITE_API_MODE=api  : Python Flask 백엔드 REST API 실제 연동 모드 (HttpOnly 쿠키 세션 지원)
 */

export const API_MODE = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'api';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const SESSION_CHECK_EVENT = 'ntrip:check-session';

export function isMockMode() {
  return API_MODE === 'mock';
}

const trips = '/api/v1/trips';
export const API_ENDPOINTS = {
  auth: {
    signup: '/api/v1/auth/signup', login: '/api/v1/auth/login',
    me: '/api/v1/auth/me', logout: '/api/v1/auth/logout',
  },
  trips: {
    list: trips, detail: (id) => `${trips}/${id}`,
    members: (id) => `${trips}/${id}/members`,
    guestMembers: (id) => `${trips}/${id}/members/guests`,
    invitations: (id) => `${trips}/${id}/invitations`,
    expenses: (id) => `${trips}/${id}/expenses`,
  },
  invitations: {
    preview: (code) => `/api/v1/invitations/${encodeURIComponent(code)}`,
    accept: '/api/v1/invitations/accept',
  },
  exchangeRates: '/api/v1/exchange-rates',
};

export class ApiError extends Error {
  constructor(message, status = 500, code = 'API_ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Flask HttpOnly 쿠키 기반 세션 인증을 전제로 credentials: 'include'를 기본 적용합니다.
 */
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, headers = {}, signal } = options;
  const url = `${API_BASE_URL}${path}`;

  const fetchOptions = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    signal,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch {
    throw new ApiError(
      '서버와 연결할 수 없어요. 네트워크 상태나 백엔드 서버 실행 여부를 확인해 주세요.',
      0,
      'NETWORK_ERROR'
    );
  }

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    // A rejected login or collector password doesn't end the browser session.
    if (response.status === 401 && method === 'GET' &&
        /^\/api\/(?:v1\/trips|card-events\/unassigned)(?:[/?]|$)/.test(path)) {
      window.dispatchEvent(new Event(SESSION_CHECK_EVENT));
    }
    const message =
      data?.message ||
      data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : '') ||
      (response.status === 401
        ? '로그인이 필요하거나 세션이 만료되었어요.'
        : response.status === 403
          ? '접근 권한이 없어요.'
          : response.status === 404
            ? '요청한 정보를 찾을 수 없어요.'
            : '요청을 처리하는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.');

    throw new ApiError(message, response.status, data?.error?.code || data?.code || 'HTTP_ERROR', data?.error?.details || data);
  }

  if (response.status !== 204 && data === null) {
    throw new ApiError('API 응답을 읽을 수 없어요. 서버 주소를 확인해 주세요.', response.status, 'INVALID_RESPONSE');
  }
  return data;
}

export function simulateMockDelay(ms = 320) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
