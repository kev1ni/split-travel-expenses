import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CopyCheck,
  RefreshCcw,
  AlertCircle,
  Wallet,
  ArrowRightLeft,
  Info,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { InputField } from '../common/InputField';
import { StatusBadge } from '../common/StatusBadge';
import { SplitMemberSelector } from './SplitMemberSelector';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import { CURRENCIES, getCurrencyMeta } from '../../constants/currencies';
import { exchangeRateService } from '../../services/exchangeRateService';
import { convertToKrwExact } from '../../utils/currencyMath';
import {
  formatCurrency,
  formatDateDot,
  formatExchangeRate,
  formatKrw,
  formatOriginalCurrency,
} from '../../utils/formatters';
import { calculateEqualSplit, validateCustomSplits } from '../../utils/splitCalculator';

const STATUS_META = {
  NEW: {
    label: '신규 결제',
    tone: 'green',
    icon: CheckCircle2,
    boxClass: 'bg-primary-light/55 border-primary/50 text-primary-dark',
  },
  DUPLICATE: {
    label: '이미 등록된 결제',
    tone: 'blue',
    icon: CopyCheck,
    boxClass: 'bg-[#EAF4FF] border-[#B8D7FA] text-[#225894]',
  },
  PARSE_FAILED: {
    label: '분석 실패',
    tone: 'red',
    icon: XCircle,
    boxClass: 'bg-[#FFF3F3] border-[#F5C0C0] text-[#B94141]',
  },
  CANCELLED: {
    label: '결제 취소',
    tone: 'red',
    icon: AlertTriangle,
    boxClass: 'bg-[#FFF3F3] border-[#F5C0C0] text-[#B94141]',
  },
  PARTIAL_CANCELLED: {
    label: '부분 취소',
    tone: 'amber',
    icon: RefreshCcw,
    boxClass: 'bg-[#FFF7E6] border-[#F6D79A] text-[#9A5D10]',
  },
};

