import { API_ENDPOINTS, ApiError, apiRequest, isMockMode, simulateMockDelay } from './apiClient';
import { getCurrencyMeta } from '../constants/currencies';
import { convertToKrwExact } from '../utils/currencyMath';
import { mockStore } from './mockData';

export const expenseService = {
  async getTripExpenses(tripId) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.expenses(tripId), { method: 'GET' });
    }

    await simulateMockDelay(200);
    const trip = mockStore.trips.find((t) => t.id === tripId);
    if (!trip) {
      throw new ApiError('여행 지출 내역을 찾을 수 없어요.', 404, 'TRIP_NOT_FOUND');
    }

    return {
      isMockData: true,
      expenses: structuredClone(trip.expenses || []),
    };
  },

  /**
   * 지출 등록 (현금 직접 입력 및 카드 파싱 확인 후 등록 공통 사용)
   * 외화 지출의 경우 결제 통화, 적용 환율, 원화 환산/청구 금액 정보를 함께 전달합니다.
   * 실제 저장 및 분담 금액 최종 검증은 백엔드에서 수행합니다.
   */
  async createExpense(tripId, payload) {
    if (!isMockMode()) {
      return apiRequest(API_ENDPOINTS.trips.expenses(tripId), {
        method: 'POST',
        body: payload,
      });
    }

    await simulateMockDelay(320);
    const trip = mockStore.trips.find((t) => t.id === tripId);
    if (!trip) {
      throw new ApiError('지출을 등록할 여행을 찾을 수 없어요.', 404, 'TRIP_NOT_FOUND');
    }

    const payer = trip.members.find((m) => m.id === payload.payerMemberId);
    const currencyCode = payload.currency || 'KRW';
    const currencyMeta = getCurrencyMeta(currencyCode);
    const numericAmount = Number(payload.amount || 0);
    const effectiveRate =
      currencyCode === 'KRW'
        ? 1
        : Number(payload.exchangeRate) > 0
          ? Number(payload.exchangeRate)
          : currencyMeta.mockRateToKrw;

    const computedKrw =
      currencyCode === 'KRW'
        ? Math.round(numericAmount)
        : Number(payload.billedKrwAmount) > 0
          ? Math.round(Number(payload.billedKrwAmount))
          : Number(payload.amountKrw) > 0
            ? Math.round(Number(payload.amountKrw))
            : convertToKrwExact(numericAmount, effectiveRate);

    const splitsWithNames = (payload.splits || []).map((split) => {
      const member = trip.members.find((m) => m.id === split.memberId);
      const splitOriginal = Number(split.amount || 0);
      const splitKrw =
        currencyCode === 'KRW'
          ? Math.round(splitOriginal)
          : convertToKrwExact(splitOriginal, effectiveRate);

      return {
        memberId: split.memberId,
        memberName: member?.name || '참여자',
        amount: splitOriginal,
        amountKrw: splitKrw,
      };
    });

    const newExpense = {
      id: `exp-mock-${Date.now()}`,
      tripId,
      title: payload.title,
      merchantName: payload.merchantName || payload.title,
      amount: numericAmount,
      currency: currencyCode,
      exchangeRate: effectiveRate,
      exchangeRateDate: payload.exchangeRateDate || payload.expenseDate,
      isCustomExchangeRate: Boolean(payload.isCustomExchangeRate),
      billedKrwAmount: payload.billedKrwAmount ? Math.round(Number(payload.billedKrwAmount)) : null,
      amountKrw: computedKrw,
      krwAmountType:
        currencyCode === 'KRW'
          ? 'KRW_NATIVE'
          : payload.billedKrwAmount
            ? 'CONFIRMED_BILLING'
            : payload.isCustomExchangeRate
              ? 'CUSTOM_RATE'
              : 'ESTIMATED',
      expenseDate: payload.expenseDate,
      expenseTime: payload.expenseTime || '',
      category: payload.category || 'ETC',
      paymentMethod: payload.paymentMethod || 'CASH',
      eventType: payload.eventType || 'PURCHASE',
      originalAmount: payload.originalAmount || null,
      cancelledAmount: payload.cancelledAmount || null,
      payerMemberId: payload.payerMemberId,
      payerName: payer?.name || '결제자',
      memo: payload.memo || '',
      rawCardMessage: payload.rawCardMessage || null,
      cardEventId: payload.cardEventId || null,
      splitType: payload.splitType || 'EQUAL',
      splits: splitsWithNames,
      isMockData: true,
    };

    trip.expenses.unshift(newExpense);

    return {
      expense: newExpense,
      isMockData: true,
      message: '지출이 등록되었어요.',
    };
  },
};
