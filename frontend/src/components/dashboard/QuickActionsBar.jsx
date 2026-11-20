import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, CreditCard, UserPlus, Info } from 'lucide-react';

export function QuickActionsBar({ selectedTrip, onOpenInvite }) {
  const navigate = useNavigate();
  const [noTripNotice, setNoTripNotice] = useState(false);

  const handleAction = (type) => {
    if (!selectedTrip) {
      setNoTripNotice(true);
      return;
    }

    setNoTripNotice(false);
    if (type === 'cash') {
      navigate(`/trips/${selectedTrip.id}/expenses/cash`);
    } else if (type === 'card') {
      navigate(`/trips/${selectedTrip.id}/expenses/card`);
    } else if (type === 'invite') {
      onOpenInvite(selectedTrip);
    }
  };

  const actions = [
    {
      id: 'cash',
      label: '현금 입력',
      icon: Wallet,
    },
    {
      id: 'card',
      label: '카드 등록',
      icon: CreditCard,
    },
    {
      id: 'invite',
      label: '친구 초대',
      icon: UserPlus,
    },
  ];

  return (
    <section aria-label="빠른 실행" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-secondary">빠른 실행</h3>
        {selectedTrip && (
          <span className="text-xs font-medium text-ink-secondary truncate max-w-[200px]">
            {selectedTrip.title} 기준
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {actions.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleAction(id)}
            className="group bg-surface-card hover:bg-primary-light/35 border border-surface-border hover:border-primary/80 rounded-[18px] p-4 sm:p-5 shadow-soft transition-all duration-150 flex flex-col items-center justify-center gap-2.5 cursor-pointer"
          >
            <span className="w-11 h-11 rounded-[14px] bg-surface-bg group-hover:bg-primary-light text-primary-dark flex items-center justify-center transition-colors">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <span className="text-xs sm:text-sm font-bold text-ink-main">
              {label}
            </span>
          </button>
        ))}
      </div>

      {noTripNotice && !selectedTrip && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-[14px] bg-surface-card border border-surface-border text-xs sm:text-sm text-ink-secondary"
        >
          <span className="inline-flex items-center gap-2">
            <Info className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
            먼저 여행을 선택하거나 새 여행을 만들어 주세요.
          </span>
          <Link
            to="/trips/new"
            className="font-bold text-primary-dark hover:underline"
          >
            여행 만들기
          </Link>
        </div>
      )}
    </section>
  );
}
