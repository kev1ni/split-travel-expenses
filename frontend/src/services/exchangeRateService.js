import { API_ENDPOINTS, apiRequest, isMockMode, simulateMockDelay } from './apiClient';
import { getCurrencyMeta } from '../constants/currencies';
import { getTodayIsoDate } from '../utils/formatters';

/**
 * 환율 조회 서비스
 *
 * 예상 API (협의용 예시):
 * GET /api/exchange-rates?base=JPY&target=KRW&date=2026-12-10
 *
 * 실제 환율 API가 연동되기 전에는 Mock 기준 환율을 반환하며,
 * UI에서 실제 실시간 환율로 오해하지 않도록 isMockRate 플래그를 명확히 전달합니다.
 */
export const exchangeRateService = {
  async getExchangeRate({ base = 'KRW', target = 'KRW', date } = {}) {
    const normalizedBase = String(base || 'KRW').toUpperCase();
    const normalizedTarget = String(target || 'KRW').toUpperCase();
    const rateDate = date || getTodayIsoDate();

    if (normalizedBase === normalizedTarget) {
      return {
        base: normalizedBase,
        target: normalizedTarget,
        rate: 1,
        date: rateDate,
        source: 'IDENTITY',
        isMockRate: false,
      };
    }

    if (!isMockMode()) {
      const params = new URLSearchParams({
        base: normalizedBase,
        quote: normalizedTarget,
        date: rateDate,
      });
      const {data} = await apiRequest(`${API_ENDPOINTS.exchangeRates}?${params.toString()}`, {
        method: 'GET',
      });
      return {
        base: data.base || normalizedBase,
        target: data.quote || normalizedTarget,
        rate: Number(data.rate),
        date: data.rate_date || rateDate,
        source: data.source || 'API',
        isMockRate: false,
      };
    }

    await simulateMockDelay(140);
    const meta = getCurrencyMeta(normalizedBase);
    return {
      base: normalizedBase,
      target: normalizedTarget,
      rate: meta.mockRateToKrw,
      date: rateDate,
      source: 'MOCK_REFERENCE',
      isMockRate: true,
    };
  },
};
