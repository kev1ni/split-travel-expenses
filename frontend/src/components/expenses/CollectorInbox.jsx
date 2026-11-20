import { useEffect, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { cardEventService } from '../../services/cardEventService';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { CollectorExpenseReview } from './CollectorExpenseReview';
import { CollectorPairing } from './CollectorPairing';

function displayAmount(event) {
  if (!event.amount || !event.currency) return '금액 미확인';
  return `${Number(event.amount).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${event.currency}`;
}

export function CollectorInbox({ trip, onRegistered }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const rows = await cardEventService.getPending(trip.id, controller.signal);
        if (!controller.signal.aborted) {
          setEvents(rows);
          setError('');
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    setLoading(true);
    load();
    const refreshIfVisible = () => { if (!document.hidden) load(); };
    const timer = window.setInterval(refreshIfVisible, 15000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [trip.id, refresh]);

  const members = trip.members;
  const selected = selectedId && events?.find((row) =>
    row.event_id === selectedId || row.duplicate_event_ids?.includes(selectedId)
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CreditCard className="h-5 w-5 text-primary-dark" aria-hidden="true" /> 수신한 카드 알림
          </h1>
          <Button variant="secondary" size="sm" loading={loading}
            onClick={() => setRefresh((value) => value + 1)}>
            {!loading && <RefreshCw className="w-4 h-4" aria-hidden="true" />} 새로고침
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {events?.length === 0 && !error && (
          <p className="rounded-[16px] bg-surface-bg p-4 text-sm text-ink-secondary">
            등록을 기다리는 알림이 없어요. 휴대폰 수집기를 연결한 뒤 다음 카드 결제 알림을 기다려 주세요.
          </p>
        )}
        {events?.length > 0 && (
          <ul className="divide-y divide-surface-border">
            {events.map((event) => {
              const payer = members.find((m) => String(m.id) === String(event.payer_member_id));
              const count = 1 + (event.duplicate_event_ids?.length || 0);
              const refund = ['cancel', 'cancellation', 'partial_cancellation'].includes(event.event_type);
              const received = event.received_at ? new Date(event.received_at).toLocaleString('ko-KR') : '';
              return (
                <li key={event.event_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-bold break-words">{event.merchant || event.issuer || '가맹점 미확인'}</p>
                    <p className="text-sm text-ink-main">{displayAmount(event)} · {payer?.name || '결제자 미확인'}</p>
                    <p className="text-xs text-ink-secondary">
                      {count > 1 ? `같은 승인번호의 알림 ${count}건` : event.source === 'app_push' ? '카드 앱 푸시' : '메시지'}
                      {received && ` · ${received} 수신`}
                    </p>
                  </div>
                  {(event.event_type === 'approval' || refund) && payer ? (
                    <Button size="sm" variant={refund ? 'secondary' : 'soft'} onClick={() => setSelectedId(event.event_id)}>
                      {refund ? '취소 검토' : '지출 검토'}
                    </Button>
                  ) : (
                    <span className="text-sm font-semibold text-ink-secondary">
                      직접 확인 필요
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {selected && (
        <CollectorExpenseReview key={selectedId} trip={trip} event={selected}
          onClose={() => setSelectedId(null)} onRegistered={onRegistered} />
      )}
      <CollectorPairing trip={trip} />
    </div>
  );
}
