import { PieChart, Wallet, CreditCard } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import { formatKrw } from '../../utils/formatters';
import { countsTowardsExpenseTotal } from '../../utils/currencyMath';

export function ExpenseStatistics({ expenses = [] }) {
  const validExpenses = expenses.filter(countsTowardsExpenseTotal);
  const totalKrw = validExpenses.reduce(
    (sum, item) => sum + Number(item.amountKrw ?? item.amount ?? 0),
    0
  );

  const cashTotal = validExpenses
    .filter((e) => e.paymentMethod === 'CASH')
    .reduce((sum, item) => sum + Number(item.amountKrw ?? item.amount ?? 0), 0);

  const cardTotal = validExpenses
    .filter((e) => e.paymentMethod === 'CARD')
    .reduce((sum, item) => sum + Number(item.amountKrw ?? item.amount ?? 0), 0);

  const categoryStats = EXPENSE_CATEGORIES.map((cat) => {
    const amount = validExpenses
      .filter((e) => e.category === cat.id)
      .reduce((sum, item) => sum + Number(item.amountKrw ?? item.amount ?? 0), 0);
    const percent = totalKrw > 0 ? Math.round((amount / totalKrw) * 100) : 0;
    return { ...cat, amount, percent };
  })
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const cashPercent = totalKrw > 0 ? Math.round((cashTotal / totalKrw) * 100) : 0;
  const cardPercent = totalKrw > 0 ? 100 - cashPercent : 0;

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink-main flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary-dark" aria-hidden="true" />
            지출 통계
          </h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            카테고리 및 결제 수단별 지출 비중을 확인해요
          </p>
        </div>
      </div>

      {validExpenses.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="아직 통계를 낼 지출이 없어요."
          description="지출을 등록하면 카테고리별 소비 비율이 자동으로 시각화돼요."
        />
      ) : (
        <div className="space-y-5">
          {/* 현금 vs 카드 비율 바 */}
          <div className="p-4 rounded-[16px] bg-surface-bg border border-surface-border space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 text-primary-dark">
                <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                카드 {cardPercent}% ({formatKrw(cardTotal)})
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                현금 {cashPercent}% ({formatKrw(cashTotal)})
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#E6EFDB] overflow-hidden flex">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${cardPercent}%` }}
                aria-label={`카드 결제 ${cardPercent}%`}
              />
              <div
                className="h-full bg-[#5B8E38] transition-all duration-300"
                style={{ width: `${cashPercent}%` }}
                aria-label={`현금 결제 ${cashPercent}%`}
              />
            </div>
          </div>

          {/* 카테고리별 바 차트 */}
          <ul className="space-y-3">
            {categoryStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <li key={stat.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-2 font-semibold text-ink-main">
                      <span
                        className={`w-7 h-7 rounded-[10px] inline-flex items-center justify-center ${stat.bgClass} ${stat.textClass}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      {stat.label}
                    </span>
                    <span className="font-bold text-ink-main">
                      {formatKrw(stat.amount)}{' '}
                      <span className="text-xs font-medium text-ink-secondary">
                        ({stat.percent}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-surface-bg overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(stat.percent, 4)}%`,
                        backgroundColor: stat.barColor,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