export function ParsedExpensePreview({
  tripId,
  parseResult,
  members = [],
  onConfirmRegister,
  onReset,
}) {
  const status = parseResult?.status || 'NEW';
  const meta = STATUS_META[status] || STATUS_META.NEW;
  const StatusIcon = meta.icon;
  const parsed = parseResult?.parsed;

  const [merchantName, setMerchantName] = useState(parsed?.merchantName || '');
  const [amount, setAmount] = useState(
    parsed?.amount !== undefined ? String(parsed.amount) : ''
  );
  const [currency, setCurrency] = useState(parsed?.currency || 'KRW');
  const [expenseDate, setExpenseDate] = useState(parsed?.expenseDate || '');
  const [expenseTime, setExpenseTime] = useState(parsed?.expenseTime || '');
  const [eventType, setEventType] = useState(parsed?.eventType || 'PURCHASE');
  const [category, setCategory] = useState(parsed?.suggestedCategory || 'FOOD');
  const [payerMemberId, setPayerMemberId] = useState(members[0]?.id || '');
  const [splitType, setSplitType] = useState('EQUAL');
  const [selectedMemberIds, setSelectedMemberIds] = useState(
    members.map((m) => m.id)
  );
  const [customShares, setCustomShares] = useState({});

  // 외화 카드 결제 시 원화 청구/환산 상태
  const [billedKrwInput, setBilledKrwInput] = useState(
    parsed?.billedKrwAmount ? String(parsed.billedKrwAmount) : ''
  );
  const [exchangeRate, setExchangeRate] = useState(
    parsed?.exchangeRate ? String(parsed.exchangeRate) : '1'
  );
  const [exchangeRateDate, setExchangeRateDate] = useState(
    parsed?.exchangeRateDate || parsed?.expenseDate || ''
  );
  const [isMockRate, setIsMockRate] = useState(Boolean(parsed?.isMockRate));

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!parsed) return;
    setMerchantName(parsed.merchantName || '');
    setAmount(parsed.amount !== undefined ? String(parsed.amount) : '');
    setCurrency(parsed.currency || 'KRW');
    setExpenseDate(parsed.expenseDate || '');
    setExpenseTime(parsed.expenseTime || '');
    setEventType(parsed.eventType || 'PURCHASE');
    setCategory(parsed.suggestedCategory || 'FOOD');
    setPayerMemberId(members[0]?.id || '');
    setSelectedMemberIds(members.map((m) => m.id));
    setSplitType('EQUAL');
    setCustomShares({});
    setBilledKrwInput(parsed.billedKrwAmount ? String(parsed.billedKrwAmount) : '');
    setExchangeRate(parsed.exchangeRate ? String(parsed.exchangeRate) : '1');
    setExchangeRateDate(parsed.exchangeRateDate || parsed.expenseDate || '');
    setIsMockRate(Boolean(parsed.isMockRate));
    setErrors({});
    setSubmitError('');
  }, [parseResult, parsed, members]);

  // 사용자가 통화나 날짜를 변경했을 때 외화면 기준 환율 자동 조회
  useEffect(() => {
    if (!parsed) return;
    if (currency === 'KRW') {
      setExchangeRate('1');
      setBilledKrwInput('');
      setIsMockRate(false);
      return;
    }

    // 파싱 응답의 원래 통화와 같고 이미 환율이 있으면 그대로 사용
    if (currency === parsed.currency && parsed.exchangeRate) {
      return;
    }

    let active = true;
    exchangeRateService
      .getExchangeRate({ base: currency, target: 'KRW', date: expenseDate })
      .then((res) => {
        if (!active) return;
        setExchangeRate(String(res.rate));
        setExchangeRateDate(res.date);
        setIsMockRate(Boolean(res.isMockRate));
      })
      .catch(() => {
        if (!active) return;
        const fallback = getCurrencyMeta(currency).mockRateToKrw;
        setExchangeRate(String(fallback));
        setIsMockRate(true);
      });

    return () => {
      active = false;
    };
  }, [currency, expenseDate, parsed]);

  if (!parseResult) return null;

  // 1) 분석 실패 UI
  if (status === 'PARSE_FAILED') {
    return (
      <Card padding="p-6 sm:p-8" className="space-y-5 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          </div>
        </div>

        <div className={`p-4 rounded-[16px] border flex items-start gap-3 ${meta.boxClass}`}>
          <StatusIcon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-bold">메시지 분석에 실패했어요</p>
            <p className="leading-relaxed">{parseResult.message}</p>
          </div>
        </div>

        <div className="p-4 rounded-[16px] bg-surface-bg border border-surface-border">
          <p className="text-xs font-semibold text-ink-secondary mb-1">입력한 원본 메시지</p>
          <p className="text-sm text-ink-main whitespace-pre-wrap break-words">
            {parseResult.rawMessage}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onReset}>
            다시 입력하기
          </Button>
          <Link
            to={`/trips/${tripId}/expenses/cash`}
            className="inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-[16px] bg-primary hover:bg-primary-hover text-ink-main text-sm font-semibold shadow-green-glow"
          >
            <Wallet className="w-4 h-4" />
            현금 직접 입력으로 이동
          </Link>
        </div>
      </Card>
    );
  }

  // 2) 이미 등록된 결제 (중복) UI
  if (status === 'DUPLICATE') {
    const existing = parseResult.existingExpense;
    return (
      <Card padding="p-6 sm:p-8" className="space-y-5 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          </div>
        </div>

        <div className={`p-4 rounded-[16px] border flex items-start gap-3 ${meta.boxClass}`}>
          <StatusIcon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-bold">이미 등록된 결제 내역이에요</p>
            <p className="leading-relaxed">{parseResult.message}</p>
          </div>
        </div>

        {existing && (
          <div className="p-5 rounded-[18px] bg-surface-bg border border-surface-border space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-primary-dark">기존 등록 지출 정보</span>
              <StatusBadge tone="green">중복 생성 방지됨</StatusBadge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-secondary">가맹점 / 지출명</p>
                <p className="font-bold text-ink-main mt-0.5">
                  {existing.merchantName || existing.title}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-secondary">결제 금액</p>
                <p className="font-extrabold text-ink-main mt-0.5">
                  {formatOriginalCurrency(existing.amount, existing.currency)}
                  {existing.currency !== 'KRW' && existing.amountKrw && (
                    <span className="ml-1.5 text-xs font-semibold text-ink-secondary">
                      ({formatKrw(existing.amountKrw)})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-secondary">결제 일시</p>
                <p className="font-medium text-ink-main mt-0.5">
                  {formatDateDot(existing.expenseDate)}{' '}
                  {existing.expenseTime || ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-secondary">결제자</p>
                <p className="font-medium text-ink-main mt-0.5">{existing.payerName}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onReset}>
            다른 메시지 분석
          </Button>
          <Link
            to={`/trips/${tripId}`}
            className="inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-[16px] bg-primary hover:bg-primary-hover text-ink-main text-sm font-semibold shadow-green-glow"
          >
            여행 지출 목록에서 확인하기
          </Link>
        </div>
      </Card>
    );
  }

  // 3) NEW / CANCELLED / PARTIAL_CANCELLED 확인 및 수정 후 등록 UI
  const currencyMeta = getCurrencyMeta(currency);
  const numericAmount = Number(amount) || 0;
  const isForeignCurrency = currency !== 'KRW';
  const numericRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : currencyMeta.mockRateToKrw;
  const parsedBilledKrw =
    billedKrwInput !== '' && Number(billedKrwInput) > 0
      ? Math.round(Number(billedKrwInput))
      : null;
  const hasConfirmedBilling = Boolean(parsedBilledKrw);
  const estimatedKrw = isForeignCurrency
    ? convertToKrwExact(numericAmount, numericRate)
    : Math.round(numericAmount);
  const displayKrwAmount = isForeignCurrency
    ? hasConfirmedBilling
      ? parsedBilledKrw
      : estimatedKrw
    : Math.round(numericAmount);

  const handleConfirmSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    const nextErrors = {};
    if (!merchantName.trim()) {
      nextErrors.merchantName = '가맹점명을 입력해 주세요.';
    }
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      nextErrors.amount = '올바른 결제 금액을 입력해 주세요.';
    }
    if (!expenseDate) {
      nextErrors.expenseDate = '결제 날짜를 입력해 주세요.';
    }
    if (!payerMemberId) {
      nextErrors.payerMemberId = '결제한 여행 멤버를 선택해 주세요.';
    }
    if (selectedMemberIds.length === 0) {
      nextErrors.splits = '함께 부담할 멤버를 최소 1명 선택해 주세요.';
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
    if (Object.keys(nextErrors).length > 0) return;

    const splitSharesMap =
      splitType === 'EQUAL'
        ? calculateEqualSplit(numericAmount, selectedMemberIds, currency).shares
        : customShares;

    const splits =
      status === 'PARTIAL_CANCELLED' && parsed?.backendAdjustedSplits
        ? parsed.backendAdjustedSplits
        : selectedMemberIds.map((memberId) => ({
            memberId,
            amount: Number(splitSharesMap[memberId] || 0),
          }));

    setIsSubmitting(true);
    try {
      await onConfirmRegister({
        title: merchantName.trim(),
        merchantName: merchantName.trim(),
        amount: numericAmount,
        originalAmount: parsed?.originalAmount || null,
        cancelledAmount: parsed?.cancelledAmount || null,
        currency,
        exchangeRate: isForeignCurrency ? numericRate : 1,
        exchangeRateDate: exchangeRateDate || expenseDate,
        billedKrwAmount: isForeignCurrency ? parsedBilledKrw : null,
        amountKrw: displayKrwAmount,
        expenseDate,
        expenseTime,
        category,
        paymentMethod: 'CARD',
        eventType,
        payerMemberId,
        splitType,
        splits,
        rawCardMessage: parseResult.rawMessage,
        cardEventId: parsed?.cardEventId || null,
        memo:
          status === 'CANCELLED'
            ? '카드 결제 취소 반영'
            : status === 'PARTIAL_CANCELLED'
              ? `부분 취소 반영 (취소 금액 ${formatCurrency(
                  parsed?.cancelledAmount || 0,
                  currency
                )})`
              : isForeignCurrency
                ? hasConfirmedBilling
                  ? '해외 카드 결제 (카드사 실제 원화 청구 금액 반영)'
                  : '해외 카드 결제 (예상 원화 환산 금액 반영)'
                : '카드 알림 메시지 파싱 등록',
      });
    } catch (err) {
      setSubmitError(err.message || '지출 등록 중 오류가 발생했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card padding="p-6 sm:p-8" className="space-y-6 animate-fade-up">
      {/* 상단 상태 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-extrabold text-ink-main">파싱 결과 확인</h3>
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            분석된 내역을 확인하고 필요한 항목을 수정한 뒤 등록 버튼을 눌러 주세요.
          </p>
        </div>
      </div>

      {/* 상태 알림 배너 */}
      <div className={`p-4 rounded-[16px] border flex items-start gap-3 ${meta.boxClass}`}>
        <StatusIcon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm space-y-1">
          <p className="font-bold">{meta.label} 상태로 분석되었어요</p>
          <p className="leading-relaxed">{parseResult.message}</p>
        </div>
      </div>

      {/* 외화 카드 결제 원화 환산 / 실제 청구 금액 카드 */}
      {isForeignCurrency && (
        <div className="p-4 sm:p-5 rounded-[18px] bg-surface-bg border border-surface-border space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-[10px] bg-primary-light text-primary-dark inline-flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-main">
                  {hasConfirmedBilling
                    ? '카드사 실제 원화 청구 금액'
                    : '예상 원화 환산 금액'}
                </p>
                <p className="text-xs text-ink-secondary">
                  {hasConfirmedBilling
                    ? '카드사 청구 원화 금액이 제공되어 우선 적용되었어요.'
                    : `기준일 ${formatDateDot(exchangeRateDate || expenseDate)} · 1 ${currency} = ${formatExchangeRate(numericRate)} KRW`}
                </p>
              </div>
            </div>
            <StatusBadge tone={hasConfirmedBilling ? 'green' : 'amber'}>
              {hasConfirmedBilling ? '청구 금액 확정' : '예상 환산 금액'}
            </StatusBadge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-[14px] bg-surface-card border border-surface-border/80">
              <p className="text-xs text-ink-secondary">외화 결제 금액</p>
              <p className="text-lg font-extrabold text-ink-main tabular-nums mt-0.5">
                {formatOriginalCurrency(numericAmount, currency)}{' '}
                <span className="text-xs font-semibold text-ink-secondary">{currency}</span>
              </p>
            </div>

            <div className="p-3.5 rounded-[14px] bg-primary-light/55 border border-primary/50">
              <p className="text-xs font-semibold text-primary-dark">
                {hasConfirmedBilling ? '실제 원화 청구 금액' : '예상 원화 환산 금액'}
              </p>
              <p className="text-lg font-extrabold text-primary-dark tabular-nums mt-0.5">
                {hasConfirmedBilling ? formatKrw(displayKrwAmount) : `약 ${formatKrw(displayKrwAmount)}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <InputField
              id="parsed-billed-krw"
              label="카드사 원화 청구 금액 (선택 · 우선 적용)"
              type="number"
              min="0"
              step="1"
              placeholder="실제 청구 원화 금액이 있으면 입력"
              value={billedKrwInput}
              onChange={(e) => setBilledKrwInput(e.target.value)}
            />
            <InputField
              id="parsed-exchange-rate"
              label={`적용 환율 (1 ${currency}당 KRW)`}
              type="number"
              min="0"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-ink-secondary">
            <Info className="w-3.5 h-3.5 text-primary-dark shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              {hasConfirmedBilling
                ? '카드사의 실제 원화 청구 금액이 최우선으로 정산에 반영돼요.'
                : isMockRate
                  ? '카드사 청구 금액이 없어 임시 참고 환율로 계산된 예상 원화 금액이에요. 실제 청구액이 확인되면 위에 직접 입력할 수 있어요.'
                  : '카드사 청구 금액이 없어 기준 환율로 계산된 예상 원화 금액이에요.'}
            </p>
          </div>
        </div>
      )}

      {/* 부분 취소 시 백엔드 계산 결과 요약 */}
      {status === 'PARTIAL_CANCELLED' && parsed?.backendAdjustedSplits && (
        <div className="p-4 rounded-[16px] bg-[#FFFDF6] border border-[#F3DFA9] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-[#8E570E]">
              부분 취소 후 최종 정산 금액 (백엔드 계산 결과)
            </p>
            <StatusBadge tone="amber">
              원결제 {formatCurrency(parsed.originalAmount, currency)} → 취소{' '}
              {formatCurrency(parsed.cancelledAmount, currency)}
            </StatusBadge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {parsed.backendAdjustedSplits.map((split) => (
              <div
                key={split.memberId}
                className="p-2.5 rounded-[12px] bg-surface-card border border-[#F3DFA9]/70 text-center"
              >
                <p className="text-xs text-ink-secondary">{split.memberName}</p>
                <p className="text-sm font-extrabold text-ink-main mt-0.5">
                  {formatCurrency(split.amount, currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-[16px] bg-danger/10 text-danger text-sm font-medium"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{submitError}</p>
        </div>
      )}

      <form onSubmit={handleConfirmSubmit} noValidate className="space-y-6">
        {/* 파싱 필드 (수정 가능) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            id="parsed-merchant"
            label="가맹점명"
            required
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            error={errors.merchantName}
          />
          <div className="grid grid-cols-2 gap-3">
            <InputField
              id="parsed-amount"
              label={status === 'PARTIAL_CANCELLED' ? '최종 잔액' : '결제 금액'}
              required
              type="number"
              min="0"
              step={currencyMeta.step}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={errors.amount}
            />
            <div className="space-y-1.5">
              <label htmlFor="parsed-currency" className="block text-sm font-semibold text-ink-main">
                결제 통화
              </label>
              <select
                id="parsed-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full min-h-[48px] px-3 py-3 rounded-[16px] bg-surface-card text-sm text-ink-main border border-surface-border focus:border-primary-dark focus:ring-2 focus:ring-primary/40 cursor-pointer"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <InputField
            id="parsed-date"
            label="결제 날짜"
            required
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            error={errors.expenseDate}
          />

          <div className="grid grid-cols-2 gap-3">
            <InputField
              id="parsed-time"
              label="결제 시간"
              type="time"
              value={expenseTime}
              onChange={(e) => setExpenseTime(e.target.value)}
            />
            <div className="space-y-1.5">
              <label htmlFor="parsed-type" className="block text-sm font-semibold text-ink-main">
                결제 유형
              </label>
              <select
                id="parsed-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full min-h-[48px] px-3 py-3 rounded-[16px] bg-surface-card text-sm text-ink-main border border-surface-border focus:border-primary-dark focus:ring-2 focus:ring-primary/40"
              >
                <option value="PURCHASE">구매</option>
                <option value="CANCELLED">취소</option>
                <option value="PARTIAL_CANCELLED">부분 취소</option>
              </select>
            </div>
          </div>
        </div>

        {/* 원본 메시지 표시 */}
        <div className="p-4 rounded-[16px] bg-surface-bg border border-surface-border">
          <p className="text-xs font-semibold text-ink-secondary mb-1">원본 메시지</p>
          <p className="text-sm text-ink-main whitespace-pre-wrap break-words">
            {parseResult.rawMessage}
          </p>
        </div>

        {/* 결제한 여행 멤버 */}
        <div className="space-y-1.5">
          <label htmlFor="parsed-payer" className="block text-sm font-semibold text-ink-main">
            결제한 여행 멤버 <span className="text-danger">*</span>
          </label>
          <select
            id="parsed-payer"
            value={payerMemberId}
            onChange={(e) => setPayerMemberId(e.target.value)}
            className="w-full min-h-[48px] px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main border border-surface-border focus:border-primary-dark focus:ring-2 focus:ring-primary/40"
          >
            <option value="">결제한 멤버 선택</option>
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

        {/* 지출 카테고리 */}
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-ink-main">지출 카테고리</span>
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

        {/* 함께 부담할 멤버 & 분담 방식 */}
        <SplitMemberSelector
          members={members}
          totalAmount={numericAmount}
          currency={currency}
          splitType={splitType}
          onSplitTypeChange={setSplitType}
          selectedMemberIds={selectedMemberIds}
          onSelectedMemberIdsChange={setSelectedMemberIds}
          customShares={customShares}
          onCustomSharesChange={setCustomShares}
          error={errors.splits}
        />

        {/* 최종 등록 버튼 */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-surface-border">
          <Button type="button" variant="secondary" onClick={onReset}>
            다시 분석하기
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            이 내역으로 지출 등록하기
          </Button>
        </div>
      </form>
    </Card>
  );
}
