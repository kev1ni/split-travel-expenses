import { API_ENDPOINTS, ApiError, apiRequest, isMockMode, simulateMockDelay } from './apiClient';
import { sumKrwIntegers } from '../utils/currencyMath';
import { mockStore } from './mockData';

function computeTripSummary(trip) {
  const activeExpenses = (trip.expenses || []).filter((e) => e.eventType !== 'CANCELLED');
  const totalAmountKrw = sumKrwIntegers(
    activeExpenses.map((item) => item.amountKrw ?? item.amount ?? 0)
  );
  const settlements = structuredClone(trip.settlements || []);
  const pendingSend = sumKrwIntegers(
    settlements
      .filter((s) => s.status !== 'COMPLETED' && s.direction === 'SEND')
      .map((s) => s.amount || 0)
  );
  const pendingReceive = sumKrwIntegers(
    settlements
      .filter((s) => s.status !== 'COMPLETED' && s.direction === 'RECEIVE')
      .map((s) => s.amount || 0)
  );

  return {
    id: trip.id,
    title: trip.title,
    countryCode: trip.countryCode || 'KR',
    countryName: trip.countryName || '',
    location: trip.location,
    startDate: trip.startDate,
    endDate: trip.endDate,
    baseCurrency: trip.baseCurrency || 'KRW',
    description: trip.description || '',
    memberCount: trip.members?.length || 0,
    members: structuredClone(trip.members || []),
    expenseCount: (trip.expenses || []).length,
    totalAmountKrw,
    settlementStatus: trip.settlementStatus,
    settlementStatusLabel: trip.settlementStatusLabel,
    myPendingSendKrw: pendingSend,
    myPendingReceiveKrw: pendingReceive,
    myNetSettlementKrw: pendingReceive - pendingSend,
    memberSettlementSummary: structuredClone(trip.memberSettlementSummary || []),
    settlements,
    inviteCode: trip.inviteCode,
    isMockData: Boolean(trip.isMockData),
  };
}

function findTripById(tripId) {
  return (
    mockStore.trips.find((t) => t.id === tripId) ||
    mockStore.externalInviteTrips.find((t) => t.id === tripId) ||
    null
  );
}

