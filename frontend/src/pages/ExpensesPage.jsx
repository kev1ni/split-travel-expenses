import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Wallet,
  CreditCard,
  ChevronDown,
  Plane,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { tripService } from '../services/tripService';
import { expenseService } from '../services/expenseService';
import { formatKrw } from '../utils/formatters';
import { pickDefaultFeaturedTrip } from '../utils/tripHelpers';

export function ExpensesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTripId = searchParams.get('tripId') || '';

  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(queryTripId);
  const [expenses, setExpenses] = useState([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [error, setError] = useState('');

  const loadTrips = useCallback(async () => {
    setIsLoadingTrips(true);
    setError('');
    try {
      const res = await tripService.getTrips();
      const loadedTrips = res?.trips || res || [];
      setTrips(loadedTrips);

      setSelectedTripId((prev) => {
        if (queryTripId && loadedTrips.some((t) => t.id === queryTripId)) {
          return queryTripId;
        }
        if (prev && loadedTrips.some((t) => t.id === prev)) {
          return prev;
        }
        const featured = pickDefaultFeaturedTrip(loadedTrips);
        return featured?.id || '';
      });
    } catch (err) {
      setError(err.message || '여행 목록을 불러오지 못했어요.');
    } finally {
      setIsLoadingTrips(false);
    }
  }, [queryTripId]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const loadExpenses = useCallback(async (tripId) => {
    if (!tripId) {
      setExpenses([]);
      return;
    }
    setIsLoadingExpenses(true);
    setError('');
    try {
      const res = await expenseService.getTripExpenses(tripId);
      setExpenses(res?.expenses || res || []);
    } catch (err) {
      setError(err.message || '지출 내역을 불러오지 못했어요.');
    } finally {
      setIsLoadingExpenses(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadExpenses(selectedTripId);
    }
  }, [selectedTripId, loadExpenses]);

  const handleSelectTrip = (tripId) => {
    setSelectedTripId(tripId);
    setSearchParams({ tripId }, { replace: true });
  };

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || null,
    [trips, selectedTripId]
  );

  const totals = useMemo(() => {
    const active = expenses.filter((e) => e.eventType !== 'CANCELLED');
    const all = active.reduce((sum, e) => sum + Number(e.amountKrw ?? e.amount ?? 0), 0);
    const cash = active
      .filter((e) => e.paymentMethod === 'CASH')
      .reduce((sum, e) => sum + Number(e.amountKrw ?? e.amount ?? 0), 0);
    const card = active
      .filter((e) => e.paymentMethod === 'CARD')
      .reduce((sum, e) => sum + Number(e.amountKrw ?? e.amount ?? 0), 0);
    return { all, cash, card };
  }, [expenses]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* 상단 헤더 + 여행 선택 + 지출 등록 버튼 */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-ink-main tracking-tight">
              경비 관리
            </h1>

            {trips.length > 0 && (
              <div className="relative inline-flex items-center">
                <label htmlFor="expenses-trip-select" className="sr-only">
                  여행 선택
                </label>
                <select
                  id="expenses-trip-select"
                  value={selectedTripId}
                  onChange={(e) => handleSelectTrip(e.target.value)}
                  className="appearance-none pl-4 pr-10 py-2.5 rounded-[14px] bg-surface-card border border-surface-border text-sm font-bold text-ink-main shadow-soft focus:border-primary-dark cursor-pointer"
                >
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 text-ink-secondary absolute right-3 pointer-events-none"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>

          {selectedTrip && (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate(`/trips/${selectedTrip.id}/expenses/cash`)}
              >
                <Wallet className="w-4 h-4" aria-hidden="true" />
                현금 입력
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => navigate(`/trips/${selectedTrip.id}/expenses/card`)}
              >
                <CreditCard className="w-4 h-4" aria-hidden="true" />
                카드 결제 등록
              </Button>
            </div>
          )}
        </section>

        {isLoadingTrips ? (
          <LoadingSpinner label="여행 정보를 불러오고 있어요..." />
        ) : error ? (
          <Card className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-danger text-sm font-semibold">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={loadTrips}>
              <RefreshCw className="w-4 h-4" />
              다시 시도
            </Button>
          </Card>
        ) : !selectedTrip ? (
          <EmptyState
            icon={Plane}
            title="지출을 관리할 여행이 없어요"
            description="먼저 여행을 생성하면 현금 지출 입력과 카드 결제 파싱 기능을 사용할 수 있어요."
            action={
              <Link to="/trips/new">
                <Button variant="primary">새 여행 만들기</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-5">
            {/* 슬림한 지출 합계 바 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card padding="p-4 sm:p-5">
                <p className="text-xs font-semibold text-ink-secondary">선택한 여행 총지출</p>
                <p className="text-xl sm:text-2xl font-extrabold text-ink-main tabular-nums mt-1">
                  {formatKrw(totals.all)}
                </p>
              </Card>
              <Card padding="p-4 sm:p-5">
                <p className="text-xs font-semibold text-ink-secondary">현금 지출</p>
                <p className="text-xl sm:text-2xl font-extrabold text-ink-main tabular-nums mt-1">
                  {formatKrw(totals.cash)}
                </p>
              </Card>
              <Card padding="p-4 sm:p-5">
                <p className="text-xs font-semibold text-ink-secondary">카드 지출</p>
                <p className="text-xl sm:text-2xl font-extrabold text-ink-main tabular-nums mt-1">
                  {formatKrw(totals.card)}
                </p>
              </Card>
            </div>

            {/* 전체 지출 목록 (필터 / 카테고리 / 정렬 / 상세 펼침) */}
            {isLoadingExpenses ? (
              <LoadingSpinner label="지출 내역을 불러오고 있어요..." />
            ) : (
              <ExpenseList
                expenses={expenses}
                title={`${selectedTrip.title} 전체 지출`}
                showCategoryFilter
                emptyAction={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/trips/${selectedTrip.id}/expenses/cash`)}
                    >
                      <Wallet className="w-4 h-4" />
                      현금 입력
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/trips/${selectedTrip.id}/expenses/card`)}
                    >
                      <CreditCard className="w-4 h-4" />
                      카드 등록
                    </Button>
                  </div>
                }
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
