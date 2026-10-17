export interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ message, onDismiss, className = '' }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={[
        'flex w-full items-start gap-3 rounded-lg border border-error',
        'bg-error-light p-4 text-dark-brown',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-error text-white"
      >
        !
      </span>

      <p className="type-body min-w-0 flex-1 break-words">{message}</p>

      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="type-body flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
