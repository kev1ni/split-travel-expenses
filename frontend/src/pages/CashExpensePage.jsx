import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { CashExpenseForm } from '../components/expenses/CashExpenseForm';
import { tripService } from '../services/tripService';
import { expenseService } from '../services/expenseService';

export function CashExpensePage() {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');

    tripService
      .getTripDetail(tripId)
      .then((data) => {
        if (active) setTrip(data);
      })
      .catch((err) => {
        if (active) setError(err.message || '여행 정보를 불러오지 못했어요.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tripId]);

  const handleSubmit = async (payload) => {
    await expenseService.createExpense(tripId, payload);
    navigate(`/trips/${tripId}`, {
      replace: true,
      state: { notice: `'${payload.title}' 현금 지출이 등록되었어요.` },
    });
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to={`/trips/${tripId}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-primary-dark"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            {trip ? `${trip.title} 상세로 돌아가기` : '여행 상세로 돌아가기'}
          </Link>
        </div>

        {isLoading ? (
          <LoadingSpinner label="여행 멤버 정보를 불러오고 있어요..." />
        ) : error || !trip ? (
          <Card className="text-center py-10 space-y-4">
            <AlertCircle className="w-8 h-8 text-danger mx-auto" />
            <p className="text-sm font-semibold text-ink-main">
              {error || '여행 정보를 찾을 수 없어요.'}
            </p>
            <Link to="/home">
              <Button variant="secondary">홈으로 돌아가기</Button>
            </Link>
          </Card>
        ) : (
          <CashExpenseForm
            members={trip.members || []}
            defaultCurrency={trip.baseCurrency || 'KRW'}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/trips/${tripId}`)}
          />
        )}
      </div>
    </AppLayout>
  );
}
