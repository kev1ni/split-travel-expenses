import { Link } from 'react-router-dom';
import { ReceiptText, ChevronRight } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { StatusBadge } from '../common/StatusBadge';
import { getCategoryMeta } from '../../constants/categories';
import { formatCurrency, formatDateDot } from '../../utils/formatters';

export function RecentExpensesCard({ expenses = [] }) {
  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink-main">최근 지출 내역</h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            최근 기록된 여행 경비를 한눈에 확인해요
          </p>
        </div>
        {expenses.length > 0 && (
          <Link
            to="/expenses"
            className="text-xs font-semibold text-primary-dark hover:underline inline-flex items-center gap-0.5"
          >
            전체 보기
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="아직 등록된 지출 내역이 없어요."
          description="여행을 선택해 현금 또는 카드 지출을 간편하게 기록해 보세요."
        />
      ) : (
        <ul className="divide-y divide-surface-border/70">
          {expenses.map((expense) => {
            const category = getCategoryMeta(expense.category);
            const CategoryIcon = category.icon;
            const isCancelled = expense.eventType === 'CANCELLED';

            return (
              <li key={expense.id}>
                <Link
                  to={`/trips/${expense.tripId}`}
                  className="flex items-center justify-between gap-3 py-3.5 px-2 -mx-2 rounded-[14px] hover:bg-surface-bg/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 ${category.bgClass} ${category.textClass}`}
                    >
                      <CategoryIcon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isCancelled
                              ? 'line-through text-ink-secondary'
                              : 'text-ink-main'
                          }`}
                        >
                          {expense.title}
                        </p>
                        {expense.eventType === 'PARTIAL_CANCELLED' && (
                          <StatusBadge tone="amber">부분취소</StatusBadge>
                        )}
                      </div>
                      <p className="text-xs text-ink-secondary mt-0.5 truncate">
                        {expense.payerName} 결제 · {formatDateDot(expense.expenseDate)}
                        {expense.tripTitle ? ` · ${expense.tripTitle}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold ${
                        isCancelled ? 'text-ink-secondary line-through' : 'text-ink-main'
                      }`}
                    >
                      {formatCurrency(expense.amount, expense.currency)}
                    </p>
                    <span className="text-[11px] font-medium text-ink-secondary">
                      {expense.paymentMethod === 'CARD' ? '카드' : '현금'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
