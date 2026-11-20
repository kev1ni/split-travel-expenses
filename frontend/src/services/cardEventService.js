import { API_BASE_URL, ApiError, apiRequest, isMockMode, simulateMockDelay } from './apiClient';
import { mockStore } from './mockData';

/**
 * 카드 결제 메시지 파싱 서비스
 *
 * 중요:
 * - 실제 메시지 파싱 알고리즘 및 CARD_EVENTS 중복 판단은 백엔드 팀원이 구현합니다.
 * - 프론트엔드에서는 파싱 알고리즘을 직접 구현하지 않으며,
 *   Mock 모드에서는 UI 흐름 검증을 위한 사전 정의된 응답만 반환합니다.
 */
export const cardEventService = {
  async getPending(tripId, signal) {
    const query = new URLSearchParams({ trip_id: tripId, scoped: 'true', limit: '100' });
    const result = await apiRequest(`/api/card-events/unassigned?${query}`, { signal });
    return result.unassigned_cards;
  },

  async pair(tripId, payerId, username, password) {
    const result = await apiRequest('/api/collector/pair', {
      method: 'POST',
      body: { trip_id: tripId, payer_member_id: payerId, login_id: username, password },
    });
    const base = import.meta.env.VITE_COLLECTOR_PUBLIC_ORIGIN || API_BASE_URL || window.location.origin;
    const endpoint = new URL(result.endpoint, new URL(base, window.location.origin));
    const isLoopback = /^(localhost\.?|127\.[\d.]+|0\.0\.0\.0|\[::1\])$/i.test(endpoint.hostname);
    return {
      token: result.token,
      url: endpoint.protocol === 'https:' && !isLoopback ? endpoint.href : null,
      path: result.endpoint,
    };
  },

  confirm(tripId, body) {
    return apiRequest(`/api/v1/trips/${encodeURIComponent(tripId)}/card-events`, { method: 'POST', body });
  },

  async parseCardMessage({ tripId, rawMessage, mockScenario = 'AUTO' }) {
    if (!rawMessage || !rawMessage.trim()) {
      throw new ApiError('분석할 카드 결제 메시지를 입력해 주세요.', 400, 'EMPTY_MESSAGE');
    }

    if (!isMockMode()) {
      const result = await apiRequest('/api/v1/card-events/parse', {
        method: 'POST', body: { message: rawMessage },
      });
      return result.data;
    }

    await simulateMockDelay(750);

    const trip = mockStore.trips.find((t) => t.id === tripId);
    const trimmed = rawMessage.trim();

    let scenario = mockScenario;
    if (scenario === 'AUTO') {
      if (trimmed.includes('이벤트 당첨') || trimmed.length < 8) {
        scenario = 'PARSE_FAILED';
      } else if (trimmed.includes('돈키호테 도톤보리')) {
        scenario = 'DUPLICATE';
      } else if (trimmed.includes('부분취소')) {
        scenario = 'PARTIAL_CANCELLED';
      } else if (trimmed.includes('취소')) {
        scenario = 'CANCELLED';
      } else if (trimmed.includes('USD') || trimmed.includes('청구금액')) {
        scenario = 'FOREIGN_CONFIRMED';
      } else if (trimmed.includes('JPY') || trimmed.includes('해외승인')) {
        scenario = 'FOREIGN_ESTIMATED';
      } else {
        scenario = 'NEW';
      }
    }

    if (scenario === 'PARSE_FAILED') {
      return {
        status: 'PARSE_FAILED',
        isMockResult: true,
        rawMessage: trimmed,
        message:
          '카드 결제 형식을 인식하지 못했어요. 승인 금액과 가맹점 정보가 포함된 알림 메시지인지 확인하거나 현금 직접 입력을 이용해 주세요.',
        parsed: null,
      };
    }

    if (scenario === 'DUPLICATE') {
      const existingExpense =
        trip?.expenses?.find((e) => e.id === 'exp-105') || trip?.expenses?.[0] || null;

      return {
        status: 'DUPLICATE',
        isMockResult: true,
        rawMessage: trimmed,
        message:
          '동일 결제가 이미 등록되어 있어요. RCS 문자와 앱 푸시가 중복 수신되어도 새 지출을 만들지 않아요.',
        existingExpense,
        parsed: existingExpense
          ? {
              cardEventId: 'mock-ce-dup-105',
              amount: existingExpense.amount,
              currency: existingExpense.currency,
              billedKrwAmount: existingExpense.billedKrwAmount || existingExpense.amountKrw,
              merchantName: existingExpense.merchantName || existingExpense.title,
              expenseDate: existingExpense.expenseDate,
              expenseTime: existingExpense.expenseTime || '21:15',
              eventType: 'PURCHASE',
              rawMessage: trimmed,
            }
          : null,
      };
    }

    if (scenario === 'FOREIGN_ESTIMATED') {
      return {
        status: 'NEW',
        isMockResult: true,
        rawMessage: trimmed,
        message:
          '해외 결제(JPY) 내역이 분석되었어요. 카드사 원화 청구 금액이 포함되지 않아 예상 환산 금액으로 표시됩니다.',
        parsed: {
          cardEventId: `mock-ce-jpy-${Date.now()}`,
          amount: 3000,
          currency: 'JPY',
          billedKrwAmount: null,
          exchangeRate: 9.5,
          exchangeRateDate: '2026-12-10',
          estimatedKrwAmount: 28500,
          isMockRate: true,
          merchantName: '이치란 라멘 난바점',
          expenseDate: '2026-12-10',
          expenseTime: '19:30',
          eventType: 'PURCHASE',
          suggestedCategory: 'FOOD',
          rawMessage: trimmed,
        },
      };
    }

    if (scenario === 'FOREIGN_CONFIRMED') {
      return {
        status: 'NEW',
        isMockResult: true,
        rawMessage: trimmed,
        message:
          '해외 결제(USD) 내역과 카드사 원화 청구 금액이 함께 확인되었어요. 실제 청구 금액을 우선 표시합니다.',
        parsed: {
          cardEventId: `mock-ce-usd-${Date.now()}`,
          amount: 45,
          currency: 'USD',
          billedKrwAmount: 62100,
          exchangeRate: 1380,
          exchangeRateDate: '2026-12-11',
          estimatedKrwAmount: 62100,
          isMockRate: false,
          merchantName: '블루보틀 교토',
          expenseDate: '2026-12-11',
          expenseTime: '10:15',
          eventType: 'PURCHASE',
          suggestedCategory: 'FOOD',
          rawMessage: trimmed,
        },
      };
    }

    if (scenario === 'CANCELLED') {
      return {
        status: 'CANCELLED',
        isMockResult: true,
        rawMessage: trimmed,
        message: '결제 취소 메시지로 감지되었어요. 일반 구매 내역과 구분되어 취소 내역으로 기록됩니다.',
        parsed: {
          cardEventId: `mock-ce-cancel-${Date.now()}`,
          amount: 18500,
          currency: 'KRW',
          billedKrwAmount: null,
          merchantName: '스타벅스 난바점',
          expenseDate: '2026-12-11',
          expenseTime: '14:10',
          eventType: 'CANCELLED',
          suggestedCategory: 'FOOD',
          rawMessage: trimmed,
        },
      };
    }

    if (scenario === 'PARTIAL_CANCELLED') {
      const members = trip?.members || [];
      const remainingAmount = 220000;
      const perPerson =
        members.length > 0 ? Math.floor(remainingAmount / members.length) : remainingAmount;

      return {
        status: 'PARTIAL_CANCELLED',
        isMockResult: true,
        rawMessage: trimmed,
        message:
          '부분 취소 메시지로 감지되었어요. 아래 최종 분담 금액을 확인해 주세요.',
        parsed: {
          cardEventId: `mock-ce-partial-${Date.now()}`,
          amount: remainingAmount,
          originalAmount: 260000,
          cancelledAmount: 40000,
          currency: 'KRW',
          billedKrwAmount: null,
          merchantName: 'USJ 공식 티켓',
          expenseDate: '2026-12-11',
          expenseTime: '09:40',
          eventType: 'PARTIAL_CANCELLED',
          suggestedCategory: 'SIGHTSEEING',
          rawMessage: trimmed,
          backendAdjustedSplits: members.map((m) => ({
            memberId: m.id,
            memberName: m.name,
            amount: perPerson,
          })),
        },
      };
    }

    return {
      status: 'NEW',
      isMockResult: true,
      rawMessage: trimmed,
      message: '신규 카드 결제 내역이 분석되었어요. 내용을 확인하고 필요하면 수정한 뒤 등록해 주세요.',
      parsed: {
        cardEventId: `mock-ce-new-${Date.now()}`,
        amount: 25000,
        currency: 'KRW',
        billedKrwAmount: null,
        merchantName: 'OO식당',
        expenseDate: '2026-11-19',
        expenseTime: '12:30',
        eventType: 'PURCHASE',
        suggestedCategory: 'FOOD',
        rawMessage: trimmed,
      },
    };
  },
};
