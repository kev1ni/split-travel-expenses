import { useState } from 'react';
import { UserCheck, UserRoundPlus, Users, Crown } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { InputField } from '../common/InputField';
import { StatusBadge } from '../common/StatusBadge';

export function MemberList({ members = [], onAddGuest, onOpenInvite }) {
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountMembers = members.filter((m) => m.memberType !== 'GUEST');
  const guestMembers = members.filter((m) => m.memberType === 'GUEST');

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (!trimmed) {
      setGuestError('비회원 친구의 이름을 입력해 주세요.');
      return;
    }
    if (trimmed.length > 20) {
      setGuestError('이름은 20자 이내로 입력해 주세요.');
      return;
    }

    setGuestError('');
    setIsSubmitting(true);
    try {
      await onAddGuest(trimmed);
      setGuestName('');
      setShowGuestForm(false);
    } catch (err) {
      setGuestError(err.message || '비회원 친구를 추가하지 못했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink-main flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-dark" aria-hidden="true" />
            참여 중인 친구 ({members.length}명)
          </h2>
          <p className="text-xs text-ink-secondary mt-0.5">
            가입 회원 {accountMembers.length}명 · 비회원 임시 멤버 {guestMembers.length}명
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onAddGuest && <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setShowGuestForm((prev) => !prev);
              setGuestError('');
            }}
          >
            <UserRoundPlus className="w-4 h-4" aria-hidden="true" />
            비회원 친구 추가
          </Button>}
          {onOpenInvite && (
            <Button size="sm" variant="soft" onClick={onOpenInvite}>
              초대 링크
            </Button>
          )}
        </div>
      </div>

      {/* 비회원 임시 멤버 추가 폼 */}
      {showGuestForm && onAddGuest && (
        <form
          onSubmit={handleGuestSubmit}
          className="mb-4 p-4 rounded-[16px] bg-surface-bg border border-surface-border space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ink-main">비회원 친구 임시 등록</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                N빵트립 계정이 없는 친구도 이름으로 등록해 정산에 포함할 수 있어요. (계정 멤버와 데이터상 구분됩니다)
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2.5">
            <InputField
              id="guest-member-name"
              placeholder="친구 이름 또는 닉네임 (예: 정우성)"
              value={guestName}
              onChange={(e) => {
                setGuestName(e.target.value);
                if (guestError) setGuestError('');
              }}
              error={guestError}
              className="flex-1"
            />
            <div className="flex items-center gap-2 sm:pt-0">
              <Button type="submit" size="md" loading={isSubmitting}>
                추가하기
              </Button>
              <Button
                type="button"
                size="md"
                variant="ghost"
                onClick={() => {
                  setShowGuestForm(false);
                  setGuestName('');
                  setGuestError('');
                }}
              >
                취소
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* 멤버 칩 리스트 */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {members.map((member) => {
          const isGuest = member.memberType === 'GUEST';
          const isOwner = member.role === 'OWNER';

          return (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 p-3.5 rounded-[16px] bg-surface-bg/75 border border-surface-border"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={[
                    'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                    isGuest
                      ? 'bg-[#EEF2EB] text-ink-secondary border border-dashed border-[#BDC9B7]'
                      : 'bg-primary-light text-primary-dark',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {member.name?.slice(0, 1) || '?'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-ink-main truncate">
                      {member.name}
                    </p>
                    {isOwner && (
                      <Crown
                        className="w-3.5 h-3.5 text-[#C98A1A] shrink-0"
                        aria-label="여행 방장"
                      />
                    )}
                  </div>
                  <div className="mt-1">
                    {isGuest ? (
                      <StatusBadge tone="neutral">비회원</StatusBadge>
                    ) : (
                      <StatusBadge tone="green">
                        <UserCheck className="w-3 h-3" aria-hidden="true" />
                        회원
                      </StatusBadge>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
