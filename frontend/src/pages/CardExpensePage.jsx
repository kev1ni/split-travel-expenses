import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { CollectorInbox } from '../components/expenses/CollectorInbox';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { isMockMode } from '../services/apiClient';
import { tripService } from '../services/tripService';

export function CardExpensePage() {
  const { tripId } = useParams();
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    tripService.getTripDetail(tripId, controller.signal).then(
      trip => { if (!controller.signal.aborted) setResult({ tripId, trip }); },
      err => { if (!controller.signal.aborted) setResult({ tripId, error: err.message }); },
    );
    return () => controller.abort();
  }, [tripId]);
  const current = result?.tripId === tripId ? result : null;
  const trip = current?.trip;
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <Link to={`/trips/${tripId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-primary-dark">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {trip ? `${trip.title} 상세로 돌아가기` : '여행 상세로 돌아가기'}
        </Link>
        {!current ? <LoadingSpinner label="여행 정보를 불러오고 있어요..." />
          : !trip ? <Card><p role="alert">{current.error || '여행 정보를 찾을 수 없어요.'}</p></Card>
          : isMockMode() ? <ExpenseList expenses={trip.expenses.filter(expense => expense.paymentMethod === 'CARD')} title="샘플 카드 지출" />
          : <CollectorInbox key={trip.id} trip={trip} />}
      </div>
    </AppLayout>
  );
}
