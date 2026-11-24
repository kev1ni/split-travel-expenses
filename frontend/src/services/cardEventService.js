import { API_BASE_URL, apiRequest } from './apiClient';

export const cardEventService = {
  async getReceipts(tripId, signal) {
    const result = await apiRequest(`/api/v1/trips/${encodeURIComponent(tripId)}/card-events?source=app_push&limit=100`, { signal });
    return result.data;
  },

  async sync(tripId, cursor, signal) {
    const query = cursor ? `?after=${encodeURIComponent(cursor)}` : '';
    const result = await apiRequest(`/api/v1/trips/${encodeURIComponent(tripId)}/card-events/sync${query}`, {
      method: 'POST', signal,
    });
    return result.data;
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
};
