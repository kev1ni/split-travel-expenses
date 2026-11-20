import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  UserPlus,
  Plus,
} from 'lucide-react';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { formatDateRange } from '../../utils/formatters';

export function TripDetailHeader({ trip, onOpenInvite, onOpenAddExpense }) {
  const statusTone =
    trip.settlementStatus === 'SETTLED'
      ? 'green'
      : trip.settlementStatus === 'IN_PROGRESS'
        ? 'amber'
        : 'neutral';

  return (
    <section className="bg-surface-card border border-surface-border rounded-modal shadow-soft p-5 sm:p-7">
      <div className="flex items-center justify-between gap-2 mb-4">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-primary-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          홈 대시보드로 돌아가기
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge tone={statusTone}>
            {trip.settlementStatusLabel || '정산 진행 중'}
          </StatusBadge>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="space-y-2.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-main tracking-tight">
            {trip.title}
          </h1>
          {trip.description && (
            <p className="text-sm text-ink-secondary leading-relaxed max-w-2xl">
              {trip.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-primary-dark" aria-hidden="true" />
              {trip.location}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary-dark" aria-hidden="true" />
              {formatDateRange(trip.startDate, trip.endDate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary-dark" aria-hidden="true" />
              참여 멤버 {trip.members?.length || 0}명
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <Button variant="soft" onClick={onOpenInvite}>
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            + 친구 초대
          </Button>
          <Button variant="primary" onClick={onOpenAddExpense}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            + 지출 추가
          </Button>
        </div>
      </div>
    </section>
  );
}
