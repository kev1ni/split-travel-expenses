import { Link } from 'react-router-dom';
import {
  Luggage,
  Plane,
  Coins,
  CreditCard,
  MapPin,
  ReceiptText,
  Calculator,
  PieChart,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { useAuth } from '../hooks/useAuth';

const FEATURES = [
  {
    icon: ReceiptText,
    title: '여행 경비 기록',
    description:
      '여행 중 발생한 현금·카드 지출을 몇 초 만에 기록하고, 카드 승인 알림도 간편하게 정리해요.',
    badge: '간편 입력',
  },
  {
    icon: Calculator,
    title: '자동 N빵 정산',
    description:
      '누가 누구에게 얼마를 보내야 하는지 자동으로 계산해, 여행이 끝난 뒤에도 깔끔하게 정산해요.',
    badge: '자동 계산',
  },
  {
    icon: PieChart,
    title: '한눈에 보는 지출',
    description:
      '식비·숙박·교통 등 카테고리별 지출과 전체 여행 경비 흐름을 한눈에 시각화해 보여줘요.',
    badge: '지출 분석',
  },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col relative overflow-hidden">
      {/* 은은한 배경 연두색 원형/곡선 데코 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-[380px] h-[380px] rounded-full bg-primary-light/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[340px] -left-32 w-[320px] h-[320px] rounded-full bg-primary/25 blur-3xl"
      />

      {/* 상단 헤더 */}
      <header className="sticky top-0 z-30 bg-surface-bg/85 backdrop-blur-md border-b border-surface-border/70">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <BrandLogo to="/" size="sm" />

          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <Link to="/home">
                <Button size="sm" variant="primary">
                  홈 대시보드
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button size="sm" variant="ghost">
                    로그인
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" variant="primary">
                    회원가입
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 메인 히어로 섹션 */}
      <main className="flex-1 relative z-10 ntrip-page-enter">
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-card border border-surface-border text-xs sm:text-sm font-semibold text-primary-dark shadow-soft">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                친구들과 떠나는 스마트한 여행 정산
              </span>
            </div>

            {/* 중앙 브랜드 로고 */}
            <div className="flex justify-center pt-2">
              <BrandLogo asLink={false} size="lg" />
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-ink-main tracking-tight leading-[1.22]">
              여행은 함께,
              <br className="sm:hidden" />{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-primary-dark">정산은 간편하게!</span>
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 left-0 right-0 h-3 bg-primary/45 rounded-full -z-0"
                />
              </span>
            </h1>

            <p className="text-base sm:text-lg text-ink-secondary leading-relaxed max-w-xl mx-auto">
              친구들과의 여행, 복잡한 경비 계산은 이제 그만!
              <br />
              N빵트립에서 여행 경비를 기록하고 쉽고 빠르게 정산하세요.
            </p>

            {/* CTA 버튼 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 max-w-md mx-auto">
              <Link to="/signup" className="sm:flex-1">
                <Button size="lg" variant="primary" fullWidth>
                  시작하기
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </Button>
              </Link>
              <Link to="/login" className="sm:flex-1">
                <Button size="lg" variant="secondary" fullWidth>
                  로그인
                </Button>
              </Link>
            </div>
          </div>

          {/* 여행 + 정산 감성 일러스트 / 미니 프리뷰 비주얼 */}
          <div className="mt-14 sm:mt-16 max-w-3xl mx-auto relative">
            {/* 떠다니는 여행/정산 아이콘 배지 */}
            <div
              aria-hidden="true"
              className="hidden sm:flex items-center justify-center w-12 h-12 rounded-[16px] bg-surface-card border border-surface-border shadow-soft text-primary-dark absolute -top-5 -left-4 animate-float-slow"
            >
              <Plane className="w-6 h-6" />
            </div>
            <div
              aria-hidden="true"
              className="hidden sm:flex items-center justify-center w-12 h-12 rounded-[16px] bg-primary text-ink-main shadow-green-glow absolute -top-4 -right-3 animate-float-slow"
              style={{ animationDelay: '0.8s' }}
            >
              <Coins className="w-6 h-6" />
            </div>
            <div
              aria-hidden="true"
              className="hidden sm:flex items-center justify-center w-11 h-11 rounded-[14px] bg-surface-card border border-surface-border shadow-soft text-primary-dark absolute -bottom-4 left-10 animate-float-slow"
              style={{ animationDelay: '1.4s' }}
            >
              <MapPin className="w-5 h-5" />
            </div>

            <div className="bg-surface-card border border-surface-border rounded-[24px] shadow-soft-lg p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-surface-border">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-[14px] bg-primary-light text-primary-dark flex items-center justify-center">
                    <Luggage className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-primary-dark">
                      여행 정산 미리보기
                    </p>
                    <h2 className="text-base sm:text-lg font-extrabold text-ink-main">
                      오사카 우정 여행 · 4명
                    </h2>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-primary-light text-primary-dark text-xs font-bold">
                  총 지출 850,000원
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-[16px] bg-surface-bg border border-surface-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] bg-surface-card text-primary-dark flex items-center justify-center border border-surface-border shrink-0">
                    <CreditCard className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-secondary">카드 알림 등록</p>
                    <p className="text-sm font-bold text-ink-main truncate">난바 호텔 480,000원</p>
                  </div>
                </div>

                <div className="p-4 rounded-[16px] bg-surface-bg border border-surface-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] bg-surface-card text-primary-dark flex items-center justify-center border border-surface-border shrink-0">
                    <Coins className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-secondary">1인당 균등 정산</p>
                    <p className="text-sm font-bold text-primary-dark truncate">212,500원 / 인</p>
                  </div>
                </div>

                <div className="p-4 rounded-[16px] bg-primary-light/55 border border-primary/40 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] bg-surface-card text-primary-dark flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-primary-dark font-medium">정산 요약</p>
                    <p className="text-sm font-bold text-ink-main truncate">송금 2건으로 완료</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 하단 서비스 소개 (3개 카드) */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="text-center max-w-xl mx-auto mb-10">
            <p className="text-sm font-bold text-primary-dark">왜 N빵트립인가요?</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink-main mt-1.5 tracking-tight">
              여행의 즐거움만 남기는 3가지 핵심 기능
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, description, badge }) => (
              <Card key={title} hoverable padding="p-6 sm:p-7" className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-[16px] bg-primary-light text-primary-dark flex items-center justify-center">
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-surface-bg border border-surface-border text-xs font-semibold text-ink-secondary">
                    {badge}
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-extrabold text-ink-main">{title}</h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    {description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* 푸터 */}
      <footer className="border-t border-surface-border bg-surface-card/80 relative z-10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <BrandLogo to="/" size="sm" />
            <span className="hidden sm:inline text-surface-border">|</span>
            <p className="text-xs sm:text-sm text-ink-secondary">
              대학교 심화프로그래밍 4인 팀 프로젝트 · 친구들과 함께 쓰는 여행 경비 정산 웹앱
            </p>
          </div>
          <p className="text-xs text-ink-secondary">© 2026 NTrip (N빵트립)</p>
        </div>
      </footer>
    </div>
  );
}
