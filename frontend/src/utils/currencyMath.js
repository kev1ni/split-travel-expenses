/**
 * JavaScript 부동소수점 오차(예: 0.1 + 0.2, 3000 * 9.5 등)를 방지하기 위한
 * 10진 정수 스케일 기반 금액 변환 유틸리티입니다.
 *
 * 최종 정산 금액 및 환율 확정은 백엔드 서버의 계산 결과를 기준으로 합니다.
 */

function parseDecimalToScaledInt(value) {
  if (value === null || value === undefined || value === '') {
    return { scaled: 0n, scale: 0 };
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { scaled: 0n, scale: 0 };
  }

  // 지수 표기법 방지 및 불필요한 공백 제거
  const normalized = num.toFixed(8).replace(/\.?0+$/, '');
  const isNegative = normalized.startsWith('-');
  const unsigned = isNegative ? normalized.slice(1) : normalized;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const digits = `${intPart}${fracPart}` || '0';
  const scaled = BigInt(digits) * (isNegative ? -1n : 1n);

  return { scaled, scale: fracPart.length };
}

/**
 * 외화 금액 * 환율 → 원화(KRW) 정수 반올림 변환 (부동소수점 오차 방지)
 */
export function convertToKrwExact(amount, exchangeRate = 1) {
  const numericAmount = Number(amount);
  const numericRate = Number(exchangeRate);
  if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate)) {
    return 0;
  }
  if (numericAmount === 0 || numericRate === 0) {
    return 0;
  }

  const a = parseDecimalToScaledInt(numericAmount);
  const r = parseDecimalToScaledInt(numericRate);

  const product = a.scaled * r.scaled;
  const totalScale = a.scale + r.scale;

  if (totalScale === 0) {
    return Number(product);
  }

  const divisor = 10n ** BigInt(totalScale);
  const half = divisor / 2n;
  const isNeg = product < 0n;
  const absProduct = isNeg ? -product : product;
  const rounded = (absProduct + half) / divisor;

  return Number(isNeg ? -rounded : rounded);
}

/**
 * KRW 정수 배열 합산 (부동소수점 누적 오차 방지)
 */
export function sumKrwIntegers(values = []) {
  return values.reduce((acc, value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return acc;
    return acc + Math.round(num);
  }, 0);
}
