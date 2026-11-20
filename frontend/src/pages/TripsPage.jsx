import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  KeyRound,
  Plane,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { InputField } from '../components/common/InputField';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { TripCard } from '../components/trips/TripCard';
import { InviteFriendModal } from '../components/trips/InviteFriendModal';
import { MemberList } from '../components/trips/MemberList';
import { tripService } from '../services/tripService';
import { getTripPhase } from '../utils/tripHelpers';

const PHASE_TABS = [
  { id: 'ALL', label: '전체' },
  { id: 'ONGOING', label: '진행 중' },
  { id: 'UPCOMING', label: '예정' },
  { id: 'COMPLETED', label: '종료' },
];

export function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [phaseFilter, setPhaseFilter] = useState('ALL');
  const [showInviteCodeBox, setShowInviteCodeBox] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const [inviteModalTrip, setInviteModalTrip] = useState(null);
  const [memberModalTrip, setMemberModalTrip] = useState(null);
  const [memberModalList, setMemberModalList] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const loadTrips = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await tripService.getTrips();
      setTrips(res?.trips || res || []);
    } catch (err) {
      setError(err.message || '여행 목록을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const counts = useMemo(() => {
    const ongoing = trips.filter((t) => getTripPhase(t) === 'ONGOING').length;
    const upcoming = trips.filter((t) => getTripPhase(t) === 'UPCOMING').length;
    const completed = trips.filter((t) => getTripPhase(t) === 'COMPLETED').length;
    return {
      ALL: trips.length,
      ONGOING: ongoing,
      UPCOMING: upcoming,
      COMPLETED: completed,
    };
  }, [trips]);

  const groupedSections = useMemo(() => {
    const order = [
      { id: 'ONGOING', title: '진행 중인 여행' },
      { id: 'UPCOMING', title: '예정된 여행' },
      { id: 'COMPLETED', title: '종료된 여행' },
    ];

    if (phaseFilter !== 'ALL') {
      const target = order.find((s) => s.id === phaseFilter);
      const items = trips.filter((t) => getTripPhase(t) === phaseFilter);
      return [{ id: phaseFilter, title: target?.title || '', items }];
    }

    return order
      .map((section) => ({
        ...section,
        items: trips.filter((t) => getTripPhase(t) === section.id),
      }))
      .filter((section) => section.items.length > 0);
  }, [trips, phaseFilter]);

  const handleInviteCodeSubmit = (e) => {
    e.preventDefault();
    const code = inviteCodeInput.trim();
    if (!code) return;
    navigate(`/invite/${encodeURIComponent(code)}`);
  };

  const handleOpenMemberModal = async (trip) => {
    setMemberModalTrip(trip);
    setIsLoadingMembers(true);
    try {
      const res = await tripService.getTripMembers(trip.id);
      setMemberModalList(res?.members || res || trip.members || []);
    } catch {
      setMemberModalList(trip.members || []);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleAddGuestFromModal = async (name) => {
    if (!memberModalTrip) return;
    const result = await tripService.addGuestMember(memberModalTrip.id, { name });
    const nextMembers = result.members || [...memberModalList, result.member];
    setMemberModalList(nextMembers);
    setTrips((prev) =>
      prev.map((t) =>
        t.id === memberModalTrip.id
          ? { ...t, members: nextMembers, memberCount: nextMembers.length }
          : t
      )
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* 상단 헤더 */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-ink-main tracking-tight">
            내 여행
          </h1>

          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowInviteCodeBox((prev) => !prev)}
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              초대 코드 입력
            </Button>
            <Link to="/trips/new">
              <Button variant="primary" size="md">
                <Plus className="w-4 h-4" aria-hidden="true" />
                새 여행 만들기
              </Button>
            </Link>
          </div>
        </section>

        {/* 초대 코드 참여 입력창 (토글) */}
        {showInviteCodeBox && (
          <Card padding="p-5" className="animate-fade-up">
            <form
              onSubmit={handleInviteCodeSubmit}
              className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
            >
              <InputField
                id="trip-invite-code-input"
                label="초대 코드로 여행 참여"
                placeholder="친구에게 받은 초대 코드를 입력하세요"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" variant="primary" size="md">
                초대 확인
              </Button>
            </form>
          </Card>
        )}

        {/* 진행 중 / 예정 / 종료 필터 탭 */}
        <div
          role="tablist"
          aria-label="여행 상태 필터"
          className="inline-flex flex-wrap items-center gap-2"
        >
          {PHASE_TABS.map((tab) => {
            const active = phaseFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPhaseFilter(tab.id)}
                className={[
                  'px-4 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer',
                  active
                    ? 'bg-ink-main text-white'
                    : 'bg-surface-card text-ink-secondary hover:text-ink-main border border-surface-border',
                ].join(' ')}
              >
                {tab.label}
                <span className="ml-1.5 opacity-80">{counts[tab.id]}</span>
              </button>
            );
          })}
        </div>

        {/* 여행 목록 본문 */}
        {isLoading ? (
          <LoadingSpinner label="여행 목록을 불러오고 있어요..." />
        ) : error ? (
          <Card className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-danger text-sm font-semibold">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={loadTrips}>
              <RefreshCw className="w-4 h-4" />
              다시 시도
            </Button>
          </Card>
        ) : trips.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="아직 참여 중인 여행이 없어요"
            description="새로운 여행을 만들거나 친구에게 받은 초대 코드로 여행에 합류해 보세요."
            action={
              <Link to="/trips/new">
                <Button variant="primary">새 여행 만들기</Button>
              </Link>
            }
          />
        ) : groupedSections.every((s) => s.items.length === 0) ? (
          <EmptyState
            icon={Plane}
            title="해당 상태의 여행이 없어요"
            description="다른 상태 탭을 선택하거나 새로운 여행 일정을 만들어 보세요."
          />
        ) : (
          <div className="space-y-8">
            {groupedSections.map((section) => (
              <section key={section.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-ink-main">
                    {section.title}
                    <span className="ml-1.5 text-sm font-semibold text-ink-secondary">
                      {section.items.length}
                    </span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {section.items.map((trip) => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      onInvite={(target) => setInviteModalTrip(target)}
                      onManageMembers={handleOpenMemberModal}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* 친구 초대 모달 */}
        <InviteFriendModal
          isOpen={Boolean(inviteModalTrip)}
          onClose={() => setInviteModalTrip(null)}
          trip={inviteModalTrip}
        />

        {/* 멤버 관리 모달 */}
        <Modal
          isOpen={Boolean(memberModalTrip)}
          onClose={() => setMemberModalTrip(null)}
          title={memberModalTrip ? `${memberModalTrip.title} 멤버 관리` : '멤버 관리'}
          subtitle="참여 중인 친구를 확인하고 비회원 친구를 추가할 수 있어요."
          maxWidth="max-w-2xl"
        >
          {isLoadingMembers ? (
            <LoadingSpinner label="멤버 정보를 불러오고 있어요..." />
          ) : (
            <MemberList
              members={memberModalList}
              onAddGuest={handleAddGuestFromModal}
              onOpenInvite={() => {
                const target = memberModalTrip;
                setMemberModalTrip(null);
                setInviteModalTrip(target);
              }}
            />
          )}
        </Modal>
      </div>
    </AppLayout>
  );
}
