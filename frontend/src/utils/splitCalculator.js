import { getCurrencyMeta } from '../constants/currencies';

/**
 * 금액을 통화별 최소 단위(정수)로 변환합니다.
 * 예: KRW/JPY -> 1원/1엔 단위, USD/EUR -> 1센트(0.01) 단위
 */
export function toMinorUnits(amount, currencyCode = 'KRW') {
  const { decimals } = getCurrencyMeta(currencyCode);
  const factor = 10 ** decimals;
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * factor);
}

export function fromMinorUnits(minorUnits, currencyCode = 'KRW') {
  const { decimals } = getCurrencyMeta(currencyCode);
  const factor = 10 ** decimals;
  return Number((minorUnits / factor).toFixed(decimals));
}

/**
 * 균등 분할 계산 (미리보기용)
 * - 나누어떨어지지 않는 최소 단위 잔액은 선택된 참여자 목록의 앞 순서부터 1 최소 단위씩 배분합니다.
 * - 실제 저장 시에는 백엔드에서 최종 분담 금액을 검증 및 확정합니다.
 */
export function calculateEqualSplit(totalAmount, participantIds, currencyCode = 'KRW') {
  if (!participantIds || participantIds.length === 0) {
    return {
      shares: {},
      remainderMinorUnits: 0,
      remainderReceivers: [],
    };
  }

  const totalMinor = Math.max(0, toMinorUnits(totalAmount, currencyCode));
  const count = participantIds.length;
  const baseMinor = Math.floor(totalMinor / count);
  const remainderMinor = totalMinor - baseMinor * count;

  const shares = {};
  const remainderReceivers = [];

  participantIds.forEach((memberId, index) => {
    const extra = index < remainderMinor ? 1 : 0;
    if (extra > 0) {
      remainderReceivers.push(memberId);
    }
    shares[memberId] = fromMinorUnits(baseMinor + extra, currencyCode);
  });

  return {
    shares,
    remainderMinorUnits: remainderMinor,
    remainderReceivers,
  };
}

/**
 * 직접 금액 입력 합계 검증
 */
export function validateCustomSplits(totalAmount, participantIds, customShares, currencyCode = 'KRW') {
  const totalMinor = toMinorUnits(totalAmount, currencyCode);
  let sumMinor = 0;

  for (const memberId of participantIds) {
    const value = customShares[memberId];
    const parsed = Number(value);
    if (value === '' || value === undefined || !Number.isFinite(parsed) || parsed < 0) {
      return {
        isValid: false,
        sumAmount: fromMinorUnits(sumMinor, currencyCode),
        diffAmount: fromMinorUnits(totalMinor - sumMinor, currencyCode),
        error: '모든 참여자의 분담 금액을 0 이상으로 입력해 주세요.',
      };
    }
    sumMinor += toMinorUnits(parsed, currencyCode);
  }

  const diffMinor = totalMinor - sumMinor;
  return {
    isValid: diffMinor === 0 && totalMinor > 0,
    sumAmount: fromMinorUnits(sumMinor, currencyCode),
    diffAmount: fromMinorUnits(diffMinor, currencyCode),
    error:
      diffMinor === 0
        ? ''
        : diffMinor > 0
          ? `분담 금액 합계가 총지출보다 ${fromMinorUnits(diffMinor, currencyCode)} 부족해요.`
          : `분담 금액 합계가 총지출보다 ${fromMinorUnits(Math.abs(diffMinor), currencyCode)} 초과했어요.`,
  };
}
