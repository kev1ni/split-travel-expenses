import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  Wallet,
  CreditCard,
  Coins,
  Plus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { SummaryCard } from '../components/dashboard/SummaryCard';
import { SettlementSummary } from '../components/dashboard/SettlementSummary';
import { TripDetailHeader } from '../components/trips/TripDetailHeader';
import { MemberList } from '../components/trips/MemberList';
import { InviteFriendModal } from '../components/trips/InviteFriendModal';
import { ExpenseStatistics } from '../components/trips/ExpenseStatistics';
import { ExpenseTypeSelector } from '../components/expenses/ExpenseTypeSelector';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { tripService } from '../services/tripService';
import { useLiveTripData } from '../hooks/useLiveTripData';
import { countsTowardsExpenseTotal, sumKrwIntegers } from '../utils/currencyMath';
import { formatKrw } from '../utils/formatters';

export function TripDetailPage() {
  const { tripId } = useParams();
  const location = useLocation();

  const { data: trip, isLoading, error, refresh } = useLiveTripData(tripId, tripService.getTripDetail);
  const [notice, setNotice] = useState(location.state?.notice || '');

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isExpenseSelectorOpen, setIsExpenseSelectorOpen] = useState(false);

  const handleAddGuestMember = async (name) => {
    await tripService.addGuestMember(tripId, { name });
    refresh();
    setNotice(`비회원 친구 '${name}'님이 임시 멤버로 추가되었어요.`);
  };

  const expenseMetrics = useMemo(() => {
    const list = trip?.expenses || [];
    const active = list.filter(countsTowardsExpenseTotal);
    const cashExpenses = list.filter((e) => e.paymentMethod === 'CASH');
    const cardExpenses = list.filter((e) => e.paymentMethod === 'CARD');

    const totalKrw = sumKrwIntegers(
      active.map((e) => e.amountKrw ?? e.amount ?? 0)
    );
    const cashTotalKrw = sumKrwIntegers(
      active
        .filter((e) => e.paymentMethod === 'CASH')
        .map((e) => e.amountKrw ?? e.amount ?? 0)
    );
    const cardTotalKrw = sumKrwIntegers(
      active
        .filter((e) => e.paymentMethod === 'CARD')
        .map((e) => e.amountKrw ?? e.amount ?? 0)
    );

    return {
      totalKrw,
      cashTotalKrw,
      cardTotalKrw,
      cashCount: cashExpenses.length,
      cardCount: cardExpenses.length,
    };
  }, [trip]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-[16px] bg-primary-light/70 border border-primary/50 text-primary-dark text-sm font-semibold"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              {notice}
            </span>
            <button
              type="button"
              onClick={() => setNotice('')}
              className="text-xs underline shrink-0"
            >
              닫기
            </button>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner label="여행 상세 정보를 불러오고 있어요..." />
        ) : !trip ? (
          <Card className="text-center py-12 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-base font-bold text-ink-main">
              {error || '여행 정보를 찾을 수 없어요.'}
            </p>
            <div className="flex justify-center gap-2">
              <Link to="/home">
                <Button variant="secondary">홈으로 돌아가기</Button>
              </Link>
              <Button variant="primary" onClick={refresh}>
                다시 시도
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {/* 1. 여행 기본 정보 헤더 */}
            <TripDetailHeader
              trip={trip}
              onOpenInvite={() => setIsInviteModalOpen(true)}
              onOpenAddExpense={() => setIsExpenseSelectorOpen(true)}
            />

            {/* 2. 참여 중인 친구 목록 */}
            <MemberList
              members={trip.members || []}
              onAddGuest={trip.isOwner === false ? undefined : handleAddGuestMember}
              onOpenInvite={() => setIsInviteModalOpen(true)}
            />

            {/* 3. 여행 총지출 & 현금/카드 지출 요약 */}
            <section
              aria-label="여행 총지출 요약"
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <SummaryCard
                icon={Coins}
                label="여행 총지출"
                value={formatKrw(expenseMetrics.totalKrw)}
                subText={`전체 ${trip.expenses?.length || 0}건 · 취소 금액 반영`}
              />
              <SummaryCard
                icon={Wallet}
                label="현금 지출 내역"
                value={formatKrw(expenseMetrics.cashTotalKrw)}
                subText={`현금 직접 입력 ${expenseMetrics.cashCount}건`}
                accentClass="bg-[#EEF7E2] text-primary-dark"
              />
              <SummaryCard
                icon={CreditCard}
                label="카드 지출 내역"
                value={formatKrw(expenseMetrics.cardTotalKrw)}
                subText={`카드 결제 등록 ${expenseMetrics.cardCount}건`}
                accentClass="bg-primary text-ink-main"
              />
            </section>

            {/* 4 & 5. 현금 / 카드 통합 필터링 & 날짜별 지출 목록 */}
            <ExpenseList
              expenses={trip.expenses || []}
              title="현금 · 카드 지출 내역"
              emptyAction={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsExpenseSelectorOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                  첫 지출 추가하기
                </Button>
              }
            />

            {/* 6. 정산 결과 & 7. 지출 통계 */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SettlementSummary
                settlements={trip.settlements || []}
                memberSummaries={trip.memberSettlementSummary || []}
                totalAmountKrw={expenseMetrics.totalKrw}
                title="정산 결과 (KRW 기준)"
                subtitle="원화 환산 금액 기준으로 확정된 여행 정산 내역이에요"
              />
              <ExpenseStatistics expenses={trip.expenses || []} />
            </section>

            {/* 친구 초대 모달 */}
            <InviteFriendModal
              isOpen={isInviteModalOpen}
              onClose={() => setIsInviteModalOpen(false)}
              trip={trip}
            />

            {/* 지출 등록 방식 선택 모달 */}
            <ExpenseTypeSelector
              isOpen={isExpenseSelectorOpen}
              onClose={() => setIsExpenseSelectorOpen(false)}
              tripId={trip.id}
              tripTitle={trip.title}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
