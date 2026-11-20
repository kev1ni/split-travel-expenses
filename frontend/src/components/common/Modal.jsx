import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-main/40 backdrop-blur-[2px] animate-fade-up"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} bg-surface-card rounded-modal border border-surface-border shadow-soft-lg overflow-hidden max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-surface-border/70">
          <div>
            <h2 id="modal-title" className="text-lg sm:text-xl font-bold text-ink-main">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-ink-secondary mt-1">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-ink-secondary hover:bg-surface-bg hover:text-ink-main transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
