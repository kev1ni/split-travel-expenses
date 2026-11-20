import { Link } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Users,
  ArrowRight,
  Plane,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { formatDateRange, formatKrw } from '../../utils/formatters';
import { getTripPhase, getTripPhaseMeta } from '../../utils/tripHelpers';

export function FeaturedTripCard({
  trip,
  trips = [],
  onSelectTrip,
}) {
  // 대표 여행이 없을 때 여행 생성 유도
  if (!trip) {
    return (
      <Card padding="p-8 sm:p-10" className="text-center space-y-5">
        <div className="w-16 h-16 rounded-[22px] bg-primary-light/80 text-primary-dark flex items-center justify-center mx-auto">
          <Plane className="w-8 h-8" aria-hidden="true" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h2 className="text-xl font-extrabold text-ink-main">
            아직 등록된 여행이 없어요
          </h2>
          <p className="text-sm text-ink-secondary leading-relaxed">
            첫 여행을 만들고 친구들과 함께 경비를 기록해 보세요.
          </p>
        </div>
        <div className="pt-1">
          <Link to="/trips/new">
            <Button variant="primary" size="lg">
              <Plus className="w-5 h-5" aria-hidden="true" />
              새로운 여행 만들기
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const phase = getTripPhase(trip);
  const phaseMeta = getTripPhaseMeta(phase);

  const pendingSend = Number(trip.myPendingSendKrw || 0);
  const pendingReceive = Number(trip.myPendingReceiveKrw || 0);
  const net = pendingReceive - pendingSend;

  let settlementLabel = '정산 완료';
  let settlementValue = '0원';
  let settlementToneClass = 'text-ink-main';

  if (trip.settlementStatus !== 'SETTLED' && (pendingSend > 0 || pendingReceive > 0)) {
    if (net < 0) {
      settlementLabel = '내 정산 예정 (보낼 금액)';
      settlementValue = `-${formatKrw(Math.abs(net))}`;
      settlementToneClass = 'text-[#C84A4A]';
    } else if (net > 0) {
      settlementLabel = '내 정산 예정 (받을 금액)';
      settlementValue = `+${formatKrw(net)}`;
      settlementToneClass = 'text-primary-dark';
    } else {
      settlementLabel = '내 정산 예정 금액';
      settlementValue = '0원';
    }
  } else {
    settlementLabel = '내 정산 예정 금액';
    settlementValue = '0원';
  }

  return (
    <Card padding="p-6 sm:p-8" className="space-y-6">
      {/* 상단 상태 & 대표 여행 변경 셀렉터 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary-dark">
            대표 여행
          </span>
          <StatusBadge tone={phaseMeta.tone}>{phaseMeta.label}</StatusBadge>
        </div>

        {trips.length > 1 && (
          <div className="relative inline-flex items-center">
            <label htmlFor="featured-trip-selector" className="sr-only">
              대표 여행 선택
            </label>
            <select
              id="featured-trip-selector"
              value={trip.id}
              onChange={(e) => onSelectTrip(e.target.value)}
              className="appearance-none pl-3.5 pr-9 py-2 rounded-[12px] bg-[#F4F7F1] hover:bg-primary-light/50 text-xs sm:text-sm font-semibold text-ink-main border border-transparent focus:border-primary-dark transition-colors cursor-pointer"
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 text-ink-secondary absolute right-2.5 pointer-events-none"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* 여행 기본 정보 */}
      <div className="space-y-3">
        <h2 className="text-2xl sm:text-[28px] font-extrabold text-ink-main tracking-tight leading-snug">
          {trip.title}
        </h2>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-secondary">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            {trip.location}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            {trip.memberCount}명 참여
          </span>
        </div>
      </div>

      {/* 핵심 수치 2열 (여행 총지출 / 내 정산 예정 금액) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-4 sm:p-5 rounded-[18px] bg-surface-bg">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-ink-secondary">여행 총지출</p>
          <p className="text-2xl sm:text-[26px] font-extrabold text-ink-main tabular-nums tracking-tight">
            {formatKrw(trip.totalAmountKrw)}
          </p>
        </div>

        <div className="space-y-1 sm:border-l sm:border-surface-border sm:pl-5 pt-3 sm:pt-0 border-t sm:border-t-0 border-surface-border">
          <p className="text-xs font-semibold text-ink-secondary">{settlementLabel}</p>
          <p
            className={`text-2xl sm:text-[26px] font-extrabold tabular-nums tracking-tight ${settlementToneClass}`}
          >
            {settlementValue}
          </p>
        </div>
      </div>

      {/* 하단 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Link
          to="/trips"
          className="text-sm font-semibold text-ink-secondary hover:text-ink-main transition-colors"
        >
          전체 여행 보기 ({trips.length})
        </Link>

        <Link to={`/trips/${trip.id}`} className="w-full sm:w-auto">
          <Button variant="primary" size="md" fullWidth>
            여행 상세 보기
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
