import { Check, Info, Users } from 'lucide-react';
import { getCurrencyMeta } from '../../constants/currencies';
import { formatCurrency } from '../../utils/formatters';
import { calculateEqualSplit, validateCustomSplits } from '../../utils/splitCalculator';
import { StatusBadge } from '../common/StatusBadge';

export function SplitMemberSelector({
  members = [],
  totalAmount = 0,
  currency = 'KRW',
  splitType = 'EQUAL',
  onSplitTypeChange,
  selectedMemberIds = [],
  onSelectedMemberIdsChange,
  customShares = {},
  onCustomSharesChange,
  error = '',
}) {
  const currencyMeta = getCurrencyMeta(currency);
  const allSelected =
    members.length > 0 && selectedMemberIds.length === members.length;

  const equalResult = calculateEqualSplit(totalAmount, selectedMemberIds, currency);
  const customValidation =
    splitType === 'CUSTOM'
      ? validateCustomSplits(totalAmount, selectedMemberIds, customShares, currency)
      : null;

  const toggleMember = (memberId) => {
    const exists = selectedMemberIds.includes(memberId);
    const nextIds = exists
      ? selectedMemberIds.filter((id) => id !== memberId)
      : [...selectedMemberIds, memberId];
    onSelectedMemberIdsChange(nextIds);
  };

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectedMemberIdsChange([]);
    } else {
      onSelectedMemberIdsChange(members.map((m) => m.id));
    }
  };

  const handleSwitchMode = (nextMode) => {
    onSplitTypeChange(nextMode);
    if (nextMode === 'CUSTOM' && selectedMemberIds.length > 0) {
      // 균등 분할 값을 초기값으로 채워 편의성 제공
      const seeded = { ...customShares };
      selectedMemberIds.forEach((id) => {
        if (seeded[id] === undefined || seeded[id] === '') {
          seeded[id] = equalResult.shares[id] ?? 0;
        }
      });
      onCustomSharesChange(seeded);
    }
  };

  const handleCustomAmountChange = (memberId, rawValue) => {
    onCustomSharesChange({
      ...customShares,
      [memberId]: rawValue,
    });
  };

  return (
    <div className="space-y-4">
      {/* 상단 라벨 & 전체 선택 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold text-ink-main flex items-center gap-1.5">
          <Users className="w-4 h-4 text-primary-dark" aria-hidden="true" />
          함께 부담할 사람
          <span className="text-danger">*</span>
          <span className="text-xs font-medium text-ink-secondary ml-1">
            ({selectedMemberIds.length}/{members.length}명 선택)
          </span>
        </label>
        <button
          type="button"
          onClick={handleSelectAll}
          className="text-xs font-semibold text-primary-dark hover:underline"
        >
          {allSelected ? '전체 해제' : '전체 선택'}
        </button>
      </div>

      {/* 분담 방식 토글 */}
      <div
        role="radiogroup"
        aria-label="분담 방식 선택"
        className="grid grid-cols-2 gap-2 p-1.5 rounded-[16px] bg-surface-bg border border-surface-border"
      >
        <button
          type="button"
          role="radio"
          aria-checked={splitType === 'EQUAL'}
          onClick={() => handleSwitchMode('EQUAL')}
          className={[
            'py-2.5 px-3 rounded-[12px] text-sm font-bold transition-all cursor-pointer',
            splitType === 'EQUAL'
              ? 'bg-surface-card text-primary-dark shadow-soft border border-primary/40'
              : 'text-ink-secondary hover:text-ink-main',
          ].join(' ')}
        >
          균등 분할 (1/N)
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={splitType === 'CUSTOM'}
          onClick={() => handleSwitchMode('CUSTOM')}
          className={[
            'py-2.5 px-3 rounded-[12px] text-sm font-bold transition-all cursor-pointer',
            splitType === 'CUSTOM'
              ? 'bg-surface-card text-primary-dark shadow-soft border border-primary/40'
              : 'text-ink-secondary hover:text-ink-main',
          ].join(' ')}
        >
          직접 금액 입력
        </button>
      </div>

      {/* 멤버 선택 및 금액 목록 */}
      <div className="space-y-2.5">
        {members.map((member) => {
          const isSelected = selectedMemberIds.includes(member.id);
          const isGuest = member.memberType === 'GUEST';
          const equalShare = equalResult.shares[member.id] ?? 0;

          return (
            <div
              key={member.id}
              className={[
                'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-[16px] border transition-colors',
                isSelected
                  ? 'bg-primary-light/35 border-primary'
                  : 'bg-surface-card border-surface-border opacity-75',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => toggleMember(member.id)}
                className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                aria-pressed={isSelected}
              >
                <span
                  className={[
                    'w-6 h-6 rounded-[8px] inline-flex items-center justify-center border transition-colors shrink-0',
                    isSelected
                      ? 'bg-primary border-primary-dark text-ink-main'
                      : 'bg-surface-card border-surface-border text-transparent',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  <Check className="w-4 h-4" strokeWidth={2.6} />
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-ink-main truncate">
                    {member.name}
                  </span>
                  {isGuest && <StatusBadge tone="neutral">비회원</StatusBadge>}
                </div>
              </button>

              {isSelected && (
                <div className="sm:w-44 shrink-0">
                  {splitType === 'EQUAL' ? (
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-primary-dark">
                        {formatCurrency(equalShare, currency)}
                      </span>
                    </div>
                  ) : (
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min="0"
                        step={currencyMeta.step}
                        value={customShares[member.id] ?? ''}
                        onChange={(e) =>
                          handleCustomAmountChange(member.id, e.target.value)
                        }
                        aria-label={`${member.name} 분담 금액`}
                        placeholder="0"
                        className="w-full min-h-[40px] pl-3 pr-12 py-2 rounded-[12px] bg-surface-card border border-surface-border text-right text-sm font-bold text-ink-main focus:border-primary-dark focus:ring-2 focus:ring-primary/40"
                      />
                      <span className="absolute right-3 text-xs font-semibold text-ink-secondary pointer-events-none">
                        {currencyMeta.code === 'KRW' ? '원' : currencyMeta.code}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 계산 요약 / 잔액 배분 규칙 안내 */}
      {selectedMemberIds.length > 0 && splitType === 'EQUAL' && (
        <div className="p-3.5 rounded-[14px] bg-surface-bg border border-surface-border text-xs text-ink-secondary space-y-1">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-primary-dark shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-ink-main font-semibold">
                {selectedMemberIds.length}명 균등 분할 미리보기 (총{' '}
                {formatCurrency(totalAmount, currency)})
              </p>
              {equalResult.remainderMinorUnits > 0 && (
                <p>
                  나누어떨어지지 않는 최소 단위 잔액은 선택된 참여자 앞 순서부터 1 최소 단위(
                  {currencyMeta.decimals === 0 ? '1' : '0.01'} {currencyMeta.code})씩
                  배분했어요.
                </p>
              )}
              <p>실제 저장 시 최종 분담 금액은 백엔드 서버에서 한 번 더 검증돼요.</p>
            </div>
          </div>
        </div>
      )}

      {selectedMemberIds.length > 0 && splitType === 'CUSTOM' && customValidation && (
        <div
          className={[
            'p-3.5 rounded-[14px] border text-xs flex flex-wrap items-center justify-between gap-2',
            customValidation.isValid
              ? 'bg-primary-light/50 border-primary/50 text-primary-dark'
              : 'bg-[#FFF4F4] border-[#F6C8C8] text-[#C84A4A]',
          ].join(' ')}
        >
          <span className="font-semibold">
            {customValidation.isValid
              ? '분담 금액 합계가 총지출과 정확히 일치해요!'
              : customValidation.error}
          </span>
          <span className="font-bold">
            합계 {formatCurrency(customValidation.sumAmount, currency)} / 총{' '}
            {formatCurrency(totalAmount, currency)}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger pl-1">
          {error}
        </p>
      )}
    </div>
  );
}
