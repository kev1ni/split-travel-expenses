export function EmptyState({ icon: Icon, title, description, action = null }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-[18px] bg-surface-bg/70 border border-dashed border-surface-border">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-primary-light/80 text-primary-dark flex items-center justify-center mb-3">
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink-main">{title}</p>
      {description && (
        <p className="text-sm text-ink-secondary mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
