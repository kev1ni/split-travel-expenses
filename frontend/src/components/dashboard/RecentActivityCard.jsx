import { Link } from 'react-router-dom';
import { ChevronRight, Clock3 } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { getCategoryMeta } from '../../constants/categories';
import {
  formatDateDot,
  formatKrwSymbol,
  formatOriginalCurrency,
} from '../../utils/formatters';

export function RecentActivityCard({ activities = [], selectedTripId }) {
  const detailLink = selectedTripId
    ? `/expenses?tripId=${selectedTripId}`
    : '/expenses';

  return (
    <Card padding="p-6" className="h-full flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-extrabold text-ink-main">최근 활동</h3>
          {activities.length > 0 && (
            <Link
              to={detailLink}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink-secondary hover:text-primary-dark transition-colors"
            >
              전체 보기
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {activities.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="최근 활동이 없어요"
            description="지출을 등록하면 최근 활동이 여기에 최대 3건까지 표시돼요."
          />
        ) : (
          <ul className="divide-y divide-surface-border/70">
            {activities.slice(0, 3).map((activity) => {
              const category = getCategoryMeta(activity.category);
              const CategoryIcon = category.icon;
              const isCancelled = activity.eventType === 'CANCELLED';

              return (
                <li key={activity.id}>
                  <Link
                    to={`/trips/${activity.tripId}`}
                    className="flex items-center justify-between gap-3 py-3.5 px-2 -mx-2 rounded-[14px] hover:bg-surface-bg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0 ${category.bgClass} ${category.textClass}`}
                        aria-hidden="true"
                      >
                        <CategoryIcon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isCancelled
                              ? 'line-through text-ink-secondary'
                              : 'text-ink-main'
                          }`}
                        >
                          {activity.title}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5 truncate">
                          {activity.actorName} ·{' '}
                          {isCancelled ? '결제 취소' : '지출 등록'} ·{' '}
                          {formatDateDot(activity.date)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          isCancelled
                            ? 'line-through text-ink-secondary'
                            : 'text-ink-main'
                        }`}
                      >
                        {formatOriginalCurrency(activity.amount, activity.currency)}
                      </p>
                      {activity.currency !== 'KRW' && activity.amountKrw !== undefined && (
                        <p className="text-[11px] font-medium text-ink-secondary tabular-nums">
                          {activity.krwAmountType === 'CONFIRMED_BILLING'
                            ? `청구 ${formatKrwSymbol(activity.amountKrw)}`
                            : `약 ${formatKrwSymbol(activity.amountKrw)}`}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedTripId && (
        <div className="pt-3 border-t border-surface-border/70">
          <Link
            to={`/settlements?tripId=${selectedTripId}`}
            className="flex items-center justify-between text-xs font-semibold text-ink-secondary hover:text-primary-dark transition-colors"
          >
            <span>이 여행의 정산 내역 확인하기</span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </Card>
  );
}
