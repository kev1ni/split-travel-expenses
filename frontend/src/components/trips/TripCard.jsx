import { Link } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Users,
  ArrowRight,
  UserPlus,
  UserCog,
} from 'lucide-react';
import { Card } from '../common/Card';
import { StatusBadge } from '../common/StatusBadge';
import { CollectorTripLink } from '../expenses/CollectorTripLink';
import { formatDateRange, formatKrw } from '../../utils/formatters';
import { getTripPhase, getTripPhaseMeta } from '../../utils/tripHelpers';

export function TripCard({
  trip,
  onInvite = null,
  onManageMembers = null,
}) {
  const phase = getTripPhase(trip);
  const phaseMeta = getTripPhaseMeta(phase);

  const settlementText =
    trip.settlementStatus === 'SETTLED' ? '정산 완료' : '정산 진행 중';

  return (
    <Card
      hoverable
      padding="p-6"
      className="relative flex flex-col justify-between gap-5 group"
    >
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge tone={phaseMeta.tone}>{phaseMeta.label}</StatusBadge>
          <span className="text-xs font-semibold text-ink-secondary">
            {settlementText}
          </span>
        </div>

        <h3 className="text-lg sm:text-xl font-extrabold text-ink-main group-hover:text-primary-dark transition-colors truncate">
          {trip.title}
        </h3>

        <div className="space-y-1.5 text-sm text-ink-secondary">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            <span className="truncate">{trip.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            <span>참여 인원 {trip.memberCount}명</span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-surface-border/80 space-y-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-secondary">총 여행 경비</p>
            <p className="text-xl font-extrabold text-ink-main tabular-nums mt-0.5">
              {formatKrw(trip.totalAmountKrw)}
            </p>
          </div>

          <Link
            to={`/trips/${trip.id}`}
            aria-label={`${trip.title} 여행 상세 보기`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[12px] bg-[#F2F6EE] hover:bg-primary text-ink-main text-sm font-semibold transition-colors shrink-0 after:absolute after:inset-0 after:content-['']"
          >
            상세 보기
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <CollectorTripLink trip={trip} />

        {(onInvite || onManageMembers) && (
          <div className="relative z-10 flex items-center gap-2 pt-1">
            {onInvite && (
              <button
                type="button"
                onClick={() => onInvite(trip)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-[12px] bg-surface-bg hover:bg-primary-light/60 text-xs font-semibold text-ink-main transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-primary-dark" aria-hidden="true" />
                친구 초대
              </button>
            )}
            {onManageMembers && (
              <button
                type="button"
                onClick={() => onManageMembers(trip)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-[12px] bg-surface-bg hover:bg-primary-light/60 text-xs font-semibold text-ink-main transition-colors cursor-pointer"
              >
                <UserCog className="w-3.5 h-3.5 text-primary-dark" aria-hidden="true" />
                멤버 관리
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
