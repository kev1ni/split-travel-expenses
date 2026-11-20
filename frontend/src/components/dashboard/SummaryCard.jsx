import { Card } from '../common/Card';

export function SummaryCard({
  icon: Icon,
  label,
  value,
  subText,
  accentClass = 'bg-primary-light text-primary-dark',
}) {
  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="space-y-1.5 min-w-0">
        <p className="text-sm font-medium text-ink-secondary">{label}</p>
        <p className="text-2xl sm:text-[26px] font-extrabold text-ink-main tracking-tight truncate">
          {value}
        </p>
        {subText && (
          <p className="text-xs text-ink-secondary leading-relaxed">{subText}</p>
        )}
      </div>
      {Icon && (
        <div
          className={`w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 ${accentClass}`}
          aria-hidden="true"
        >
          <Icon className="w-6 h-6" />
        </div>
      )}
    </Card>
  );
}
