import { API_ENDPOINTS, ApiError, apiRequest, isMockMode, simulateMockDelay } from './apiClient';
import { mockStore } from './mockData';

// Mock 모드에서는 비밀번호가 아닌 최소 프로필만 sessionStorage에 보관합니다.
// (실제 API 모드에서는 이 키를 사용하지 않으며 /api/auth/me 서버 검증만 신뢰합니다.)
const MOCK_SESSION_KEY = 'ntrip_mock_session_profile';

function readMockSession() {
  try {
    const raw = sessionStorage.getItem(MOCK_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMockSession(userProfile) {
  try {
    if (!userProfile) {
      sessionStorage.removeItem(MOCK_SESSION_KEY);
    } else {
      sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(userProfile));
    }
  } catch {
    // sessionStorage 접근 불가 환경 무시
  }
}

function toSafeUserProfile(user) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    isMockUser: true,
  };
}

function fromAccount(user) {
  return {id: user.id == null ? null : String(user.id), username: user.login_id,
    nickname: user.nickname, isGuest: Boolean(user.is_guest)};
}

export const authService = {
  async signup({ nickname, username, password }) {
    if (!isMockMode()) {
      const {data} = await apiRequest(API_ENDPOINTS.auth.signup, {
        method: 'POST',
        body: { nickname, login_id: username, password },
      });
      return {user: fromAccount(data)};
    }

    await simulateMockDelay(420);
    const trimmedUsername = username.trim().toLowerCase();
    const exists = mockStore.users.some(
      (u) => u.username.toLowerCase() === trimmedUsername
    );

    if (exists) {
      throw new ApiError(
        '이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.',
        409,
        'DUPLICATE_USERNAME'
      );
    }

    const newUser = {
      id: `user-mock-${Date.now()}`,
      username: username.trim(),
      nickname: nickname.trim(),
      _secret: password,
    };

    mockStore.users.push(newUser);

    return {
      user: toSafeUserProfile(newUser),
      message: '회원가입이 완료되었어요. 로그인해 주세요.',
      isMockMode: true,
    };
  },

  async login({ username, password }) {
    if (!isMockMode()) {
      const {data} = await apiRequest(API_ENDPOINTS.auth.login, {
        method: 'POST',
        body: { login_id: username, password },
      });
      return {user: fromAccount(data.user)};
    }

    await simulateMockDelay(400);
    const matched = mockStore.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matched || matched._secret !== password) {
      throw new ApiError(
        '아이디 또는 비밀번호가 올바르지 않아요. 입력 정보를 다시 확인해 주세요.',
        401,
        'INVALID_CREDENTIALS'
      );
    }

    const safeProfile = toSafeUserProfile(matched);
    writeMockSession(safeProfile);

    return {
      user: safeProfile,
      isMockMode: true,
    };
  },

  async getCurrentUser() {
    if (!isMockMode()) {
      try {
        const data = await apiRequest(API_ENDPOINTS.auth.me, { method: 'GET' });
        return fromAccount(data.data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    }

    await simulateMockDelay(150);
    return readMockSession();
  },

  async logout() {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.auth.logout, { method: 'POST' });
    }

    await simulateMockDelay(180);
    writeMockSession(null);
    return { success: true, isMockMode: true };
  },
};
