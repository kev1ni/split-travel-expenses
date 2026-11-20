const TONE_MAP = {
  green: 'bg-primary-light text-primary-dark border-primary/40',
  neutral: 'bg-surface-bg text-ink-secondary border-surface-border',
  amber: 'bg-[#FFF5E2] text-[#9E6010] border-[#F6D59B]',
  red: 'bg-[#FDECEC] text-[#C84A4A] border-[#F5BCBC]',
  blue: 'bg-[#EAF4FF] text-[#2864A8] border-[#C5DFFA]',
};

export function StatusBadge({ children, tone = 'green', className = '' }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap',
        TONE_MAP[tone] || TONE_MAP.neutral,
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
