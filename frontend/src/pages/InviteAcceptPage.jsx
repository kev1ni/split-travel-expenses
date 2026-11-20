import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MailOpen,
  Calendar,
  Users,
  MapPin,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { tripService } from '../services/tripService';
import { formatDateRange } from '../utils/formatters';

export function InviteAcceptPage() {
  const { inviteCode } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');

    tripService
      .getInvitationPreview(inviteCode, user)
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch((err) => {
        if (active) setError(err.message || '초대 정보를 불러올 수 없어요.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [inviteCode, user]);

  const handleJoin = async () => {
    setIsJoining(true);
    setError('');
    try {
      const result = await tripService.acceptInvitation(inviteCode, user);
      navigate(`/trips/${result.tripId}`, {
        replace: true,
        state: {
          notice: `'${result.title || preview?.title}' 여행에 성공적으로 참여했어요!`,
        },
      });
    } catch (err) {
      if (err.code === 'ALREADY_JOINED' && err.details?.tripId) {
        setPreview((prev) => (prev ? { ...prev, alreadyJoined: true } : prev));
      } else {
        setError(err.message || '여행 참여 요청 중 문제가 발생했어요.');
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center px-4 py-10 ntrip-page-enter">
      <div className="w-full max-w-[480px] space-y-6">
        <div className="flex justify-center">
          <BrandLogo to="/home" size="md" />
        </div>

        <Card padding="p-6 sm:p-8" className="rounded-[24px] shadow-soft-lg space-y-6">
          {isLoading ? (
            <LoadingSpinner label="여행 초대 정보를 확인하고 있어요..." />
          ) : error && !preview ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-extrabold text-ink-main">
                  초대장을 확인할 수 없어요
                </h1>
                <p className="text-sm text-ink-secondary leading-relaxed">{error}</p>
              </div>
              <Link to="/home" className="inline-block">
                <Button variant="primary">홈 대시보드로 이동</Button>
              </Link>
            </div>
          ) : preview ? (
            <>
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-[18px] bg-primary-light text-primary-dark flex items-center justify-center mx-auto">
                  <MailOpen className="w-7 h-7" aria-hidden="true" />
                </div>
                <p className="text-xs font-bold text-primary-dark">여행 초대장이 도착했어요</p>
                <h1 className="text-2xl font-extrabold text-ink-main tracking-tight">
                  {preview.title}
                </h1>
              </div>

              {/* 여행 정보 박스 */}
              <div className="p-5 rounded-[18px] bg-surface-bg border border-surface-border space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5 text-ink-main">
                  <MapPin className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
                  <span className="font-semibold">{preview.location}</span>
                </div>
                <div className="flex items-center gap-2.5 text-ink-secondary">
                  <Calendar className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
                  <span>{formatDateRange(preview.startDate, preview.endDate)}</span>
                </div>
                <div className="flex items-center gap-2.5 text-ink-secondary">
                  <Users className="w-4 h-4 text-primary-dark shrink-0" aria-hidden="true" />
                  <span>현재 참여 인원 {preview.memberCount}명</span>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 rounded-[14px] bg-danger/10 text-danger text-sm font-medium"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {preview.alreadyJoined ? (
                <div className="space-y-4">
                  <div
                    role="status"
                    className="flex items-start gap-2.5 p-4 rounded-[16px] bg-primary-light/65 border border-primary/50 text-primary-dark text-sm font-semibold"
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <p>이미 참여 중인 여행이에요! 중복 참여 없이 바로 여행 페이지로 이동할 수 있어요.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <Link to="/home" className="sm:flex-1">
                      <Button variant="secondary" fullWidth>
                        홈으로
                      </Button>
                    </Link>
                    <Link to={`/trips/${preview.tripId}`} className="sm:flex-1">
                      <Button variant="primary" fullWidth>
                        여행 상세 보기
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate('/home')}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    fullWidth
                    loading={isJoining}
                    onClick={handleJoin}
                  >
                    여행 참여하기
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
