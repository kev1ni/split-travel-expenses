import { getTodayIsoDate } from './formatters';

/**
 * 여행 일정 기준 상태 판별: 'ONGOING'(진행 중) | 'UPCOMING'(예정) | 'COMPLETED'(종료)
 */
export function getTripPhase(trip, todayIso = getTodayIsoDate()) {
  if (!trip) return 'UPCOMING';
  const start = trip.startDate || '';
  const end = trip.endDate || start;

  if (start && end && start <= todayIso && todayIso <= end) {
    return 'ONGOING';
  }
  if (start && todayIso < start) {
    return 'UPCOMING';
  }
  return 'COMPLETED';
}

export function getTripPhaseMeta(phase) {
  switch (phase) {
    case 'ONGOING':
      return { label: '진행 중', tone: 'green' };
    case 'UPCOMING':
      return { label: '예정', tone: 'blue' };
    case 'COMPLETED':
    default:
      return { label: '종료', tone: 'neutral' };
  }
}

/**
 * 대표 여행 자동 선택:
 * 1순위: 진행 중인 여행 (종료일이 가장 가까운 순)
 * 2순위: 가장 가까운 예정 여행 (시작일이 가장 빠른 순)
 * 3순위: 가장 최근 종료된 여행 (종료일이 가장 늦은 순)
 */
export function pickDefaultFeaturedTrip(trips = [], todayIso = getTodayIsoDate()) {
  if (!Array.isArray(trips) || trips.length === 0) return null;

  const ongoing = trips
    .filter((t) => getTripPhase(t, todayIso) === 'ONGOING')
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));
  if (ongoing.length > 0) return ongoing[0];

  const upcoming = trips
    .filter((t) => getTripPhase(t, todayIso) === 'UPCOMING')
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  if (upcoming.length > 0) return upcoming[0];

  const completed = [...trips].sort((a, b) =>
    (b.endDate || '').localeCompare(a.endDate || '')
  );
  return completed[0];
}

/**
 * 백엔드 정산 목록 기반 송금/수취 집계
 */
export function summarizeSettlements(settlements = []) {
  const pending = settlements.filter((s) => s.status !== 'COMPLETED');
  const completed = settlements.filter((s) => s.status === 'COMPLETED');

  const pendingSend = pending
    .filter((s) => s.direction === 'SEND')
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const pendingReceive = pending
    .filter((s) => s.direction === 'RECEIVE')
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  return {
    pending,
    completed,
    pendingSend,
    pendingReceive,
    netPending: pendingReceive - pendingSend,
  };
}

/**
 * 기존 지출 데이터를 기반으로 최근 활동(최대 limit건)을 생성합니다.
 * 별도 활동 API가 없는 경우 존재하지 않는 이벤트를 임의로 만들지 않습니다.
 */
export function buildRecentActivitiesFromExpenses(expenses = [], limit = 3) {
  if (!Array.isArray(expenses) || expenses.length === 0) return [];

  return [...expenses]
    .sort((a, b) =>
      `${b.expenseDate || ''} ${b.expenseTime || ''}`.localeCompare(
        `${a.expenseDate || ''} ${a.expenseTime || ''}`
      )
    )
    .slice(0, limit)
    .map((exp) => ({
      id: `activity-exp-${exp.id}`,
      type: exp.eventType === 'CANCELLED' ? 'EXPENSE_CANCELLED' : 'EXPENSE_CREATED',
      tripId: exp.tripId,
      tripTitle: exp.tripTitle || '',
      title: exp.title || exp.merchantName,
      actorName: exp.payerName || '멤버',
      amount: exp.amount,
      currency: exp.currency || 'KRW',
      amountKrw: exp.amountKrw,
      krwAmountType: exp.krwAmountType,
      category: exp.category,
      paymentMethod: exp.paymentMethod,
      eventType: exp.eventType,
      date: exp.expenseDate,
      time: exp.expenseTime || '',
    }));
}
