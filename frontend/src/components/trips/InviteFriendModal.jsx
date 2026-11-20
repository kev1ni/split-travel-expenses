import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Link2, KeyRound, ExternalLink, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { tripService } from '../../services/tripService';

export function InviteFriendModal({ isOpen, onClose, trip }) {
  const [invitation, setInvitation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState(null); // 'code' | 'link' | null

  useEffect(() => {
    if (!isOpen || !trip?.id) return;

    let active = true;
    setIsLoading(true);
    setError('');
    setCopiedField(null);

    tripService
      .createInvitation(trip.id)
      .then((data) => {
        if (active) setInvitation(data);
      })
      .catch((err) => {
        if (active) {
          setError(err.message || '초대 코드를 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, trip?.id]);

  // 실제 서비스 주소 하드코딩 방지: 현재 브라우저 origin 기반으로 링크 구성
  const inviteCode = invitation?.inviteCode || '';
  const invitePath = inviteCode ? `/invite/${inviteCode}` : '';
  const inviteUrl =
    inviteCode && typeof window !== 'undefined'
      ? `${window.location.origin}${invitePath}`
      : '';

  const handleCopy = async (text, field) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2200);
    } catch {
      setError('클립보드 복사에 실패했어요. 직접 선택해서 복사해 주세요.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="친구 초대하기"
      subtitle="초대 코드 또는 초대 링크를 친구에게 공유해 여행에 함께 참여하세요."
    >
      {isLoading ? (
        <LoadingSpinner label="초대 코드를 요청하고 있어요..." />
      ) : error ? (
        <div className="space-y-4">
          <div
            role="alert"
            className="flex items-start gap-2.5 p-4 rounded-[16px] bg-danger/10 text-danger text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 여행 이름 */}
          <div className="p-4 rounded-[16px] bg-surface-bg border border-surface-border">
            <p className="text-xs font-medium text-ink-secondary">초대할 여행</p>
            <p className="text-base font-bold text-ink-main mt-0.5">
              {invitation?.tripTitle || trip?.title}
            </p>
          </div>

          {/* 초대 코드 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-ink-main flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-primary-dark" aria-hidden="true" />
              초대 코드
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-[16px] bg-surface-bg border border-surface-border font-mono text-base font-bold tracking-wider text-ink-main select-all">
                {inviteCode}
              </div>
              <Button
                variant={copiedField === 'code' ? 'soft' : 'primary'}
                size="md"
                onClick={() => handleCopy(inviteCode, 'code')}
              >
                {copiedField === 'code' ? (
                  <>
                    <Check className="w-4 h-4" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    코드 복사
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 초대 링크 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-ink-main flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-primary-dark" aria-hidden="true" />
              초대 링크
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-[16px] bg-surface-bg border border-surface-border text-sm text-ink-secondary truncate select-all">
                {inviteUrl}
              </div>
              <Button
                variant={copiedField === 'link' ? 'soft' : 'secondary'}
                size="md"
                onClick={() => handleCopy(inviteUrl, 'link')}
                className="shrink-0"
              >
                {copiedField === 'link' ? (
                  <>
                    <Check className="w-4 h-4" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    링크 복사
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 초대 수락 화면 테스트 링크 & 닫기 */}
          <div className="pt-3 border-t border-surface-border flex flex-wrap items-center justify-between gap-2">
            {invitePath && (
              <Link
                to={invitePath}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-dark hover:underline"
              >
                초대받은 화면 미리보기
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            <Button variant="secondary" onClick={onClose} className="ml-auto">
              닫기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
