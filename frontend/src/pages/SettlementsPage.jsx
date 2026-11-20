import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  ChevronDown,
  Plane,
  AlertCircle,
  RefreshCw,
  Clock3,
  Coins,
  Users,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { tripService } from '../services/tripService';
import { formatDateDot, formatKrw } from '../utils/formatters';
import {
  pickDefaultFeaturedTrip,
  summarizeSettlements,
} from '../utils/tripHelpers';

export function SettlementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTripId = searchParams.get('tripId') || '';

  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(queryTripId);
  const [tripDetail, setTripDetail] = useState(null);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
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
      setError(err.message || '여행 정보를 불러오지 못했어요.');
    } finally {
      setIsLoadingTrips(false);
    }
  }, [queryTripId]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const loadTripDetail = useCallback(async (tripId) => {
    if (!tripId) {
      setTripDetail(null);
      return;
    }
    setIsLoadingDetail(true);
    setError('');
    try {
      const detail = await tripService.getTripDetail(tripId);
      setTripDetail(detail);
    } catch (err) {
      setError(err.message || '정산 내역을 불러오지 못했어요.');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadTripDetail(selectedTripId);
    }
  }, [selectedTripId, loadTripDetail]);

  const handleSelectTrip = (tripId) => {
    setSelectedTripId(tripId);
    setSearchParams({ tripId }, { replace: true });
  };

  const summary = useMemo(
    () => summarizeSettlements(tripDetail?.settlements || []),
    [tripDetail]
  );

  const memberSummaries = tripDetail?.memberSettlementSummary || [];

  const isSettled =
    tripDetail?.settlementStatus === 'SETTLED' ||
    (summary.pending.length === 0 && summary.completed.length > 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* 상단 헤더 & 여행 선택 */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-ink-main tracking-tight">
              정산 내역
            </h1>

            {trips.length > 0 && (
              <div className="relative inline-flex items-center">
                <label htmlFor="settlements-trip-select" className="sr-only">
                  정산 여행 선택
                </label>
                <select
                  id="settlements-trip-select"
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

          {tripDetail && (
            <div className="flex items-center gap-2.5">
              <StatusBadge tone={isSettled ? 'green' : 'amber'}>
                {isSettled ? '정산 완료' : '정산 진행 중'}
              </StatusBadge>
              <Link to={`/trips/${tripDetail.id}`}>
                <Button variant="secondary" size="sm">
                  여행 상세 보기
                </Button>
              </Link>
            </div>
          )}
        </section>

        {isLoadingTrips || isLoadingDetail ? (
          <LoadingSpinner label="정산 내역을 불러오고 있어요..." />
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
        ) : !tripDetail ? (
          <EmptyState
            icon={Plane}
            title="정산할 여행이 없어요"
            description="여행을 만들고 지출을 기록하면 원화(KRW) 기준으로 정산 내역이 계산돼요."
            action={
              <Link to="/trips/new">
                <Button variant="primary">새 여행 만들기</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-6">
            {/* 상단 3개 핵심 지표: 총 여행 경비(KRW) / 보낼 금액 / 받을 금액 */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card padding="p-6" className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">
                    총 여행 경비 (KRW)
                  </p>
                  <p className="text-2xl sm:text-[26px] font-extrabold text-ink-main tabular-nums mt-1.5">
                    {formatKrw(tripDetail.totalAmountKrw)}
                  </p>
                </div>
                <span
                  className="w-11 h-11 rounded-[14px] bg-surface-bg text-primary-dark flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Coins className="w-5 h-5" />
                </span>
              </Card>

              <Card padding="p-6" className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">
                    내가 보내야 할 금액 (KRW)
                  </p>
                  <p className="text-2xl sm:text-[26px] font-extrabold text-[#C84A4A] tabular-nums mt-1.5">
                    {formatKrw(summary.pendingSend)}
                  </p>
                </div>
                <span
                  className="w-11 h-11 rounded-[14px] bg-[#FDECEC] text-[#C84A4A] flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <ArrowUpRight className="w-5 h-5" />
                </span>
              </Card>

              <Card padding="p-6" className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">
                    내가 받아야 할 금액 (KRW)
                  </p>
                  <p className="text-2xl sm:text-[26px] font-extrabold text-primary-dark tabular-nums mt-1.5">
                    {formatKrw(summary.pendingReceive)}
                  </p>
                </div>
                <span
                  className="w-11 h-11 rounded-[14px] bg-primary-light text-primary-dark flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <ArrowDownLeft className="w-5 h-5" />
                </span>
              </Card>
            </section>

            {/* 개인별 결제 금액 / 부담 금액 (KRW) */}
            {memberSummaries.length > 0 && (
              <Card padding="p-6" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-ink-main flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary-dark" aria-hidden="true" />
                    개인별 결제 · 부담 금액 (KRW)
                  </h2>
                  <span className="text-xs text-ink-secondary">
                    원화 환산 금액 기준 · 서버 확정 정산
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-surface-border text-xs text-ink-secondary">
                        <th className="py-2.5 text-left font-semibold">멤버</th>
                        <th className="py-2.5 text-right font-semibold">결제 금액 (KRW)</th>
                        <th className="py-2.5 text-right font-semibold">부담 금액 (KRW)</th>
                        <th className="py-2.5 text-right font-semibold">차액 (KRW)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border/70">
                      {memberSummaries.map((member) => {
                        const net = Number(member.netAmountKrw || 0);
                        return (
                          <tr key={member.memberId}>
                            <td className="py-3.5 pr-3 font-bold text-ink-main">
                              <span className="inline-flex items-center gap-1.5">
                                {member.memberName}
                                {member.memberType === 'GUEST' && (
                                  <StatusBadge tone="neutral">비회원</StatusBadge>
                                )}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-right font-semibold text-ink-main tabular-nums">
                              {formatKrw(member.paidAmountKrw)}
                            </td>
                            <td className="py-3.5 px-3 text-right font-semibold text-ink-main tabular-nums">
                              {formatKrw(member.shareAmountKrw)}
                            </td>
                            <td
                              className={`py-3.5 pl-3 text-right font-extrabold tabular-nums ${
                                net > 0
                                  ? 'text-primary-dark'
                                  : net < 0
                                    ? 'text-[#C84A4A]'
                                    : 'text-ink-secondary'
                              }`}
                            >
                              {net > 0
                                ? `+${formatKrw(net)}`
                                : net < 0
                                  ? `-${formatKrw(Math.abs(net))}`
                                  : '0원'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* 2열 구성: 최종 송금 금액 (진행 중) & 정산 완료 내역 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <Card padding="p-6" className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-ink-main">
                    최종 송금 금액 (KRW)
                  </h2>
                  <span className="text-xs font-semibold text-ink-secondary">
                    {summary.pending.length}건
                  </span>
                </div>

                {summary.pending.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="남은 정산 내역이 없어요"
                    description="보내거나 받을 금액이 모두 정리되었어요."
                  />
                ) : (
                  <ul className="space-y-3">
                    {summary.pending.map((item) => {
                      const isSend = item.direction === 'SEND';
                      const label =
                        item.fromName && item.toName
                          ? `${item.fromName} → ${item.toName}`
                          : item.counterpartyName;

                      return (
                        <li
                          key={item.id}
                          className={[
                            'flex items-center justify-between gap-3 p-4 rounded-[16px] border',
                            isSend
                              ? 'bg-[#FFF9F9] border-[#F6DFDF]'
                              : 'bg-surface-bg border-surface-border',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span
                              className={[
                                'w-10 h-10 rounded-[13px] inline-flex items-center justify-center shrink-0',
                                isSend
                                  ? 'bg-[#FDE8E8] text-[#C84A4A]'
                                  : 'bg-primary-light text-primary-dark',
                              ].join(' ')}
                              aria-hidden="true"
                            >
                              {isSend ? (
                                <ArrowUpRight className="w-5 h-5" />
                              ) : (
                                <ArrowDownLeft className="w-5 h-5" />
                              )}
                            </span>

                            <div className="min-w-0">
                              <p className="text-[15px] font-bold text-ink-main truncate">
                                {label}
                              </p>
                              <p className="text-xs text-ink-secondary mt-0.5">
                                {isSend ? '송금 필요' : '입금 예정'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p
                              className={`text-base font-extrabold tabular-nums ${
                                isSend ? 'text-[#C84A4A]' : 'text-primary-dark'
                              }`}
                            >
                              {formatKrw(item.amount)}
                            </p>
                            <span
                              className={`text-[11px] font-semibold ${
                                isSend ? 'text-[#C84A4A]/80' : 'text-primary-dark/80'
                              }`}
                            >
                              {isSend ? '보내기' : '받기'}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card padding="p-6" className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-ink-main">
                    정산 완료 내역
                  </h2>
                  <span className="text-xs font-semibold text-ink-secondary">
                    {summary.completed.length}건
                  </span>
                </div>

                {summary.completed.length === 0 ? (
                  <EmptyState
                    icon={Clock3}
                    title="아직 완료된 정산이 없어요"
                    description="송금이 완료되면 이곳에 정산 완료 기록이 쌓여요."
                  />
                ) : (
                  <ul className="divide-y divide-surface-border/70">
                    {summary.completed.map((item) => {
                      const label =
                        item.fromName && item.toName
                          ? `${item.fromName} → ${item.toName}`
                          : item.counterpartyName;

                      return (
                        <li
                          key={item.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="w-9 h-9 rounded-full bg-primary-light/70 text-primary-dark flex items-center justify-center shrink-0"
                              aria-hidden="true"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-ink-main truncate">
                                {label}
                              </p>
                              {item.completedAt && (
                                <p className="text-xs text-ink-secondary mt-0.5">
                                  {formatDateDot(item.completedAt)} 완료
                                </p>
                              )}
                            </div>
                          </div>

                          <span className="text-sm font-bold text-ink-main tabular-nums shrink-0">
                            {formatKrw(item.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
