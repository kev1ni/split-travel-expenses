import { useEffect, useState } from 'react';
import {
  Wallet,
  AlertCircle,
  ArrowRightLeft,
  Pencil,
  RotateCcw,
  Loader2,
  Info,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { InputField } from '../common/InputField';
import { SplitMemberSelector } from './SplitMemberSelector';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import { CURRENCIES, getCurrencyMeta } from '../../constants/currencies';
import { exchangeRateService } from '../../services/exchangeRateService';
import { convertToKrwExact } from '../../utils/currencyMath';
import {
  formatDateDot,
  formatExchangeRate,
  formatKrw,
  getTodayIsoDate,
} from '../../utils/formatters';
import { calculateEqualSplit, validateCustomSplits } from '../../utils/splitCalculator';

export function CashExpenseForm({
  members = [],
  defaultCurrency = 'KRW',
  onSubmit,
  onCancel,
}) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency || 'KRW');
  const [expenseDate, setExpenseDate] = useState(getTodayIsoDate());
  const [category, setCategory] = useState('FOOD');
  const [payerMemberId, setPayerMemberId] = useState(members[0]?.id || '');
  const [splitType, setSplitType] = useState('EQUAL');
  const [selectedMemberIds, setSelectedMemberIds] = useState(
    members.map((m) => m.id)
  );
  const [customShares, setCustomShares] = useState({});
  const [memo, setMemo] = useState('');

  // 환율 상태
  const [rateInfo, setRateInfo] = useState({
    rate: 1,
    date: getTodayIsoDate(),
    isMockRate: false,
  });
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [customRateInput, setCustomRateInput] = useState('');
  const [isCustomRate, setIsCustomRate] = useState(false);

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currencyMeta = getCurrencyMeta(currency);
  const numericAmount = Number(amount) || 0;
  const isForeignCurrency = currency !== 'KRW';

  // 결제 통화 또는 날짜가 바뀔 때 환율 조회
  useEffect(() => {
    if (currency === 'KRW') {
      setRateInfo({ rate: 1, date: expenseDate, isMockRate: false });
      setIsCustomRate(false);
      setIsEditingRate(false);
      setCustomRateInput('');
      return;
    }

    let active = true;
    setIsLoadingRate(true);
    exchangeRateService
      .getExchangeRate({ base: currency, target: 'KRW', date: expenseDate })
      .then((res) => {
        if (!active) return;
        setRateInfo({
          rate: res.rate,
          date: res.date,
          isMockRate: Boolean(res.isMockRate),
        });
        setCustomRateInput(String(res.rate));
        setIsCustomRate(false);
        setIsEditingRate(false);
      })
      .catch(() => {
        if (!active) return;
        const fallback = getCurrencyMeta(currency).mockRateToKrw;
        setRateInfo({
          rate: fallback,
          date: expenseDate,
          isMockRate: true,
        });
        setCustomRateInput(String(fallback));
      })
      .finally(() => {
        if (active) setIsLoadingRate(false);
      });

    return () => {
      active = false;
    };
  }, [currency, expenseDate]);

  const effectiveRate = isForeignCurrency
    ? isCustomRate && Number(customRateInput) > 0
      ? Number(customRateInput)
      : rateInfo.rate
    : 1;

  const estimatedKrw = isForeignCurrency
    ? convertToKrwExact(numericAmount, effectiveRate)
    : Math.round(numericAmount);

  const handleApplyCustomRate = () => {
    const parsed = Number(customRateInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setErrors((prev) => ({ ...prev, exchangeRate: '0보다 큰 환율을 입력해 주세요.' }));
      return;
    }
    setErrors((prev) => ({ ...prev, exchangeRate: '' }));
    setIsCustomRate(true);
    setIsEditingRate(false);
  };

  const handleResetRate = () => {
    setCustomRateInput(String(rateInfo.rate));
    setIsCustomRate(false);
    setIsEditingRate(false);
    setErrors((prev) => ({ ...prev, exchangeRate: '' }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!title.trim()) {
      nextErrors.title = '지출명을 입력해 주세요.';
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      nextErrors.amount = '0보다 큰 결제 금액을 입력해 주세요.';
    }
    if (!expenseDate) {
      nextErrors.expenseDate = '지출 날짜를 선택해 주세요.';
    }
    if (isForeignCurrency && (!Number.isFinite(effectiveRate) || effectiveRate <= 0)) {
      nextErrors.exchangeRate = '유효한 적용 환율을 입력해 주세요.';
    }
    if (!payerMemberId) {
      nextErrors.payerMemberId = '결제한 사람을 선택해 주세요.';
    }
    if (selectedMemberIds.length === 0) {
      nextErrors.splits = '함께 부담할 사람을 최소 1명 이상 선택해 주세요.';
    } else if (splitType === 'CUSTOM') {
      const check = validateCustomSplits(
        numericAmount,
        selectedMemberIds,
        customShares,
        currency
      );
      if (!check.isValid) {
        nextErrors.splits = check.error;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    const splitSharesMap =
      splitType === 'EQUAL'
        ? calculateEqualSplit(numericAmount, selectedMemberIds, currency).shares
        : customShares;

    const splits = selectedMemberIds.map((memberId) => ({
      memberId,
      amount: Number(splitSharesMap[memberId] || 0),
    }));

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        merchantName: title.trim(),
        amount: numericAmount,
        currency,
        exchangeRate: effectiveRate,
        exchangeRateDate: rateInfo.date || expenseDate,
        isCustomExchangeRate: isCustomRate,
        amountKrw: estimatedKrw,
        expenseDate,
        category,
        paymentMethod: 'CASH',
        eventType: 'PURCHASE',
        payerMemberId,
        splitType,
        splits,
        memo: memo.trim(),
      });
    } catch (err) {
      setSubmitError(err.message || '지출을 등록하는 중 오류가 발생했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card padding="p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-5 mb-6 border-b border-surface-border">
        <div className="w-12 h-12 rounded-[16px] bg-primary-light text-primary-dark flex items-center justify-center shrink-0">
          <Wallet className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-ink-main">현금 지출 직접 입력</h2>
          <p className="text-sm text-ink-secondary mt-0.5">
            외화 현금 지출도 적용 환율과 예상 원화 금액을 실시간으로 확인하며 기록해요.
          </p>
        </div>
      </div>

      {submitError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 p-4 rounded-[16px] bg-danger/10 text-danger text-sm font-medium"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{submitError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* 지출명 */}
        <InputField
          id="cash-title"
          label="지출명"
          required
          placeholder="예: 라멘, 카페, 공항 버스 티켓"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
          }}
          error={errors.title}
        />

        {/* 결제 금액 + 결제 통화 + 날짜 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InputField
            id="cash-amount"
            label="결제 금액"
            required
            type="number"
            min="0"
            step={currencyMeta.step}
            placeholder={currencyMeta.decimals === 0 ? '3000' : '25.50'}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (errors.amount) setErrors((prev) => ({ ...prev, amount: '' }));
            }}
            error={errors.amount}
          />

          <div className="space-y-1.5">
            <label htmlFor="cash-currency" className="block text-sm font-semibold text-ink-main">
              결제 통화 <span className="text-danger">*</span>
            </label>
            <select
              id="cash-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full min-h-[48px] px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main border border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              {CURRENCIES.map((cur) => (
                <option key={cur.code} value={cur.code}>
                  {cur.code} ({cur.symbol} {cur.name})
                </option>
              ))}
            </select>
          </div>

          <InputField
            id="cash-date"
            label="지출 날짜"
            required
            type="date"
            value={expenseDate}
            onChange={(e) => {
              setExpenseDate(e.target.value);
              if (errors.expenseDate)
                setErrors((prev) => ({ ...prev, expenseDate: '' }));
            }}
            error={errors.expenseDate}
          />
        </div>

        {/* 외화 선택 시 환율 & 원화 환산 실시간 미리보기 카드 */}
        {isForeignCurrency && (
          <div className="p-4 sm:p-5 rounded-[18px] bg-surface-bg border border-surface-border space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-[10px] bg-primary-light text-primary-dark inline-flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-main">
                    적용 환율 및 원화 환산 미리보기
                  </p>
                  <p className="text-xs text-ink-secondary">
                    환율 기준일: {formatDateDot(rateInfo.date || expenseDate)}
                    {isCustomRate && ' · 사용자 직접 수정'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isCustomRate && (
                  <button
                    type="button"
                    onClick={handleResetRate}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] bg-surface-card border border-surface-border text-xs font-semibold text-ink-secondary hover:text-ink-main cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    초기화
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCustomRateInput(String(effectiveRate));
                    setIsEditingRate((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[10px] bg-surface-card border border-surface-border text-xs font-semibold text-primary-dark hover:bg-primary-light/50 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  {isEditingRate ? '수정 닫기' : '환율 수정'}
                </button>
              </div>
            </div>

            {isLoadingRate ? (
              <div className="flex items-center gap-2 text-xs text-ink-secondary py-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary-dark" />
                기준 환율을 불러오고 있어요...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 rounded-[14px] bg-surface-card border border-surface-border/80">
                    <p className="text-xs text-ink-secondary">결제 금액</p>
                    <p className="text-base font-extrabold text-ink-main tabular-nums mt-0.5">
                      {numericAmount > 0
                        ? `${numericAmount.toLocaleString('ko-KR', {
                            minimumFractionDigits: currencyMeta.decimals,
                            maximumFractionDigits: currencyMeta.decimals,
                          })} ${currency}`
                        : `0 ${currency}`}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[14px] bg-surface-card border border-surface-border/80">
                    <p className="text-xs text-ink-secondary">적용 환율</p>
                    <p className="text-base font-extrabold text-ink-main tabular-nums mt-0.5">
                      1 {currency} = {formatExchangeRate(effectiveRate)} KRW
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[14px] bg-primary-light/55 border border-primary/50">
                    <p className="text-xs font-semibold text-primary-dark">예상 원화 금액</p>
                    <p className="text-base font-extrabold text-primary-dark tabular-nums mt-0.5">
                      {formatKrw(estimatedKrw)}
                    </p>
                  </div>
                </div>

                {/* 환율 직접 수정 입력창 */}
                {isEditingRate && (
                  <div className="p-3.5 rounded-[14px] bg-surface-card border border-surface-border flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
                    <InputField
                      id="cash-custom-rate"
                      label={`직접 적용할 환율 (1 ${currency}당 KRW)`}
                      type="number"
                      min="0"
                      step="0.0001"
                      value={customRateInput}
                      onChange={(e) => setCustomRateInput(e.target.value)}
                      error={errors.exchangeRate}
                      className="flex-1"
                    />
                    <Button type="button" variant="primary" size="md" onClick={handleApplyCustomRate}>
                      환율 적용
                    </Button>
                  </div>
                )}

                {/* 예상/임시 환율 안내 (Mock 환율을 실제 실시간 환율로 오인 방지) */}
                <div className="flex items-start gap-2 text-xs text-ink-secondary">
                  <Info className="w-3.5 h-3.5 text-primary-dark shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="leading-relaxed">
                    {isCustomRate
                      ? '직접 입력한 환율 기준으로 원화 환산 금액이 계산되었어요.'
                      : rateInfo.isMockRate
                        ? '실제 실시간 환율이 아닌 임시 참고 환율로 계산된 예상 금액이에요. 실제 환전 환율이 있다면 위에서 직접 수정해 주세요.'
                        : '기준일 환율로 계산된 예상 원화 금액이며, 최종 정산 금액은 백엔드에서 확정됩니다.'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* 카테고리 */}
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-ink-main">
            카테고리 <span className="text-danger">*</span>
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {EXPENSE_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const selected = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  aria-pressed={selected}
                  className={[
                    'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-[16px] border text-xs font-bold transition-all cursor-pointer',
                    selected
                      ? 'bg-primary-light border-primary-dark text-primary-dark shadow-soft'
                      : 'bg-surface-bg/70 border-surface-border text-ink-secondary hover:border-primary',
                  ].join(' ')}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 결제한 사람 */}
        <div className="space-y-1.5">
          <label htmlFor="cash-payer" className="block text-sm font-semibold text-ink-main">
            결제한 사람 <span className="text-danger">*</span>
          </label>
          <select
            id="cash-payer"
            value={payerMemberId}
            onChange={(e) => {
              setPayerMemberId(e.target.value);
              if (errors.payerMemberId)
                setErrors((prev) => ({ ...prev, payerMemberId: '' }));
            }}
            className="w-full min-h-[48px] px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main border border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40"
          >
            <option value="">결제한 멤버를 선택하세요</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.memberType === 'GUEST' ? ' (비회원)' : ''}
              </option>
            ))}
          </select>
          {errors.payerMemberId && (
            <p role="alert" className="text-xs font-medium text-danger pl-1">
              {errors.payerMemberId}
            </p>
          )}
        </div>

        {/* 함께 부담할 사람 & 분담 방식 */}
        <SplitMemberSelector
          members={members}
          totalAmount={numericAmount}
          currency={currency}
          splitType={splitType}
          onSplitTypeChange={setSplitType}
          selectedMemberIds={selectedMemberIds}
          onSelectedMemberIdsChange={(ids) => {
            setSelectedMemberIds(ids);
            if (errors.splits) setErrors((prev) => ({ ...prev, splits: '' }));
          }}
          customShares={customShares}
          onCustomSharesChange={(next) => {
            setCustomShares(next);
            if (errors.splits) setErrors((prev) => ({ ...prev, splits: '' }));
          }}
          error={errors.splits}
        />

        {/* 메모 (선택) */}
        <div className="space-y-1.5">
          <label htmlFor="cash-memo" className="block text-sm font-semibold text-ink-main">
            메모 <span className="text-xs font-normal text-ink-secondary">(선택)</span>
          </label>
          <textarea
            id="cash-memo"
            rows={3}
            placeholder="영수증 참고 사항이나 특이사항을 남겨 보세요."
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main placeholder:text-ink-secondary/75 border border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40 resize-none"
          />
        </div>

        {/* 제출/취소 버튼 */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-surface-border">
          <Button type="button" variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            지출 등록
          </Button>
        </div>
      </form>
    </Card>
  );
}
