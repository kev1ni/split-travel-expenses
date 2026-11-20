import { useMemo, useState } from 'react';
import { ReceiptText, ArrowUpDown } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { ExpenseItem } from './ExpenseItem';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import { formatDateGroupHeader } from '../../utils/formatters';

const FILTER_OPTIONS = [
  { id: 'ALL', label: '전체' },
  { id: 'CASH', label: '현금' },
  { id: 'CARD', label: '카드' },
];

const SORT_OPTIONS = [
  { id: 'DATE_DESC', label: '최신 날짜순' },
  { id: 'DATE_ASC', label: '오래된 날짜순' },
  { id: 'AMOUNT_DESC', label: '금액 높은순' },
  { id: 'AMOUNT_ASC', label: '금액 낮은순' },
];

export function ExpenseList({
  expenses = [],
  initialFilter = 'ALL',
  title = '지출 내역',
  showCategoryFilter = false,
  emptyAction = null,
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DATE_DESC');

  const filteredAndSorted = useMemo(() => {
    const filtered = expenses.filter((item) => {
      const methodMatch = filter === 'ALL' || item.paymentMethod === filter;
      const categoryMatch =
        !showCategoryFilter ||
        categoryFilter === 'ALL' ||
        item.category === categoryFilter;
      return methodMatch && categoryMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'AMOUNT_DESC') {
        return Number(b.amountKrw ?? b.amount) - Number(a.amountKrw ?? a.amount);
      }
      if (sortBy === 'AMOUNT_ASC') {
        return Number(a.amountKrw ?? a.amount) - Number(b.amountKrw ?? b.amount);
      }
      const keyA = `${a.expenseDate || ''} ${a.expenseTime || ''}`;
      const keyB = `${b.expenseDate || ''} ${b.expenseTime || ''}`;
      return sortBy === 'DATE_ASC' ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA);
    });
  }, [expenses, filter, categoryFilter, showCategoryFilter, sortBy]);

  const groupedByDate = useMemo(() => {
    if (sortBy === 'AMOUNT_DESC' || sortBy === 'AMOUNT_ASC') {
      return [
        {
          dateKey: 'SORTED_BY_AMOUNT',
          label: sortBy === 'AMOUNT_DESC' ? '금액 높은순' : '금액 낮은순',
          items: filteredAndSorted,
        },
      ];
    }

    const map = new Map();
    filteredAndSorted.forEach((expense) => {
      const key = expense.expenseDate || 'UNKNOWN';
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(expense);
    });

    return Array.from(map.entries()).map(([dateKey, items]) => ({
      dateKey,
      label: formatDateGroupHeader(dateKey),
      items,
    }));
  }, [filteredAndSorted, sortBy]);

  return (
    <Card padding="p-5 sm:p-6">
      <div className="space-y-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-ink-main">
              {title}{' '}
              <span className="text-sm font-semibold text-ink-secondary">
                {filteredAndSorted.length}건
              </span>
            </h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              항목을 클릭하면 멤버별 분담 내역과 상세 정보를 확인할 수 있어요
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 결제 수단 필터 탭 */}
            <div
              role="tablist"
              aria-label="결제 수단 필터"
              className="inline-flex p-1 rounded-[12px] bg-surface-bg"
            >
              {FILTER_OPTIONS.map((opt) => {
                const active = filter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(opt.id)}
                    className={[
                      'px-3 py-1.5 rounded-[9px] text-xs font-bold transition-colors cursor-pointer',
                      active
                        ? 'bg-surface-card text-ink-main shadow-soft'
                        : 'text-ink-secondary hover:text-ink-main',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* 정렬 셀렉트 */}
            <div className="relative inline-flex items-center">
              <ArrowUpDown
                className="w-3.5 h-3.5 text-ink-secondary absolute left-3 pointer-events-none"
                aria-hidden="true"
              />
              <select
                aria-label="지출 정렬 기준"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="pl-8 pr-3 py-2 rounded-[12px] bg-surface-bg border border-transparent hover:border-surface-border text-xs font-semibold text-ink-main focus:border-primary-dark cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 카테고리 필터 칩 (경비 관리 탭 전용) */}
        {showCategoryFilter && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="지출 카테고리 필터"
          >
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              aria-pressed={categoryFilter === 'ALL'}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                categoryFilter === 'ALL'
                  ? 'bg-ink-main text-white'
                  : 'bg-surface-bg text-ink-secondary hover:text-ink-main',
              ].join(' ')}
            >
              전체 카테고리
            </button>
            {EXPENSE_CATEGORIES.map((cat) => {
              const active = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  aria-pressed={active}
                  className={[
                    'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer',
                    active
                      ? 'bg-primary-light text-primary-dark'
                      : 'bg-surface-bg text-ink-secondary hover:text-ink-main',
                  ].join(' ')}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filteredAndSorted.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="조건에 맞는 지출 내역이 없어요."
          description="새로운 현금 지출이나 카드 결제 내역을 등록해 보세요."
          action={emptyAction}
        />
      ) : (
        <div className="space-y-6">
          {groupedByDate.map((group) => (
            <div key={group.dateKey} className="space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-ink-secondary">
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-surface-border/70" />
              </div>
              <div className="space-y-2.5">
                {group.items.map((expense) => (
                  <ExpenseItem key={expense.id} expense={expense} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
