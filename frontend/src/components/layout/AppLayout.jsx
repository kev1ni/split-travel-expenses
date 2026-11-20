import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Compass,
  Wallet,
  Scale,
  LogOut,
  UserCircle2,
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/home', label: '홈', icon: Home },
  { to: '/trips', label: '내 여행', icon: Compass },
  { to: '/expenses', label: '경비 관리', icon: Wallet },
  { to: '/settlements', label: '정산 내역', icon: Scale },
];

export function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col">
      {/* 상단 네비게이션 바 (최대 1200px 중앙 정렬) */}
      <header className="sticky top-0 z-30 bg-surface-card/90 backdrop-blur-md border-b border-surface-border/80">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <BrandLogo to="/home" size="sm" />

            {/* 데스크톱 상단 내비게이션 */}
            <nav className="hidden md:flex items-center gap-1" aria-label="주요 메뉴">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [
                      'inline-flex items-center gap-2 px-4 py-2 rounded-[14px] text-sm font-semibold transition-colors',
                      isActive
                        ? 'bg-primary-light/85 text-primary-dark'
                        : 'text-ink-secondary hover:text-ink-main hover:bg-surface-bg',
                    ].join(' ')
                  }
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* 우측 프로필 & 로그아웃 */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-bg">
              <span className="w-6 h-6 rounded-full bg-primary-light text-primary-dark inline-flex items-center justify-center">
                <UserCircle2 className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-ink-main max-w-[100px] truncate">
                {user?.nickname || '여행자'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[14px] text-sm font-semibold text-ink-secondary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
              aria-label="로그아웃"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 영역 (데스크톱 최대 1200px) */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-7 pb-24 md:pb-14 ntrip-page-enter">
        {children}
      </main>

      {/* 모바일 하단 탭 내비게이션 */}
      <nav
        aria-label="모바일 하단 메뉴"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-card/95 backdrop-blur-md border-t border-surface-border px-2 py-1.5"
      >
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center justify-center gap-1 py-1.5 rounded-[14px] text-[11px] font-semibold transition-colors',
                  isActive
                    ? 'text-primary-dark bg-primary-light/75'
                    : 'text-ink-secondary hover:text-ink-main',
                ].join(' ')
              }
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
