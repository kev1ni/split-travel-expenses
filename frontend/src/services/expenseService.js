import { expenseView } from './dbViews';
import { toMinorUnits } from '../utils/splitCalculator';
import { API_ENDPOINTS, ApiError, apiRequest, isMockMode, simulateMockDelay } from './apiClient';
import { getCurrencyMeta } from '../constants/currencies';
import { convertToKrwExact } from '../utils/currencyMath';
import { mockStore } from './mockData';

function splitPayload(payload, totalKrw) {
  if (payload.splitType !== 'CUSTOM') {
    return payload.splits.map(s => ({member_id: Number(s.memberId)}));
  }
  // Convert the exact original-currency shares proportionally, distributing only rounding won.
  const shares = payload.splits.map(s => BigInt(toMinorUnits(s.amount, payload.currency)));
  const total = shares.reduce((a, b) => a + b, 0n);
  if (total <= 0n) throw new ApiError('직접 분할 금액을 확인해 주세요.', 400);
  const won = BigInt(totalKrw);
  const amounts = shares.map(n => Number(n * won / total));
  const order = shares.map((n, i) => ({i, rem: n * won % total}))
    .sort((a, b) => a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1);
  const remainder = totalKrw - amounts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) amounts[order[i].i]++;
  return payload.splits.map((s, i) => ({member_id: Number(s.memberId), krw_amount: amounts[i]}));
}

export const expenseService = {
  async getRecentTripExpenses(tripId) {
    if (isMockMode()) return this.getTripExpenses(tripId);
    const result = await apiRequest(`${API_ENDPOINTS.trips.expenses(tripId)}?page=1&page_size=3`);
    return {expenses: result.data.map(expenseView)};
  },

  async getTripExpenses(tripId) {
    if (!isMockMode()) {
      const expenses = [];
      let page = 1;
      let total;
      do {
        const result = await apiRequest(`${API_ENDPOINTS.trips.expenses(tripId)}?page=${page++}&page_size=100`);
        expenses.push(...result.data.map(expenseView));
        total = result.pagination?.total ?? expenses.length;
        if (!result.data.length) break;
      } while (expenses.length < total);
      return {expenses};
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
      const total = payload.billedKrwAmount ?? payload.amountKrw ?? convertToKrwExact(payload.amount, payload.exchangeRate);
      const timestamp = new Date(`${payload.expenseDate}T${payload.expenseTime || '12:00'}`);
      const {data} = await apiRequest(API_ENDPOINTS.trips.expenses(tripId), {
        method: 'POST',
        body: {title: payload.title, category: payload.category, payment_method: payload.paymentMethod.toLowerCase(),
          entry_type: payload.cardEventId ? 'auto_card' : 'manual', payer_member_id: Number(payload.payerMemberId),
          amount: payload.amount, currency: payload.currency, exchange_rate: payload.exchangeRate,
          rate_date: payload.exchangeRateDate, krw_amount: total, occurred_at: timestamp.toISOString(),
          split_type: payload.splitType === 'CUSTOM' ? 'exact' : 'equal', splits: splitPayload(payload, total),
          ...(payload.cardEventId && {card_event_id: payload.cardEventId})},
      });
      return {expense: expenseView(data)};
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
