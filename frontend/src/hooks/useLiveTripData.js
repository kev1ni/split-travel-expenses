import { useCallback, useEffect, useState } from 'react';
import { isMockMode } from '../services/apiClient';
import { cardEventService } from '../services/cardEventService';
import { expenseService } from '../services/expenseService';

// New phone receipts are registered by the server even when the web app is closed.
// Opening a trip also gives receipts saved before automatic registration a chance to catch up.
export function useLiveTripData(tripId, load, hasPendingReceipts) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!tripId) return;
    const controller = new AbortController();
    const { signal } = controller;
    let busy = false;
    let firstSync = true;
    let cursor = null;
    let retryAfter = 0;
    let data;
    let revision;

    async function update() {
      if (busy || signal.aborted) return;
      busy = true;
      try {
        // A trip detail includes balances, splits and settlements. Only reread it
        // when expenses change. The inbox itself is already a lightweight read.
        const nextRevision = data && !hasPendingReceipts && !isMockMode()
          ? await expenseService.getRevision(tripId, signal) : null;
        if (!data || nextRevision === null || nextRevision !== revision) {
          data = await load(tripId, signal);
          revision = nextRevision;
        }
        if (signal.aborted) return;
        setResult({ tripId, data });
        if (isMockMode() || Date.now() < retryAfter || !(firstSync || cursor || hasPendingReceipts?.(data))) return;
        retryAfter = Date.now() + 60000;
        const synced = await cardEventService.sync(tripId, cursor, signal);
        if (signal.aborted) return;
        firstSync = false;
        cursor = synced.next_cursor;
        if (cursor) retryAfter = 0;
        if (synced.registered_count > 0) {
          data = await load(tripId, signal);
          if (!signal.aborted) setResult({ tripId, data });
        }
      } catch (err) {
        if ([401, 403].includes(err.status)) data = null;
        if (!signal.aborted) setResult({ tripId, data, error: err.message });
      } finally {
        busy = false;
      }
    }
    update();
    const updateIfVisible = () => { if (!document.hidden) update(); };
    const timer = isMockMode() ? null : window.setInterval(updateIfVisible, 10000);
    document.addEventListener('visibilitychange', updateIfVisible);
    return () => {
      controller.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', updateIfVisible);
    };
  }, [tripId, load, hasPendingReceipts, attempt]);

  const current = result?.tripId === tripId ? result : null;
  return { data: current?.data, isLoading: !!tripId && !current, error: current?.error, refresh };
}
