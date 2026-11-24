import { useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useLiveTripData } from '../../hooks/useLiveTripData';
import { cardEventService } from '../../services/cardEventService';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { RefundLink } from './RefundLink';
import { CollectorPairing } from './CollectorPairing';

function hasPendingReceipts(events) {
  return events.some(event => event.source === 'app_push' && !event.expense_id && !event.auto_registration_skipped);
}

function groupReceipts(events) {
  const groups = new Map();
  for (const event of events) {
    if (event.source !== 'app_push') continue;
    const key = event.expense_id ? `expense-${event.expense_id}` : `event-${event.event_id}`;
    const previous = groups.get(key);
    if (previous) previous.count++;
    else groups.set(key, { event, count: 1 });
  }
  return Array.from(groups.values());
}

export function CollectorInbox({ trip }) {
  const { data, isLoading, error, refresh } = useLiveTripData(trip.id, cardEventService.getReceipts, hasPendingReceipts);
  const [selectedId, setSelectedId] = useState(null);
  const groups = groupReceipts(data || []);
  const selected = data?.find(event => event.event_id === selectedId && !event.expense_id && !event.auto_registration_skipped);

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CreditCard className="h-5 w-5 text-primary-dark" aria-hidden="true" /> 수신한 카드 알림
          </h1>
          <Button variant="secondary" size="sm" loading={isLoading} onClick={refresh}>
            {!isLoading && <RefreshCw className="w-4 h-4" aria-hidden="true" />} 새로고침
          </Button>
        </div>
        <p className="text-sm text-ink-secondary">
          연결된 카드 앱의 승인 푸시가 이 여행의 지출에 자동으로 반영되고, 여행 멤버 전원이 균등하게 분담해요.
        </p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {data && groups.length === 0 && !error && (
          <p className="rounded-[16px] bg-surface-bg p-4 text-sm text-ink-secondary">아직 수신한 카드 알림이 없어요.</p>
        )}
        {groups.length > 0 && (
          <ul className="divide-y divide-surface-border">
            {groups.map(({ event, count }) => {
              const payer = trip.members.find(member => String(member.id) === String(event.payer_member_id));
              const refund = ['cancel', 'cancellation', 'partial_cancellation'].includes(event.event_type);
              const received = event.received_at && new Date(event.received_at).toLocaleString('ko-KR');
              const canMatchOriginal = refund && payer && !event.expense_id && !event.auto_registration_skipped;
              let status = refund ? '원거래 확인 대기' : '자동 반영 대기';
              if (event.expense_id) status = refund ? '취소 반영됨' : '여행 지출 반영됨';
              else if (event.auto_registration_skipped) status = '자동 반영 제외';
              return (
                <li key={event.event_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-bold break-words">{event.merchant || event.issuer || '가맹점 미확인'}</p>
                    <p className="text-sm text-ink-main">
                      {event.amount && event.currency ? `${Number(event.amount).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${event.currency}` : '금액 미확인'}
                      {' · '}{payer?.name || '결제자 미확인'}
                    </p>
                    <p className="text-xs text-ink-secondary">
                      {count > 1 ? `같은 지출의 알림 ${count}건` : '카드 앱 푸시'}{received && ` · ${received} 수신`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink-secondary">{status}</span>
                  {canMatchOriginal && <Button size="sm" variant="secondary"
                    onClick={() => setSelectedId(event.event_id)}>원거래 연결</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {selected && <RefundLink key={selectedId} tripId={trip.id} event={selected}
        onClose={() => setSelectedId(null)} onLinked={() => { setSelectedId(null); refresh(); }} />}
      <CollectorPairing trip={trip} />
    </div>
  );
}