export const tripService = {
  async getDashboard(currentUser) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.dashboard, { method: 'GET' });
    }

    await simulateMockDelay(260);

    // 신규 가입한 Mock 계정의 경우에도 데모 체험용 샘플 여행이 보임을 명확히 표시하거나,
    // demo 계정은 샘플 여행을, 신규 계정은 빈 상태와 샘플 데이터 토글이 가능하도록 제공
    const trips = mockStore.trips.map(computeTripSummary);
    const allExpenses = mockStore.trips
      .flatMap((trip) =>
        (trip.expenses || []).map((expense) => ({
          ...expense,
          tripTitle: trip.title,
        }))
      )
      .sort((a, b) => `${b.expenseDate} ${b.expenseTime || ''}`.localeCompare(`${a.expenseDate} ${a.expenseTime || ''}`));

    const allSettlements = mockStore.trips.flatMap((trip) =>
      (trip.settlements || []).map((s) => ({
        ...s,
        tripId: trip.id,
        tripTitle: trip.title,
      }))
    );

    const totalExpenseKrw = trips.reduce((acc, t) => acc + t.totalAmountKrw, 0);
    const pendingSettlementKrw = allSettlements
      .filter((s) => s.status === 'PENDING' && s.direction === 'SEND')
      .reduce((acc, s) => acc + Number(s.amount || 0), 0);

    return {
      isMockData: true,
      userNickname: currentUser?.nickname || '여행자',
      summary: {
        activeTripCount: trips.length,
        totalExpenseKrw,
        pendingSettlementKrw,
      },
      trips,
      recentExpenses: allExpenses.slice(0, 5),
      settlements: allSettlements,
    };
  },

  async getTrips() {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.list, { method: 'GET' });
    }

    await simulateMockDelay(220);
    return {
      isMockData: true,
      trips: mockStore.trips.map(computeTripSummary),
    };
  },

  async getTripDetail(tripId) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.detail(tripId), { method: 'GET' });
    }

    await simulateMockDelay(240);
    const trip = findTripById(tripId);
    if (!trip) {
      throw new ApiError('해당 여행 정보를 찾을 수 없어요.', 404, 'TRIP_NOT_FOUND');
    }

    const activeExpenses = (trip.expenses || []).filter((e) => e.eventType !== 'CANCELLED');
    const totalAmountKrw = sumKrwIntegers(
      activeExpenses.map((item) => item.amountKrw ?? item.amount ?? 0)
    );

    return {
      ...structuredClone(trip),
      totalAmountKrw,
      isMockData: true,
    };
  },

  async getTripMembers(tripId) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.members(tripId), { method: 'GET' });
    }

    await simulateMockDelay(180);
    const trip = findTripById(tripId);
    if (!trip) {
      throw new ApiError('여행 멤버 정보를 불러올 수 없어요.', 404, 'TRIP_NOT_FOUND');
    }
    return {
      isMockData: true,
      members: structuredClone(trip.members),
    };
  },

  /**
   * 비회원 친구 임시 추가 (memberType: 'GUEST'로 계정 멤버와 명확히 구분)
   */
  async addGuestMember(tripId, { name }) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.guestMembers(tripId), {
        method: 'POST',
        body: { name, memberType: 'GUEST' },
      });
    }

    await simulateMockDelay(260);
    const trip = findTripById(tripId);
    if (!trip) {
      throw new ApiError('여행을 찾을 수 없어요.', 404, 'TRIP_NOT_FOUND');
    }

    const trimmed = name.trim();
    if (!trimmed) {
      throw new ApiError('비회원 친구의 이름을 입력해 주세요.', 400, 'VALIDATION_ERROR');
    }

    const newGuest = {
      id: `mem-guest-${Date.now()}`,
      userId: null,
      name: trimmed,
      role: 'MEMBER',
      memberType: 'GUEST',
      isMockData: true,
    };

    trip.members.push(newGuest);
    return {
      member: newGuest,
      members: structuredClone(trip.members),
      isMockData: true,
    };
  },

  /**
   * 초대 코드 발급/조회 요청
   * 초대 코드는 반드시 백엔드에서 생성 및 검증하며, 프론트엔드 UI에서 임의로 생성하지 않습니다.
   */
  async createInvitation(tripId) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.invitations(tripId), {
        method: 'POST',
      });
    }

    await simulateMockDelay(260);
    const trip = findTripById(tripId);
    if (!trip) {
      throw new ApiError('초대 정보를 생성할 여행을 찾을 수 없어요.', 404, 'TRIP_NOT_FOUND');
    }

    return {
      tripId: trip.id,
      tripTitle: trip.title,
      inviteCode: trip.inviteCode,
      expiresAt: '2026-12-31T23:59:59+09:00',
      isMockData: true,
    };
  },

  /**
   * 초대 코드로 여행 정보 미리보기 조회
   */
  async getInvitationPreview(inviteCode, currentUser) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.invitations.preview(inviteCode), {
        method: 'GET',
      });
    }

    await simulateMockDelay(240);
    const normalized = String(inviteCode || '').trim().toUpperCase();
    const allTrips = [...mockStore.trips, ...mockStore.externalInviteTrips];
    const matched = allTrips.find(
      (t) => String(t.inviteCode).toUpperCase() === normalized
    );

    if (!matched) {
      throw new ApiError(
        '유효하지 않거나 만료된 초대 코드예요. 친구에게 새 초대 링크를 요청해 주세요.',
        404,
        'INVALID_INVITE_CODE'
      );
    }

    const alreadyJoined = Boolean(
      currentUser &&
        matched.members.some(
          (m) => m.memberType === 'ACCOUNT' && m.userId === currentUser.id
        )
    );

    return {
      tripId: matched.id,
      title: matched.title,
      location: matched.location,
      startDate: matched.startDate,
      endDate: matched.endDate,
      memberCount: matched.members.length,
      inviteCode: matched.inviteCode,
      alreadyJoined,
      isMockData: true,
    };
  },

  /**
   * 초대 수락하여 여행 참여
   */
  async acceptInvitation(inviteCode, currentUser) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.invitations.accept(inviteCode), {
        method: 'POST',
      });
    }

    await simulateMockDelay(320);
    const normalized = String(inviteCode || '').trim().toUpperCase();
    const existingTrip = mockStore.trips.find(
      (t) => String(t.inviteCode).toUpperCase() === normalized
    );

    if (existingTrip) {
      const alreadyJoined = existingTrip.members.some(
        (m) => m.memberType === 'ACCOUNT' && m.userId === currentUser?.id
      );
      if (alreadyJoined) {
        throw new ApiError('이미 참여 중인 여행이에요.', 409, 'ALREADY_JOINED', {
          tripId: existingTrip.id,
        });
      }
      existingTrip.members.push({
        id: `mem-${Date.now()}`,
        userId: currentUser?.id || 'user-demo-1',
        name: currentUser?.nickname || '여행자',
        role: 'MEMBER',
        memberType: 'ACCOUNT',
      });
      return {
        tripId: existingTrip.id,
        title: existingTrip.title,
        isMockData: true,
      };
    }

    const externalIndex = mockStore.externalInviteTrips.findIndex(
      (t) => String(t.inviteCode).toUpperCase() === normalized
    );
    if (externalIndex === -1) {
      throw new ApiError('유효하지 않은 초대 코드예요.', 404, 'INVALID_INVITE_CODE');
    }

    const targetTrip = mockStore.externalInviteTrips.splice(externalIndex, 1)[0];
    targetTrip.members.push({
      id: `mem-${Date.now()}`,
      userId: currentUser?.id || 'user-demo-1',
      name: currentUser?.nickname || '여행자',
      role: 'MEMBER',
      memberType: 'ACCOUNT',
    });
    mockStore.trips.unshift(targetTrip);

    return {
      tripId: targetTrip.id,
      title: targetTrip.title,
      isMockData: true,
    };
  },

  /**
   * 새 여행 생성 요청 (백엔드 API 준비 후 실제 저장 연동)
   */
  async createTrip(payload) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.list, {
        method: 'POST',
        body: payload,
      });
    }

    await simulateMockDelay(250);
    throw new ApiError(
      '새 여행 저장 기능은 백엔드 API(POST /api/trips)가 준비된 후 연동될 예정이에요.',
      501,
      'BACKEND_NOT_READY'
    );
  },
};
