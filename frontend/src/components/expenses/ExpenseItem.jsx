import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  Wallet,
  Users,
  MessageSquareText,
  ArrowRightLeft,
} from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';
import { getCategoryMeta } from '../../constants/categories';
import {
  formatDateDot,
  formatExchangeRate,
  formatKrwSymbol,
  formatOriginalCurrency,
} from '../../utils/formatters';

export function ExpenseItem({ expense }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const category = getCategoryMeta(expense.category);
  const CategoryIcon = category.icon;
  const isCard = expense.paymentMethod === 'CARD';
  const isCancelled = expense.eventType === 'CANCELLED';
  const isPartialCancelled = expense.eventType === 'PARTIAL_CANCELLED';
  const isForeign = expense.currency && expense.currency !== 'KRW';
  const isConfirmedBilling =
    expense.krwAmountType === 'CONFIRMED_BILLING' || Boolean(expense.billedKrwAmount);

  return (
    <div
      className={[
        'rounded-[18px] border transition-all overflow-hidden',
        isCancelled
          ? 'bg-[#FFF9F9] border-[#F6D7D7]'
          : isPartialCancelled
            ? 'bg-[#FFFDF7] border-[#F2DFAD]'
            : 'bg-surface-card border-surface-border hover:border-primary/80',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 ${category.bgClass} ${category.textClass}`}
          >
            <CategoryIcon className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p
                className={`text-[15px] font-bold truncate ${
                  isCancelled ? 'line-through text-ink-secondary' : 'text-ink-main'
                }`}
              >
                {expense.title || expense.merchantName}
              </p>
              <StatusBadge tone={isCard ? 'green' : 'neutral'}>
                {isCard ? (
                  <>
                    <CreditCard className="w-3 h-3" aria-hidden="true" />
                    카드
                  </>
                ) : (
                  <>
                    <Wallet className="w-3 h-3" aria-hidden="true" />
                    현금
                  </>
                )}
              </StatusBadge>
              {isCancelled && <StatusBadge tone="red">결제 취소</StatusBadge>}
              {isPartialCancelled && <StatusBadge tone="amber">부분 취소</StatusBadge>}
            </div>

            <p className="text-xs text-ink-secondary mt-1 truncate">
              {category.label} · {expense.payerName} 결제 ·{' '}
              {formatDateDot(expense.expenseDate)}
              {expense.expenseTime ? ` ${expense.expenseTime}` : ''}
            </p>
          </div>
        </div>

        {/* 원래 통화 + 외화일 경우 보조 원화 환산 금액 표시 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <p
              className={`text-[15px] sm:text-base font-extrabold tabular-nums ${
                isCancelled ? 'line-through text-ink-secondary' : 'text-ink-main'
              }`}
            >
              {formatOriginalCurrency(expense.amount, expense.currency || 'KRW')}
            </p>

            {isForeign && expense.amountKrw !== undefined && (
              <p className="text-xs font-medium text-ink-secondary tabular-nums mt-0.5">
                {isConfirmedBilling
                  ? `청구 ${formatKrwSymbol(expense.amountKrw)}`
                  : `약 ${formatKrwSymbol(expense.amountKrw)}`}
              </p>
            )}

            {isPartialCancelled && expense.originalAmount && (
              <p className="text-[11px] text-[#9A5D10] font-medium tabular-nums">
                원결제 {formatOriginalCurrency(expense.originalAmount, expense.currency || 'KRW')}
              </p>
            )}
          </div>
          <span className="text-ink-secondary" aria-hidden="true">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </div>
      </button>

      {/* 상세 정보 & 환율 & 멤버별 분담 내역 */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 border-t border-surface-border/70 bg-surface-bg/55 space-y-3 animate-fade-up">
          {/* 외화 적용 환율 상세 */}
          {isForeign && (
            <div className="text-xs text-ink-secondary bg-surface-card px-3.5 py-2.5 rounded-[12px] border border-surface-border flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink-main">
                <ArrowRightLeft className="w-3.5 h-3.5 text-primary-dark" aria-hidden="true" />
                {isConfirmedBilling
                  ? `카드사 원화 청구 금액 ${formatKrwSymbol(expense.amountKrw)}`
                  : `적용 환율 1 ${expense.currency} = ${formatExchangeRate(expense.exchangeRate)} KRW`}
              </span>
              <span>
                {expense.exchangeRateDate
                  ? `기준일 ${formatDateDot(expense.exchangeRateDate)}`
                  : ''}
                {!isConfirmedBilling && ' · 예상 환산'}
              </span>
            </div>
          )}

          {expense.memo && (
            <p className="text-xs sm:text-sm text-ink-main bg-surface-card px-3.5 py-2.5 rounded-[12px] border border-surface-border">
              <span className="font-semibold text-ink-secondary mr-1.5">메모</span>
              {expense.memo}
            </p>
          )}

          {expense.rawCardMessage && (
            <div className="text-xs text-ink-secondary bg-surface-card px-3.5 py-2.5 rounded-[12px] border border-surface-border flex items-start gap-2">
              <MessageSquareText className="w-4 h-4 text-primary-dark shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-ink-main mb-0.5">원본 카드 알림</p>
                <p className="break-words">{expense.rawCardMessage}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold text-ink-secondary flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary-dark" aria-hidden="true" />
              멤버별 분담 내역 ({expense.splitType === 'CUSTOM' ? '직접 입력' : '균등 분할'})
            </p>
            {expense.splits && expense.splits.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {expense.splits.map((split) => (
                  <div
                    key={split.memberId}
                    className="px-3 py-2 rounded-[12px] bg-surface-card border border-surface-border space-y-0.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink-main truncate">
                        {split.memberName}
                      </span>
                      <span className="font-bold text-primary-dark tabular-nums shrink-0">
                        {split.amount == null ? formatKrwSymbol(split.amountKrw) : formatOriginalCurrency(split.amount, expense.currency || 'KRW')}
                      </span>
                    </div>
                    {isForeign && split.amount != null && split.amountKrw !== undefined && (
                      <p className="text-[11px] text-ink-secondary text-right tabular-nums">
                        약 {formatKrwSymbol(split.amountKrw)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-secondary">분담 상세 정보가 없어요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
