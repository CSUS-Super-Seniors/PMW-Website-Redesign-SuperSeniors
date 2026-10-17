import { useEffect } from 'react';
import { Button } from './Button';

export interface ToastProps {
  message: string;
  onUndo?: () => void;
  onDismiss?: () => void;
  duration?: number;
  className?: string;
}

export function Toast({ message, onUndo, onDismiss, duration = 5000, className = '' }: ToastProps) {
  useEffect(() => {
    if (!onDismiss || duration <= 0) return;

    const timeoutId = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm',
        'items-center gap-3 rounded-lg border border-success',
        'bg-success-light p-4 text-dark-brown shadow-overlay',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white"
      >
        ✓
      </span>

      <p className="type-body min-w-0 flex-1 break-words">{message}</p>

      {onUndo && (
        <Button variant="outline" onClick={onUndo} className="shrink-0">
          Undo
        </Button>
      )}

      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="type-body flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
