export function InputField({
  id,
  label,
  error,
  helperText,
  required = false,
  rightElement = null,
  className = '',
  inputClassName = '',
  ...props
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-ink-main"
        >
          {label}
          {required && (
            <span className="text-danger ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : helperText ? `${id}-help` : undefined}
          className={[
            'w-full min-h-[48px] px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main',
            'placeholder:text-ink-secondary/75 border transition-all duration-150',
            error
              ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/20'
              : 'border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40',
            rightElement ? 'pr-12' : '',
            inputClassName,
          ].join(' ')}
          {...props}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger pl-1">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${id}-help`} className="text-xs text-ink-secondary pl-1">
          {helperText}
        </p>
      )}
    </div>
  );
}
