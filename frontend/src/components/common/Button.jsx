import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary:
    'bg-primary hover:bg-primary-hover text-ink-main font-semibold shadow-green-glow active:scale-[0.99]',
  secondary:
    'bg-surface-card hover:bg-surface-bg text-ink-main border border-surface-border font-semibold',
  soft:
    'bg-primary-light hover:bg-[#d1efaa] text-primary-dark font-semibold',
  ghost:
    'bg-transparent hover:bg-primary-light/60 text-ink-main font-medium',
  danger:
    'bg-danger/10 hover:bg-danger/20 text-danger font-semibold border border-danger/20',
};

const SIZE_CLASSES = {
  sm: 'min-h-[38px] px-3.5 py-2 text-sm rounded-[14px]',
  md: 'min-h-[46px] px-5 py-2.5 text-[15px] rounded-[16px]',
  lg: 'min-h-[52px] px-7 py-3 text-base rounded-[18px]',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer',
        'disabled:opacity-55 disabled:cursor-not-allowed disabled:shadow-none',
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
