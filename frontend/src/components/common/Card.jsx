export function Card({
  children,
  className = '',
  padding = 'p-5 sm:p-6',
  hoverable = false,
  ...props
}) {
  return (
    <div
      className={[
        'bg-surface-card border border-surface-border rounded-card shadow-soft',
        hoverable
          ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-lg hover:border-primary'
          : '',
        padding,
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
