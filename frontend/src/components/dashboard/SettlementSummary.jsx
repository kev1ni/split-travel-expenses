import { ArrowUpRight, ArrowDownLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { StatusBadge } from '../common/StatusBadge';
import { formatKrw } from '../../utils/formatters';

/**
 * 원화(KRW) 기준 정산 결과 카드 (여행 상세 페이지 공용)
 * - 총 여행 경비(KRW)
 * - 개인별 결제 금액(KRW) / 개인별 부담 금액(KRW)
 * - 최종 송금 금액(KRW)
 * 실제 정산 계산은 백엔드에서 수행하며, 서버에서 반환한 확정 정산 결과를 표시합니다.
 */
export function SettlementSummary({
  settlements = [],
  memberSummaries = [],
  totalAmountKrw = null,
  title = '정산 결과 (KRW 기준)',
  subtitle = '원화 환산 금액 기준으로 확정된 정산 결과예요',
}) {
  const pendingSettlements = settlements.filter((s) => s.status !== 'COMPLETED');

  return (
    <Card className="h-full flex flex-col space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink-main">{title}</h2>
          <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p>
        </div>
        {totalAmountKrw !== null && (
          <div className="text-right shrink-0">
            <p className="text-[11px] font-medium text-ink-secondary">총 여행 경비</p>
            <p className="text-base font-extrabold text-ink-main tabular-nums">
              {formatKrw(totalAmountKrw)}
            </p>
          </div>
        )}
      </div>

      {/* 개인별 결제 금액 / 부담 금액 (KRW) */}
      {memberSummaries.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-ink-secondary">
            개인별 결제 · 부담 금액 (KRW)
          </h3>
          <div className="rounded-[16px] bg-surface-bg border border-surface-border divide-y divide-surface-border/70">
            {memberSummaries.map((member) => {
              const net = Number(member.netAmountKrw || 0);
              return (
                <div
                  key={member.memberId}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-ink-main truncate">
                      {member.memberName}
                    </span>
                    {member.memberType === 'GUEST' && (
                      <StatusBadge tone="neutral">비회원</StatusBadge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 shrink-0 tabular-nums">
                    <span className="text-ink-secondary">
                      결제 <strong className="text-ink-main">{formatKrw(member.paidAmountKrw)}</strong>
                    </span>
                    <span className="text-ink-secondary">
                      부담 <strong className="text-ink-main">{formatKrw(member.shareAmountKrw)}</strong>
                    </span>
                    <span
                      className={`font-extrabold min-w-[74px] text-right ${
                        net > 0
                          ? 'text-primary-dark'
                          : net < 0
                            ? 'text-[#C84A4A]'
                            : 'text-ink-secondary'
                      }`}
                    >
                      {net > 0 ? `+${formatKrw(net)}` : net < 0 ? `-${formatKrw(Math.abs(net))}` : '0원'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 최종 송금 금액 (KRW) */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-ink-secondary">최종 송금 금액 (KRW)</h3>
        {pendingSettlements.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="정산할 송금 내역이 없어요"
            description="모든 정산이 완료되었거나 송금이 필요한 금액이 없어요."
          />
        ) : (
          <ul className="space-y-2.5">
            {pendingSettlements.map((item) => {
              const isSend = item.direction === 'SEND';
              const displayLabel =
                item.fromName && item.toName
                  ? `${item.fromName} → ${item.toName}`
                  : item.counterpartyName;

              return (
                <li
                  key={item.id}
                  className={[
                    'flex items-center justify-between gap-3 p-3.5 rounded-[16px] border',
                    isSend
                      ? 'bg-[#FFF9F9] border-[#F6DFDF]'
                      : 'bg-surface-bg border-surface-border',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={[
                        'w-9 h-9 rounded-[12px] inline-flex items-center justify-center shrink-0',
                        isSend
                          ? 'bg-[#FDE8E8] text-[#C84A4A]'
                          : 'bg-primary-light text-primary-dark',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {isSend ? (
                        <ArrowUpRight className="w-5 h-5" />
                      ) : (
                        <ArrowDownLeft className="w-5 h-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink-main truncate">
                        {displayLabel}
                      </p>
                      <p className="text-xs text-ink-secondary">
                        {isSend ? '송금 필요' : '입금 예정'}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-sm font-extrabold tabular-nums shrink-0 ${
                      isSend ? 'text-[#C84A4A]' : 'text-primary-dark'
                    }`}
                  >
                    {formatKrw(item.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-ink-secondary pt-1">
        <Sparkles className="w-3.5 h-3.5 text-primary-dark shrink-0" aria-hidden="true" />
        <span>외화 지출은 원화 환산 금액(KRW)을 기준으로 백엔드에서 최종 정산됩니다.</span>
      </div>
    </Card>
  );
}
