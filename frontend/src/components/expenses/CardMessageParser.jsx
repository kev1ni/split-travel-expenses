import { CreditCard, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { MOCK_CARD_PARSE_PRESETS } from '../../services/mockData';
import { isMockMode } from '../../services/apiClient';

export function CardMessageParser({
  rawMessage,
  onRawMessageChange,
  onParse,
  isParsing,
  parseError,
  onSelectPreset,
}) {
  const mockMode = isMockMode();

  const handleSubmit = (e) => {
    e.preventDefault();
    onParse('AUTO');
  };

  return (
    <Card padding="p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-5 mb-5 border-b border-surface-border">
        <div className="w-12 h-12 rounded-[16px] bg-primary text-ink-main flex items-center justify-center shadow-green-glow shrink-0">
          <CreditCard className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-ink-main">카드 결제 메시지 분석</h2>
          <p className="text-sm text-ink-secondary mt-0.5">
            카드 승인 문자(RCS/SMS) 또는 앱 푸시 알림을 붙여넣으면 지출 항목을 자동으로 채워드려요.
          </p>
        </div>
      </div>

      {/* 예시 메시지 빠르게 입력 */}
      {mockMode && (
        <div className="mb-5 p-4 rounded-[16px] bg-surface-bg border border-surface-border space-y-2.5">
          <p className="text-xs font-bold text-ink-secondary">
            예시 메시지 빠르게 입력
          </p>
          <div className="flex flex-wrap gap-2">
            {MOCK_CARD_PARSE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-card hover:bg-primary-light border border-surface-border text-ink-main transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="card-raw-message"
            className="block text-sm font-semibold text-ink-main"
          >
            카드 결제 알림 메시지
          </label>
          <textarea
            id="card-raw-message"
            rows={4}
            value={rawMessage}
            onChange={(e) => onRawMessageChange(e.target.value)}
            placeholder="[카드승인] 25,000원 / OO식당 / 11월 19일 12:30"
            className="w-full px-4 py-3.5 rounded-[16px] bg-surface-card text-[15px] text-ink-main placeholder:text-ink-secondary/75 border border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40 resize-y"
          />
          <p className="text-xs text-ink-secondary">
            RCS 메시지와 앱 푸시가 중복으로 수신되어도 백엔드 CARD_EVENTS 검증을 통해 중복 등록을 방지해요.
          </p>
        </div>

        {parseError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-[14px] bg-danger/10 text-danger text-sm font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{parseError}</p>
          </div>
        )}

        {/* 분석 중 상태 */}
        {isParsing ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-[18px] bg-primary-light/40 border border-primary/40"
          >
            <div className="w-12 h-12 rounded-2xl bg-surface-card flex items-center justify-center shadow-soft">
              <Loader2 className="w-6 h-6 text-primary-dark animate-spin" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-primary-dark">
              결제 내역을 분석하고 있어요...
            </p>
            <p className="text-xs text-ink-secondary">
              가맹점명, 금액, 중복 및 취소 여부를 확인하는 중입니다.
            </p>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              결제 메시지 분석하기
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
