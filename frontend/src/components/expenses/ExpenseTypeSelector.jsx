import { useNavigate } from 'react-router-dom';
import { Wallet, CreditCard, ArrowRight, Sparkles } from 'lucide-react';
import { Modal } from '../common/Modal';

export function ExpenseTypeSelector({ isOpen, onClose, tripId, tripTitle }) {
  const navigate = useNavigate();

  const handleSelect = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="지출 등록 방식 선택"
      subtitle={
        tripTitle
          ? `'${tripTitle}'에 새로운 지출을 어떤 방식으로 기록할까요?`
          : '새로운 여행 지출을 기록할 방식을 선택해 주세요.'
      }
      maxWidth="max-w-2xl"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 현금 직접 입력 */}
        <button
          type="button"
          onClick={() => handleSelect(`/trips/${tripId}/expenses/cash`)}
          className="group text-left p-6 rounded-[20px] bg-surface-bg hover:bg-primary-light/55 border-2 border-surface-border hover:border-primary transition-all duration-200 flex flex-col justify-between gap-5 cursor-pointer"
        >
          <div className="space-y-3.5">
            <div className="w-14 h-14 rounded-[18px] bg-surface-card border border-surface-border text-primary-dark flex items-center justify-center shadow-soft group-hover:scale-105 transition-transform">
              <Wallet className="w-7 h-7" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-ink-main">
                현금 직접 입력
              </h3>
              <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                사용자가 결제 금액, 통화, 카테고리, 분담 멤버를 직접 입력해 등록해요.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-dark">
            직접 입력하기
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </span>
        </button>

        {/* 카드 결제 등록 */}
        <button
          type="button"
          onClick={() => handleSelect(`/trips/${tripId}/expenses/card`)}
          className="group text-left p-6 rounded-[20px] bg-surface-bg hover:bg-primary-light/55 border-2 border-surface-border hover:border-primary transition-all duration-200 flex flex-col justify-between gap-5 cursor-pointer relative"
        >
          <div className="space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="w-14 h-14 rounded-[18px] bg-primary text-ink-main flex items-center justify-center shadow-green-glow group-hover:scale-105 transition-transform">
                <CreditCard className="w-7 h-7" aria-hidden="true" />
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-card border border-surface-border text-[11px] font-bold text-primary-dark">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                자동 입력
              </span>
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-ink-main">
                카드 결제 등록
              </h3>
              <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                휴대폰을 한 번 연결하면 카드 앱의 결제 승인 푸시가 여행 지출로 자동 등록돼요.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-dark">
            카드 지출 열기
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </span>
        </button>
      </div>
    </Modal>
  );
}
