import { getCurrencyMeta } from '../constants/currencies';

export function formatCurrency(amount, currencyCode = 'KRW') {
  const num = Number(amount);
  const safeAmount = Number.isFinite(num) ? num : 0;
  const meta = getCurrencyMeta(currencyCode);

  const formatted = safeAmount.toLocaleString('ko-KR', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });

  if (currencyCode === 'KRW') {
    return `${formatted}원`;
  }
  return `${meta.symbol}${formatted} (${meta.code})`;
}

/**
 * 지출 목록용 원래 통화 기호 포맷 (예: ¥1,500 / ₩200,000 / $12.50)
 */
export function formatOriginalCurrency(amount, currencyCode = 'KRW') {
  const num = Number(amount);
  const safeAmount = Number.isFinite(num) ? num : 0;
  const meta = getCurrencyMeta(currencyCode);

  const formatted = safeAmount.toLocaleString('ko-KR', {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });

  return `${meta.symbol}${formatted}`;
}

export function formatKrw(amount) {
  const num = Number(amount);
  const safeAmount = Number.isFinite(num) ? Math.round(num) : 0;
  return `${safeAmount.toLocaleString('ko-KR')}원`;
}

export function formatKrwSymbol(amount) {
  const num = Number(amount);
  const safeAmount = Number.isFinite(num) ? Math.round(num) : 0;
  return `₩${safeAmount.toLocaleString('ko-KR')}`;
}

export function formatExchangeRate(rate) {
  const num = Number(rate);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatDateDot(dateStr) {
  if (!dateStr) return '-';
  return dateStr.replaceAll('-', '.');
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return '일정 미정';
  return `${formatDateDot(startDate)} ~ ${formatDateDot(endDate)}`;
}

export function formatDateGroupHeader(dateStr) {
  if (!dateStr) return '날짜 미지정';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const dateObj = new Date(year, month - 1, day);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[dateObj.getDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

export function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
