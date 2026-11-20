import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ label = '불러오는 중이에요...', fullScreen = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-ink-secondary ${
        fullScreen ? 'min-h-screen bg-surface-bg' : 'py-12'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="w-12 h-12 rounded-2xl bg-primary-light/70 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-dark animate-spin" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
