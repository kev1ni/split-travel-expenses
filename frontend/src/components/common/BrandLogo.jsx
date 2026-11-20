import { Luggage, Plane } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BrandLogo({
  to = '/',
  size = 'md',
  showSubtitle = false,
  asLink = true,
  className = '',
}) {
  const sizes = {
    sm: {
      badge: 'w-8 h-8 rounded-[12px]',
      icon: 'w-4 h-4',
      text: 'text-lg',
    },
    md: {
      badge: 'w-10 h-10 rounded-[14px]',
      icon: 'w-5 h-5',
      text: 'text-xl',
    },
    lg: {
      badge: 'w-14 h-14 rounded-[18px]',
      icon: 'w-7 h-7',
      text: 'text-3xl',
    },
  };

  const s = sizes[size] || sizes.md;

  const content = (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <span
        className={`relative inline-flex items-center justify-center bg-primary text-ink-main shadow-green-glow ${s.badge}`}
        aria-hidden="true"
      >
        <Luggage className={s.icon} strokeWidth={2.2} />
        <Plane
          className="w-3 h-3 text-primary-dark absolute -top-1 -right-1 bg-surface-card rounded-full p-0.5 shadow-sm"
          strokeWidth={2.5}
        />
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`font-extrabold tracking-tight text-ink-main ${s.text}`}>
          N빵트립
        </span>
        {showSubtitle && (
          <span className="text-xs font-medium text-ink-secondary">NTrip</span>
        )}
      </span>
    </span>
  );

  if (!asLink) {
    return content;
  }

  return (
    <Link
      to={to}
      className="inline-flex items-center rounded-xl transition-opacity hover:opacity-90"
      aria-label="N빵트립 홈"
    >
      {content}
    </Link>
  );
}
