import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/common/Button';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { FeaturedTripCard } from '../components/dashboard/FeaturedTripCard';
import { QuickActionsBar } from '../components/dashboard/QuickActionsBar';
import { RecentActivityCard } from '../components/dashboard/RecentActivityCard';
import { InviteFriendModal } from '../components/trips/InviteFriendModal';
import { useAuth } from '../hooks/useAuth';
import { tripService } from '../services/tripService';
import { expenseService } from '../services/expenseService';
import {
  buildRecentActivitiesFromExpenses,
  pickDefaultFeaturedTrip,
} from '../utils/tripHelpers';

export function HomePage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedTripExpenses, setSelectedTripExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteModalTrip, setInviteModalTrip] = useState(null);

  const loadHomeData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await tripService.getTripSummaries();
      const loadedTrips = data?.trips || [];
      setTrips(loadedTrips);

      setSelectedTripId((prevId) => {
        if (prevId && loadedTrips.some((t) => t.id === prevId)) {
          return prevId;
        }
        const featured = pickDefaultFeaturedTrip(loadedTrips);
        return featured?.id || '';
      });
    } catch (err) {
      setError(err.message || '홈 정보를 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || null,
    [trips, selectedTripId]
  );

  // 선택된 대표 여행의 실제 지출 데이터를 불러와 최대 3건의 최근 활동으로 표시
  useEffect(() => {
    if (!selectedTripId) {
      setSelectedTripExpenses([]);
      return;
    }

    let active = true;
    expenseService
      .getRecentTripExpenses(selectedTripId)
      .then((res) => {
        if (active) {
          setSelectedTripExpenses(res?.expenses || res || []);
        }
      })
      .catch(() => {
        if (active) setSelectedTripExpenses([]);
      });

    return () => {
      active = false;
    };
  }, [selectedTripId]);

  const recentActivities = useMemo(
    () => buildRecentActivitiesFromExpenses(selectedTripExpenses, 3),
    [selectedTripExpenses]
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* A. 간결한 환영 영역 */}
        <section className="flex items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-ink-main tracking-tight">
            안녕하세요, {user?.nickname || '여행자'}님 👋
          </h1>

          <Link to="/trips/new" className="shrink-0">
            <Button variant="secondary" size="sm">
              <Plus className="w-4 h-4" aria-hidden="true" />
              새 여행
            </Button>
          </Link>
        </section>

        {isLoading ? (
          <LoadingSpinner label="대시보드를 준비하고 있어요..." />
        ) : error ? (
          <div
            role="alert"
            className="p-6 rounded-card bg-surface-card border border-danger/30 shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-danger">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={loadHomeData}>
              <RefreshCw className="w-4 h-4" />
              다시 시도
            </Button>
          </div>
        ) : (
          /* 데스크톱 12컬럼 2분할: 대표 여행 + 빠른 실행 (좌) / 최근 활동 (우) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-5">
              {/* B. 대표 여행 카드 */}
              <FeaturedTripCard
                trip={selectedTrip}
                trips={trips}
                onSelectTrip={setSelectedTripId}
              />

              {/* C. 빠른 실행 영역 */}
              <QuickActionsBar
                selectedTrip={selectedTrip}
                onOpenInvite={(trip) => setInviteModalTrip(trip)}
              />
            </div>

            {/* D. 최근 활동 (최대 3건) */}
            <div className="lg:col-span-5">
              <RecentActivityCard
                activities={recentActivities}
                selectedTripId={selectedTrip?.id}
              />
            </div>
          </div>
        )}

        {/* 빠른 실행 > 친구 초대 모달 */}
        <InviteFriendModal
          isOpen={Boolean(inviteModalTrip)}
          onClose={() => setInviteModalTrip(null)}
          trip={inviteModalTrip}
        />
      </div>
    </AppLayout>
  );
}
